import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { stageOf, STAGES, type Stage } from '@/lib/constants'
import {
  kstStartOfDay, kstEndOfDay, kstStartOfMonth,
  kstStartOfWeek, kstEndOfWeek, kstDaysAgoEnd,
} from '@/lib/datetime'

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
  overdueActions: number
  thisWeekMeetings: number
  proposalSent: number
  contractReview: number
  contractDone: number
  contractDoneAmount: number
  longNoContact: number
  unassigned: number
  stageCounts: Record<Stage, number>
  // 잠재 → 가망 이상으로 넘어간 비율 / 전체 → 계약 완료 비율
  prospectRate: number
  contractRate: number
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
  const todayS   = kstStartOfDay().getTime()
  const todayE   = kstEndOfDay().getTime()
  const monthS   = kstStartOfMonth().getTime()
  const weekS    = kstStartOfWeek().getTime()
  const weekE    = kstEndOfWeek().getTime()
  const noContactCutoff = new Date(kstDaysAgoEnd(7)).getTime()

  let newThisMonth    = 0
  let todayActions    = 0
  let overdueActions  = 0
  let thisWeekMeetings = 0
  let proposalSent    = 0
  let contractReview  = 0
  let contractDone    = 0
  let contractDoneAmount = 0
  let longNoContact   = 0
  let unassigned      = 0
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0])) as Record<Stage, number>

  for (const c of companies) {
    stageCounts[stageOf(c.status)]++
    if (!c.assigned_to && !EXCLUDED.has(c.status))            unassigned++

    const createdAt = new Date(c.created_at).getTime()
    if (createdAt >= monthS)                                  newThisMonth++

    if (c.next_action_at && !EXCLUDED.has(c.status)) {
      const t = new Date(c.next_action_at).getTime()
      if (t >= todayS && t <= todayE)                        todayActions++
      if (t < todayS)                                        overdueActions++
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

  const total = companies.length
  const reached = stageCounts['가망'] + stageCounts['고객'] // 가망 단계 이상 도달

  return {
    totalCompanies: total,
    newThisMonth,
    todayActions,
    overdueActions,
    thisWeekMeetings,
    proposalSent,
    contractReview,
    contractDone,
    contractDoneAmount,
    longNoContact,
    unassigned,
    stageCounts,
    prospectRate: total > 0 ? Math.round((reached / total) * 100) : 0,
    contractRate: total > 0 ? Math.round((stageCounts['고객'] / total) * 100) : 0,
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
