'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'

/**
 * 대시보드 배너의 알림을 읽음 처리한다.
 * RLS가 본인(user_id = auth.uid()) 행만 허용하므로 id만으로 안전하다.
 */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  await requireAuth()
  if (ids.length === 0) return

  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in('id', ids)

  revalidatePath('/dashboard')
}
