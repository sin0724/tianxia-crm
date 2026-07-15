import { createClient } from '@/lib/supabase/server'
import { kstStartOfDay } from '@/lib/datetime'
import { STAGE_STATUS, COMPANY_CATEGORY, COMPANY_SOURCE, type Stage } from '@/lib/constants'

export interface Company {
  id: string
  company_name: string
  category: string | null
  region: string | null
  source: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  kakao_id: string | null
  instagram_url: string | null
  naver_place_url: string | null
  website_url: string | null
  assigned_to: string | null
  assigned_at: string | null
  status: string
  inflow_date: string | null
  interest_level: number | null
  expected_amount: number | null
  contract_amount: number | null
  meeting_at: string | null
  last_contacted_at: string | null
  next_action_at: string | null
  latest_note: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
  profiles: { name: string } | null
}

export interface ProfileOption {
  id: string
  name: string
  role: string
}

export interface CompanyListFilters {
  status?: string
  stage?: string
  assigned_to?: string
  category?: string
  source?: string
  next_action?: string
  inflow_month?: string // "YYYY-MM"
  new?: string          // '1' = 신규 배정(배정됨 + 미연락)만
  q?: string
  page?: number
}

// "YYYY-MM" → 해당 월의 [시작일, 다음 달 시작일) 범위
function monthRange(month: string): { from: string; to: string } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  return { from: `${month}-01`, to: `${next}-01` }
}

export const PAGE_SIZE = 50

export interface CompanyListResult {
  companies: Company[]
  total: number
  page: number
  pageCount: number
}

