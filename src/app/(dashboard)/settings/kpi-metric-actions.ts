'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { DEFAULT_KPI_METRICS, KPI_METRIC_KINDS, type KpiMetricKind } from '@/lib/constants'

// ── KPI 항목 관리 (admin 전용) ────────────────────────────────
// 항목 이름·월 목표치·표시 순서를 관리자가 직접 조정한다.
// key는 실적(kpi_entries.metric_key)과 잇는 불변 식별자라 생성 시에만 정하고 이후 바꾸지 않는다.

interface ActionResult {
  error?: string
}

export interface KpiMetricInput {
  label: string
  kind: KpiMetricKind
  monthly_target: number
  sort_order?: number
  is_active?: boolean
  is_default?: boolean
}

function revalidateAll() {
  revalidatePath('/settings')
  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}

async function requireAdmin(): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  if (profile.role !== 'admin') return { error: 'KPI 항목은 관리자만 변경할 수 있습니다.' }
}

function validate(input: Partial<KpiMetricInput>): ActionResult | undefined {
  if (input.label !== undefined && !input.label.trim()) {
    return { error: '항목 이름을 입력해주세요.' }
  }
  if (input.kind !== undefined && !(KPI_METRIC_KINDS as readonly string[]).includes(input.kind)) {
    return { error: '유효하지 않은 기록 방식입니다.' }
  }
  if (input.monthly_target !== undefined) {
    if (!Number.isInteger(input.monthly_target) || input.monthly_target < 0) {
      return { error: '월 목표는 0 이상의 정수여야 합니다.' }
    }
  }
}

// 이름(한글)은 자유롭게 바뀌므로 key는 이름에서 뽑지 않고 종류 + 타임스탬프로 만든다.
function newKey(kind: KpiMetricKind): string {
  return `${kind}_${Date.now().toString(36)}`
}

export async function createKpiMetric(input: KpiMetricInput): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied
  const invalid = validate(input)
  if (invalid) return invalid

  const supabase = await createClient()

  // 새 항목은 목록 맨 뒤에
  const { data: last } = await supabase
    .from('kpi_metrics')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('kpi_metrics').insert({
    key:            newKey(input.kind),
    label:          input.label.trim(),
    kind:           input.kind,
    monthly_target: input.monthly_target,
    sort_order:     (last?.sort_order ?? 0) + 1,
    is_active:      true,
    is_default:     false,
  })
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

export async function updateKpiMetric(
  id: string,
  changes: Partial<KpiMetricInput>,
): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied
  const invalid = validate(changes)
  if (invalid) return invalid

  const supabase = await createClient()

  const update: Record<string, string | number | boolean> = {}
  if (changes.label !== undefined)          update.label = changes.label.trim()
  if (changes.monthly_target !== undefined) update.monthly_target = changes.monthly_target
  if (changes.sort_order !== undefined)     update.sort_order = changes.sort_order
  if (changes.is_active !== undefined)      update.is_active = changes.is_active
  // kind는 실적 집계 방식이 달라 바꾸면 과거 기록의 의미가 흔들리므로 수정 대상에서 제외한다.

  if (Object.keys(update).length > 0) {
    const { data: updated, error } = await supabase
      .from('kpi_metrics')
      .update(update)
      .eq('id', id)
      .select('id')
    if (error) return { error: error.message }
    if (!updated || updated.length === 0) return { error: '변경되지 않았습니다.' }
  }

  // 기본 미팅 항목은 하나뿐이어야 한다 — 새로 지정하면 나머지를 내린다
  if (changes.is_default) {
    const { data: target } = await supabase
      .from('kpi_metrics')
      .select('id, kind')
      .eq('id', id)
      .maybeSingle()
    if (target?.kind !== 'meeting') {
      return { error: '기본값은 미팅 자동 기록 항목에만 지정할 수 있습니다.' }
    }
    await supabase.from('kpi_metrics').update({ is_default: false }).eq('kind', 'meeting')
    const { error } = await supabase.from('kpi_metrics').update({ is_default: true }).eq('id', id)
    if (error) return { error: error.message }
  }

  revalidateAll()
  return {}
}

/**
 * 항목 삭제. 이미 쌓인 실적이 있으면 지우지 않고 '숨김'(is_active=false)을 권한다 —
 * 삭제하면 과거 달의 집계에서 그 항목이 통째로 사라져 지난 실적을 대조할 수 없다.
 */
export async function deleteKpiMetric(id: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { data: metric } = await supabase
    .from('kpi_metrics')
    .select('key, label')
    .eq('id', id)
    .maybeSingle()
  if (!metric) return { error: '항목을 찾을 수 없습니다.' }

  const { count } = await supabase
    .from('kpi_entries')
    .select('id', { count: 'exact', head: true })
    .eq('metric_key', metric.key)

  if ((count ?? 0) > 0) {
    return {
      error: `'${metric.label}'에 이미 ${count}건의 실적이 있어 삭제할 수 없습니다. 숨김으로 바꾸면 새 기록만 막고 지난 실적은 남습니다.`,
    }
  }

  const { error } = await supabase.from('kpi_metrics').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

/** 항목이 하나도 없을 때 기본 5종(KOL 제안·스레드·미팅 3종)을 만든다 */
export async function seedDefaultKpiMetrics(): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { count } = await supabase.from('kpi_metrics').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return { error: '이미 KPI 항목이 있습니다.' }

  const { error } = await supabase.from('kpi_metrics').insert(
    DEFAULT_KPI_METRICS.map(m => ({ ...m, is_active: true })),
  )
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}

/** 표시 순서 변경 — 위/아래 버튼용 (두 항목의 sort_order를 맞바꾼다) */
export async function swapKpiMetricOrder(idA: string, idB: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const { data } = await supabase.from('kpi_metrics').select('id, sort_order').in('id', [idA, idB])
  if (!data || data.length !== 2) return { error: '순서를 바꿀 항목을 찾지 못했습니다.' }

  const [a, b] = data
  await supabase.from('kpi_metrics').update({ sort_order: b.sort_order }).eq('id', a.id)
  const { error } = await supabase.from('kpi_metrics').update({ sort_order: a.sort_order }).eq('id', b.id)
  if (error) return { error: error.message }

  revalidateAll()
  return {}
}
