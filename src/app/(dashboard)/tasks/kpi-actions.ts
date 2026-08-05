'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { kstDateString } from '@/lib/datetime'
import { getKpiMetrics } from '@/lib/kpi'

interface ActionResult {
  error: string
}

function revalidateKpi() {
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}

/** KPI 활동 직접 기록 — 회사에 묶이지 않는 개인 활동 (KOL 제안 / 스레드 업로드 등) */
export async function logKpiEntry(
  metricKey: string,
  topic: string | null,
): Promise<ActionResult | undefined> {
  const profile = await requireAuth()

  // 항목 정의는 관리자가 바꾸므로 코드가 아니라 DB를 기준으로 검증한다.
  const metric = (await getKpiMetrics()).find(m => m.key === metricKey)
  if (!metric) return { error: '유효하지 않은 KPI 항목입니다.' }
  if (metric.kind !== 'manual') {
    return { error: `'${metric.label}'은(는) 미팅에서 자동 기록되는 항목입니다.` }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('kpi_entries').insert({
    user_id:    profile.id,
    metric_key: metric.key,
    entry_type: metric.label, // 항목명이 바뀌어도 당시 표기가 남도록 스냅샷
    topic:      topic?.trim() || null,
    entry_date: kstDateString(),
    source:     'manual',
  })

  if (error) return { error: error.message }

  revalidateKpi()
}

/** 잘못 잡힌 KPI 기록 취소 (본인 것만, RLS가 보장) */
export async function deleteKpiEntry(id: string): Promise<ActionResult | undefined> {
  await requireAuth()
  const supabase = await createClient()

  const { data: deleted, error } = await supabase
    .from('kpi_entries')
    .delete()
    .eq('id', id)
    .select('id, ref_activity_id')

  if (error) return { error: error.message }
  if (!deleted || deleted.length === 0) return { error: '삭제할 수 없는 기록입니다.' }

  // 자동 기록을 취소하면 활동 타임라인의 'KPI 반영' 표시도 함께 내린다.
  // (활동 기록 자체는 영업 이력이므로 남긴다)
  const activityId = deleted[0].ref_activity_id
  if (activityId) {
    await supabase.from('activities').update({ meeting_type: null }).eq('id', activityId)
  }

  revalidateKpi()
  revalidatePath('/companies')
}

/**
 * 자동 기록된 미팅의 종류를 바로잡는다.
 * 상태 변경·크론 자동 기록은 종류를 알 수 없어 기본 미팅 항목으로 들어가므로,
 * 담당자가 '대만마케팅 / 공구 / 설명회' 중 실제 미팅으로 한 번에 고칠 수 있어야 한다.
 * 근거 활동(activities.meeting_type)도 함께 고쳐 타임라인 표기와 어긋나지 않게 한다.
 */
export async function updateKpiEntryMetric(
  id: string,
  metricKey: string,
): Promise<ActionResult | undefined> {
  await requireAuth()

  const metric = (await getKpiMetrics()).find(m => m.key === metricKey)
  if (!metric) return { error: '유효하지 않은 KPI 항목입니다.' }
  if (metric.kind !== 'meeting') return { error: '미팅 종류만 변경할 수 있습니다.' }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('kpi_entries')
    .update({ metric_key: metric.key, entry_type: metric.label })
    .eq('id', id)
    .select('id, ref_activity_id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: '변경할 수 없는 기록입니다.' }

  const activityId = updated[0].ref_activity_id
  if (activityId) {
    await supabase.from('activities').update({ meeting_type: metric.key }).eq('id', activityId)
  }

  revalidateKpi()
  revalidatePath('/companies')
}