export async function getCompanies(filters: CompanyListFilters = {}): Promise<CompanyListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase
    .from('companies')
    .select('id, company_name, category, region, source, status, phone, inflow_date, meeting_at, last_contacted_at, next_action_at, latest_note, assigned_to, assigned_at, profiles(name)', { count: 'exact' })
    .order('next_action_at', { ascending: true, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  // 신규 배정: 배정 시각이 있고 아직 연락 기록이 없는(미연락) 거래처.
  // 담당자가 활동을 기록하면 last_contacted_at이 채워져 자동으로 빠진다.
  if (filters.new === '1') {
    query = query.not('assigned_at', 'is', null).is('last_contacted_at', null)
  }

  if (filters.status)      query = query.eq('status', filters.status)
  if (filters.assigned_to === 'none') {
    query = query.is('assigned_to', null) // 미배정 (배분 대기)
  } else if (filters.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to)
  }
  if (filters.category)    query = query.eq('category', filters.category)
  if (filters.source)      query = query.eq('source', filters.source)

  if (filters.stage && filters.stage in STAGE_STATUS) {
    query = query.in('status', STAGE_STATUS[filters.stage as Stage])
  }

  if (filters.inflow_month) {
    const range = monthRange(filters.inflow_month)
    if (range) {
      query = query.gte('inflow_date', range.from).lt('inflow_date', range.to)
    }
  }

  if (filters.next_action === 'overdue') {
    // KST 기준 오늘 이전 = 기한 초과 (당일은 초과 아님)
    query = query
      .not('next_action_at', 'is', null)
      .lt('next_action_at', kstStartOfDay().toISOString())
  }

  if (filters.q) {
    // PostgREST or() 구문 보호: 와일드카드 이스케이프 후 값 전체를 따옴표로 감쌈
    // (쉼표·괄호가 포함된 검색어도 안전)
    const safe = filters.q.replace(/[%_\\]/g, '\\$&').replace(/"/g, '\\"')
    query = query.or(
      `company_name.ilike."%${safe}%",phone.ilike."%${safe}%",latest_note.ilike."%${safe}%"`,
    )
  }

  const { data, count } = await query
  const total = count ?? 0
  return {
    companies: (data as unknown as Company[]) ?? [],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

// 필터/폼 옵션용: DB에 실제 존재하는 구분·DB경로·유입월 값
export async function getCategorySourceOptions(): Promise<{
  categories: string[]
  sources: string[]
  inflowMonths: string[] // "YYYY-MM" 내림차순
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('category, source, inflow_date')
    .limit(5000)

  const categories = new Set<string>(COMPANY_CATEGORY)
  const sources = new Set<string>(COMPANY_SOURCE)
  const months = new Set<string>()
  for (const row of data ?? []) {
    if (row.category)    categories.add(row.category)
    if (row.source)      sources.add(row.source)
    if (row.inflow_date) months.add((row.inflow_date as string).slice(0, 7))
  }
  return {
    categories: [...categories],
    sources: [...sources],
    inflowMonths: [...months].sort().reverse(),
  }
}

/**
 * 신규 배정(배정됨 + 미연락) 거래처 수.
 * RLS로 sales는 본인 담당분만 집계되므로 "내게 새로 들어온 DB" 건수가 된다.
 */
export async function getNewAssignedCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .not('assigned_at', 'is', null)
    .is('last_contacted_at', null)
  return count ?? 0
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('*, profiles(name)')
    .eq('id', id)
    .single()
  return (data as Company) ?? null
}

// ── 배분 현황 (admin/manager) ─────────────────────────────────
// 형평성 확인용: 담당자별 보유 거래처 수와, assigned_at(배정 시각)으로
// 묶은 배분 회차별 내역. 별도 로그 테이블 없이 companies에 찍힌
// 마지막 배정 기록으로 계산하므로, 이후 재배정된 건은 새 담당자
// 쪽 회차로 옮겨져 보인다.

export interface AssigneeLoad {
  id: string
  name: string
  total: number       // 보유 거래처 수
  uncontacted: number // 배정 후 아직 연락 전 (신규 배정)
}

export interface AssignmentBatch {
  assignedAt: string
  total: number
  perAssignee: { name: string; count: number }[]
}

export interface AssignmentOverview {
  unassigned: number
  loads: AssigneeLoad[]
  batches: AssignmentBatch[]
}

export async function getAssignmentOverview(): Promise<AssignmentOverview> {
  const supabase = await createClient()
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase.from('companies').select('assigned_to, assigned_at, last_contacted_at').limit(10000),
    supabase.from('profiles').select('id, name, role, is_active').order('name'),
  ])

  const nameById = new Map((profiles ?? []).map(p => [p.id, p.name]))

  let unassigned = 0
  const totals = new Map<string, { total: number; uncontacted: number }>()
  const batchMap = new Map<string, Map<string, number>>() // assigned_at → (담당자 → 건수)

  for (const r of rows ?? []) {
    if (!r.assigned_to) {
      unassigned++
      continue
    }
    const t = totals.get(r.assigned_to) ?? { total: 0, uncontacted: 0 }
    t.total++
    if (r.assigned_at && !r.last_contacted_at) t.uncontacted++
    totals.set(r.assigned_to, t)

    if (r.assigned_at) {
      const perAssignee = batchMap.get(r.assigned_at) ?? new Map<string, number>()
      perAssignee.set(r.assigned_to, (perAssignee.get(r.assigned_to) ?? 0) + 1)
      batchMap.set(r.assigned_at, perAssignee)
    }
  }

  // 활성 영업사원은 0건이어도 표시 (배분에서 빠진 사람이 보이도록)
  const loadIds = new Set([
    ...totals.keys(),
    ...(profiles ?? []).filter(p => p.is_active && p.role === 'sales').map(p => p.id),
  ])
  const loads: AssigneeLoad[] = [...loadIds]
    .map(id => ({
      id,
      name: nameById.get(id) ?? '(알 수 없음)',
      total: totals.get(id)?.total ?? 0,
      uncontacted: totals.get(id)?.uncontacted ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'))

  const batches: AssignmentBatch[] = [...batchMap.entries()]
    .map(([assignedAt, perAssignee]) => ({
      assignedAt,
      total: [...perAssignee.values()].reduce((s, n) => s + n, 0),
      perAssignee: [...perAssignee.entries()]
        .map(([id, count]) => ({ name: nameById.get(id) ?? '(알 수 없음)', count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko')),
    }))
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .slice(0, 50)

  return { unassigned, loads, batches }
}

export async function getProfiles(): Promise<ProfileOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as ProfileOption[]
}
