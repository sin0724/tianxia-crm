import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'

// ── 내부 타입 ──────────────────────────────────────────────────

type DashCompany = {
  id: string
  status: string
  category: string | null
  source: string | null
  assigned_to: string | null
  created_at: string
  meeting_at: string | null
  next_action_at: string | null
  last_contacted_at: string | null
  contract_amount: number | null
  profiles: { id: string; name: string } | null
}

// ── 공개 타입 ──────────────────────────────────────────────────

export interface DashboardStats {
  totalCompanies: number
  newThisMonth: number
  todayActions: number
  thisWeekMeetings: number
  proposalSent: number
  contractReview: number
  contractDone: number
  contractDoneAmount: number
  longNoContact: number
}

export interface ChartRow {
  label: string
  count: number
  contractCount: number
  contractAmount: number
}

export interface DashboardData {
  stats: DashboardStats
  byAssignee: ChartRow[]
  bySource: ChartRow[]
  byCategory: ChartRow[]
  byStatus: ChartRow[]
}

// ── 날짜 헬퍼 ──────────────────────────────────────────────────

function startOfDay() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}
function endOfDay() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d
}
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
}
function startOfWeek() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}
function endOfWeek() {
  const d = startOfWeek(); d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(23, 59, 59, 999); return d
}

// ── 역할별 회사 조회 ───────────────────────────────────────────

const SELECT = [
  'id', 'status', 'category', 'source', 'assigned_to',
  'created_at', 'meeting_at', 'next_action_at', 'last_contacted_at',
  'contract_amount', 'profiles(id, name)',
].join(', ')

async function fetchCompanies(profile: Profile): Promise<DashCompany[]> {
  const supabase = await createClient()
  let q = supabase.from('companies').select(SELECT)

  if (profile.role === 'sales') {
    q = q.eq('assigned_to', profile.id)
  } else if (profile.role === 'manager' && profile.team) {
    const { data: teammates } = await supabase
      .from('profiles')
      .select('id')
      .eq('team', profile.team)
      .eq('is_active', true)
    const ids = teammates?.map(p => p.id) ?? [profile.id]
    q = q.in('assigned_to', ids)
  }

  const { data } = await q
  return (data as unknown as DashCompany[]) ?? []
}

// ── 통계 집계 ─────────────────────────────────────────────────

const EXCLUDED = new Set(['계약 완료', '실패', '제외'])

function computeStats(companies: DashCompany[]): DashboardStats {
  const todayS   = startOfDay().getTime()
  const todayE   = endOfDay().getTime()
  const monthS   = startOfMonth().getTime()
  const weekS    = startOfWeek().getTime()
  const weekE    = endOfWeek().getTime()
  const noContactCutoff = daysAgo(7).getTime()

  let newThisMonth    = 0
  let todayActions    = 0
  let thisWeekMeetings = 0
  let proposalSent    = 0
  let contractReview  = 0
  let contractDone    = 0
  let contractDoneAmount = 0
  let longNoContact   = 0

  for (const c of companies) {
    const createdAt = new Date(c.created_at).getTime()
    if (createdAt >= monthS)                                  newThisMonth++

    if (c.next_action_at && !EXCLUDED.has(c.status)) {
      const t = new Date(c.next_action_at).getTime()
      if (t >= todayS && t <= todayE)                        todayActions++
    }

    if (c.meeting_at) {
      const t = new Date(c.meeting_at).getTime()
      if (t >= weekS && t <= weekE)                          thisWeekMeetings++
    }

    if (c.status === '제안서 발송')                          proposalSent++
    if (c.status === '계약 검토')                            contractReview++
    if (c.status === '계약 완료') {
      contractDone++
      contractDoneAmount += c.contract_amount ?? 0
    }

    if (!EXCLUDED.has(c.status)) {
      const lc = c.last_contacted_at
        ? new Date(c.last_contacted_at).getTime()
        : 0
      if (!c.last_contacted_at || lc <= noContactCutoff)    longNoContact++
    }
  }

  return {
    totalCompanies: companies.length,
    newThisMonth,
    todayActions,
    thisWeekMeetings,
    proposalSent,
    contractReview,
    contractDone,
    contractDoneAmount,
    longNoContact,
  }
}

// ── 차트 집계 ─────────────────────────────────────────────────

function groupBy(
  companies: DashCompany[],
  keyFn: (c: DashCompany) => string,
): ChartRow[] {
  const map = new Map<string, ChartRow>()

  for (const c of companies) {
    const key = keyFn(c)
    const row = map.get(key) ?? { label: key, count: 0, contractCount: 0, contractAmount: 0 }
    row.count++
    if (c.status === '계약 완료') {
      row.contractCount++
      row.contractAmount += c.contract_amount ?? 0
    }
    map.set(key, row)
  }

  return [...map.values()].sort((a, b) => b.count - a.count)
}

function computeCharts(companies: DashCompany[]) {
  return {
    byAssignee: groupBy(companies, c => c.profiles?.name ?? '미배정'),
    bySource:   groupBy(companies, c => c.source ?? '미입력'),
    byCategory: groupBy(companies, c => c.category ?? '미입력'),
    byStatus:   groupBy(companies, c => c.status),
  }
}

// ── 공개 진입점 ────────────────────────────────────────────────

export async function getDashboardData(profile: Profile): Promise<DashboardData> {
  const companies = await fetchCompanies(profile)
  return {
    stats: computeStats(companies),
    ...computeCharts(companies),
  }
}
