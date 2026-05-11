'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
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
