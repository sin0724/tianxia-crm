import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { kstStartOfMonth, kstDateString } from '@/lib/datetime'
import {
  DEFAULT_KPI_METRICS,
  LEGACY_KPI_ENTRY_TYPE,
  type KpiMetricKind,
} from '@/lib/constants'

// ── 타입 ──────────────────────────────────────────────────────
// KPI는 모두 "이번 달" 단위로 집계 (2026-08 변경).
// 항목·목표치는 kpi_metrics 테이블에서 관리자가 조정하므로 코드에 고정값이 없다.
// 실적은 종류를 가리지 않고 kpi_entries 한 곳에 쌓인다 — 미팅 자동 기록도 마찬가지라
// 담당자가 "무엇이 언제 집계됐는지"를 화면에서 그대로 확인할 수 있다.

export interface KpiMetric {
  id: string
  key: string
  label: string
  kind: KpiMetricKind
  monthly_target: number
  sort_order: number
  is_active: boolean
  is_default: boolean
}

export interface KpiRow {
  userId: string
  name: string
  /** metric_key → 이번 달 실적 건수 */
  counts: Record<string, number>
}

export interface KpiEntry {
  id: string
  user_id: string
  metric_key: string
  entry_type: string
  topic: string | null
  entry_date: string
  source: 'manual' | 'auto'
  company_id: string | null
  ref_activity_id: string | null
  created_at: string
  companies: { company_name: string } | null
}

const METRIC_SELECT = 'id, key, label, kind, monthly_target, sort_order, is_active, is_default'

// ── KPI 항목 ──────────────────────────────────────────────────

/** kpi_metrics가 아직 없거나 비어 있을 때 쓰는 기본 항목 */
function fallbackMetrics(): KpiMetric[] {
  return DEFAULT_KPI_METRICS.map(m => ({ ...m, id: m.key, is_active: true }))
}

/**
 * KPI 항목 목록 (정렬 순). 기본은 활성 항목만.
 * 비활성 항목은 새 기록을 받지 않지만 과거 실적은 남아 있으므로,
 * 지난 기록을 이름으로 보여줄 때는 includeInactive로 함께 가져온다.
 */
export async function getKpiMetrics(includeInactive = false): Promise<KpiMetric[]> {
  const supabase = await createClient()
  let q = supabase.from('kpi_metrics').select(METRIC_SELECT).order('sort_order').order('label')
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error || !data || data.length === 0) return fallbackMetrics()
  return data as KpiMetric[]
}

/**
 * 설정 화면용 — 숨김 항목까지 전부, 폴백 없이.
 * 아직 시드되지 않았으면 빈 배열이라 화면에서 '기본 항목 만들기'를 안내할 수 있다.
 */
export async function getAllKpiMetrics(): Promise<KpiMetric[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kpi_metrics')
    .select(METRIC_SELECT)
    .order('sort_order')
    .order('label')
  return (data as KpiMetric[]) ?? []
}

/** 미팅 자동 기록이 종류를 못 정했을 때 들어갈 항목 */
export function defaultMeetingMetric(metrics: KpiMetric[]): KpiMetric | null {
  const meetings = metrics.filter(m => m.kind === 'meeting' && m.is_active)
  return meetings.find(m => m.is_default) ?? meetings[0] ?? null
}

/** 서버 액션에서 미팅 항목 키만 필요할 때 (조회 1회) */
export async function getDefaultMeetingMetricKey(): Promise<string | null> {
  return defaultMeetingMetric(await getKpiMetrics())?.key ?? null
}

// ── 대상 유저 결정 ────────────────────────────────────────────
// KPI는 영업 실무자(sales) 지표 — admin/manager는 감독 대상인 영업사원만 조회
// sales: 본인만 / manager: 같은 팀 영업사원 / admin: 전체 활성 영업사원

async function getTargetProfiles(profile: Profile): Promise<{ id: string; name: string }[]> {
  if (profile.role === 'sales') {
    return [{ id: profile.id, name: profile.name }]
  }

  const supabase = await createClient()
  let q = supabase
    .from('profiles')
    .select('id, name')
    .eq('is_active', true)
    .eq('role', 'sales')
    .order('name')

  if (profile.role === 'manager' && profile.team) {
    q = q.eq('team', profile.team)
  }

  const { data } = await q
  return data ?? []
}

// ── KPI 집계 ──────────────────────────────────────────────────

/** metric_key가 비어 있는 구 데이터도 세도록 (마이그레이션 전 기록 보호) */
function keyOf(e: { metric_key: string | null; entry_type: string }): string {
  return e.metric_key ?? LEGACY_KPI_ENTRY_TYPE[e.entry_type] ?? e.entry_type
}

/** 담당자별 이번 달 실적 (metric_key별 건수) */
export async function getKpiData(profile: Profile): Promise<KpiRow[]> {
  const supabase = await createClient()
  const targets = await getTargetProfiles(profile)
  if (targets.length === 0) return []

  const ids = targets.map(t => t.id)
  const monthStart = kstDateString(kstStartOfMonth())

  const { data: entries } = await supabase
    .from('kpi_entries')
    .select('user_id, metric_key, entry_type')
    .gte('entry_date', monthStart)
    .in('user_id', ids)

  const rows = new Map<string, KpiRow>(
    targets.map(t => [t.id, { userId: t.id, name: t.name, counts: {} }]),
  )

  for (const e of entries ?? []) {
    const row = rows.get(e.user_id)
    if (!row) continue
    const key = keyOf(e)
    row.counts[key] = (row.counts[key] ?? 0) + 1
  }

  return [...rows.values()]
}

/** 본인의 이번 달 KPI 기록 목록 — 자동 기록까지 그대로 보여주는 근거 목록 */
export async function getMyMonthKpiEntries(userId: string): Promise<KpiEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kpi_entries')
    .select(
      'id, user_id, metric_key, entry_type, topic, entry_date, source, company_id, ref_activity_id, created_at, companies(company_name)',
    )
    .eq('user_id', userId)
    .gte('entry_date', kstDateString(kstStartOfMonth()))
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  return (data as unknown as KpiEntry[]) ?? []
}
