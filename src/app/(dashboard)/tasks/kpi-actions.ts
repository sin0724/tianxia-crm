'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { kstDateString } from '@/lib/datetime'
import { KPI_ENTRY_TYPES } from '@/lib/constants'

interface ActionResult {
  error: string
}

/** KPI 활동(KOL 제안 / 스레드 업로드) 기록 — 회사에 묶이지 않는 개인 활동 */
export async function logKpiEntry(
  entryType: string,
  topic: string | null,
): Promise<ActionResult | undefined> {
  const profile = await requireAuth()

  if (!(KPI_ENTRY_TYPES as readonly string[]).includes(entryType)) {
    return { error: '유효하지 않은 KPI 유형입니다.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('kpi_entries').insert({
    user_id:    profile.id,
    entry_type: entryType,
    topic:      topic?.trim() || null,
    entry_date: kstDateString(),
  })

  if (error) return { error: error.message }

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}

/** 잘못 누른 KPI 기록 취소 (본인 것만, RLS가 보장) */
export async function deleteKpiEntry(id: string): Promise<ActionResult | undefined> {
  await requireAuth()
  const supabase = await createClient()

  const { data: deleted, error } = await supabase
    .from('kpi_entries')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!deleted || deleted.length === 0) return { error: '삭제할 수 없는 기록입니다.' }

  revalidatePath('/tasks')
  revalidatePath('/dashboard')
}
