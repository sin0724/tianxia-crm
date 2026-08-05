import type { SupabaseClient } from '@supabase/supabase-js'
import { kstDateString } from '@/lib/datetime'

// ── 미팅 → KPI 실적 미러링 ────────────────────────────────────
// '미팅' 활동이 생기는 경로는 셋이다.
//   1) 거래처 상태를 '미팅진행'으로 변경 (상세 폼 · 칸반 · 일괄 수정)
//   2) 활동 기록에서 유형 '미팅' 선택
//   3) 미팅 예정일이 지나면 일일 크론이 자동 기록
// 어느 경로든 여기서 kpi_entries에 같은 모양으로 쌓아, 담당자가 할 일 화면의
// 'KPI 기록' 목록에서 자기 실적이 어디서 왔는지 한눈에 확인할 수 있게 한다.
// 서버 액션(사용자 세션)과 크론(service role) 양쪽에서 쓰므로 클라이언트를 인자로 받는다.

export interface MeetingActivityRef {
  id: string
  company_id: string
  user_id: string
  meeting_type?: string | null
  created_at?: string | null
}

/**
 * 방금 만든 '미팅' 활동들을 KPI 실적으로 미러링한다.
 * 미팅 종류가 비어 있으면 기본 미팅 항목으로 넣고, 담당자가 나중에 바로잡을 수 있다.
 * KPI 기록은 보조 데이터이므로 실패해도 활동 기록 자체는 살린다.
 * (kpi_entries.ref_activity_id UNIQUE가 같은 활동의 중복 집계를 막는다)
 */
export async function logMeetingKpiEntries(
  supabase: SupabaseClient,
  activities: MeetingActivityRef[],
  fallbackMetricKey: string | null,
): Promise<number> {
  const rows = activities
    .map(a => ({
      user_id:         a.user_id,
      entry_type:      '미팅',
      metric_key:      a.meeting_type || fallbackMetricKey,
      topic:           null as string | null,
      entry_date:      kstDateString(a.created_at ? new Date(a.created_at) : new Date()),
      company_id:      a.company_id,
      source:          'auto',
      ref_activity_id: a.id,
    }))
    .filter(r => !!r.metric_key)

  if (rows.length === 0) return 0

  const { error } = await supabase.from('kpi_entries').insert(rows)
  return error ? 0 : rows.length
}

/** 기본 미팅 항목 키 — 크론처럼 admin 클라이언트만 있는 곳에서 쓴다 */
export async function fetchDefaultMeetingMetricKey(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from('kpi_metrics')
    .select('key')
    .eq('kind', 'meeting')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order')
    .limit(1)
    .maybeSingle()

  return data?.key ?? null
}
