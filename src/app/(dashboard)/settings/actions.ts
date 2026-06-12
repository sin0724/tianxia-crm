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

// ── 팀 관리 (admin 전용) ──────────────────────────────────────
// role / is_active 변경은 DB 트리거(protect_profile_fields)도 함께 검증함

export async function updateMemberAccess(
  targetId: string,
  changes: { name?: string; role?: 'admin' | 'manager' | 'sales'; is_active?: boolean; team?: string | null },
): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (profile.role !== 'admin') return { error: '관리자만 변경할 수 있습니다.' }
  if (targetId === profile.id && changes.is_active === false) {
    return { error: '본인 계정은 비활성화할 수 없습니다.' }
  }

  if (changes.name !== undefined) {
    changes.name = changes.name.trim()
    if (!changes.name) return { error: '이름을 입력해주세요.' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', targetId)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: '변경되지 않았습니다.' }

  revalidatePath('/settings')
  if (changes.name !== undefined) {
    // 이름은 거래처 담당자 표기·할 일·대시보드 곳곳에 쓰임
    revalidatePath('/companies')
    revalidatePath('/dashboard')
    revalidatePath('/tasks')
  }
  return {}
}
