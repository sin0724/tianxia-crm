import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_KPI_METRICS,
  type KpiMetricKind,
} from '@/lib/constants'

// ── 타입 ──────────────────────────────────────────────────────
// KPI 집계 화면(대시보드·할 일)은 2026-10에 제거됐다 — KPI는 CRM 밖에서 관리한다.
// kpi_metrics는 미팅 종류(대만마케팅·공구·설명회 등) 분류용으로 계속 쓰고,
// 미팅 활동은 기존처럼 kpi_entries에도 기록된다.

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
