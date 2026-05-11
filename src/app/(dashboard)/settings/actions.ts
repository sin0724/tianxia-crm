'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function updateProfileName(name: string): Promise<{ error?: string }> {
  const profile = await requireAuth()
  const trimmed = name.trim()
  if (!trimmed) return { error: '이름을 입력해주세요.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ name: trimmed })
    .eq('id', profile.id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  revalidatePath('/companies')
  revalidatePath('/dashboard')
  revalidatePath('/tasks')
  return {}
}
