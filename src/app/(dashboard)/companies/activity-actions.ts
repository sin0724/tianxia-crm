'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { kstDateString } from '@/lib/datetime'
import { notifyDataRequest } from '@/lib/notifications'

interface ActionResult {
  error: string
}

export async function createActivity(
  companyId: string,
  formData: FormData,
): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const supabase = await createClient()

  const str = (k: string) => {
    const v = formData.get(k)
    return v && v !== '' ? (v as string) : null
  }

  const activity_type = str('activity_type')
  if (!activity_type) return { error: '활동 유형은 필수입니다.' }

  const activity_result = str('activity_result')
  const memo = str('memo')

  const { error } = await supabase.from('activities').insert({
    company_id:      companyId,
    user_id:         profile.id,
    activity_type,
    activity_result,
    memo,
    next_action_at:  str('next_action_at'),
  })

  if (error) return { error: error.message }

  // 알림: 활동 결과가 자료 요청인 경우
  if (activity_result === '자료 요청') {
    const { data: co } = await supabase
      .from('companies')
      .select('id, company_name, profiles(name)')
      .eq('id', companyId)
      .single()

    if (co) {
      await notifyDataRequest({
        company:      co as unknown as { id: string; company_name: string; profiles: { name: string } | null },
        activityType: activity_type,
        memo,
        userId:       profile.id,
      }).catch(() => {})
    }
  }

  // DB trigger가 companies의 last_contacted_at, latest_note, next_action_at을 자동 갱신함
  revalidatePath(`/companies/${companyId}`)
  revalidatePath('/companies')
}

/**
 * 원클릭 활동 기록 — 목록/할일 페이지의 퀵 버튼/미니 폼용.
 * nextDays를 주면 다음 액션일을 오늘 + nextDays(KST)로 설정.
 */
export async function quickLogActivity(
  companyId: string,
  activityType: string,
  activityResult: string | null,
  nextDays?: number,
  memo?: string | null,
): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const supabase = await createClient()

  let next_action_at: string | null = null
  if (nextDays !== undefined && nextDays > 0) {
    const d = new Date()
    d.setDate(d.getDate() + nextDays)
    next_action_at = kstDateString(d)
  }

  const { error } = await supabase.from('activities').insert({
    company_id:      companyId,
    user_id:         profile.id,
    activity_type:   activityType,
    activity_result: activityResult,
    memo:            memo?.trim() || null,
    next_action_at,
  })

  if (error) return { error: error.message }

  revalidatePath(`/companies/${companyId}`)
  revalidatePath('/companies')
  revalidatePath('/tasks')
}
