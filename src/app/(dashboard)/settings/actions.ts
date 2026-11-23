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
  changes: {
    name?: string
    role?: 'admin' | 'manager' | 'sales'
    is_active?: boolean
    team?: string | null
    can_manage_kol?: boolean
    can_assign?: boolean
  },
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
  if (changes.can_manage_kol !== undefined || changes.role !== undefined) {
    // KOL 페이지의 등록/수정 버튼 노출 조건이 바뀜
    revalidatePath('/kol')
  }
  if (changes.name !== undefined || changes.team !== undefined
      || changes.can_assign !== undefined || changes.role !== undefined) {
    // 이름·팀은 거래처 담당자 표기·할 일·대시보드 곳곳에 쓰임
    revalidatePath('/companies')
    revalidatePath('/dashboard')
    revalidatePath('/tasks')
  }
  return {}
}

// 퇴사 처리 / 복구 (admin 전용).
// 계정을 지우면 KPI 기록이 같이 지워지고 담당 거래처가 미배정이 되므로 지우지 않는다.
// 퇴사자는 is_active = false(로그인 차단) + retired_at 기록 → 승인 대기 목록에서 빠진다.
export async function setMemberRetired(targetId: string, retired: boolean): Promise<{ error?: string }> {
  const profile = await requireAuth()
  if (profile.role !== 'admin') return { error: '관리자만 변경할 수 있습니다.' }
  if (targetId === profile.id && retired) return { error: '본인 계정은 퇴사 처리할 수 없습니다.' }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('profiles')
    .update(retired
      ? { is_active: false, retired_at: new Date().toISOString() }
      : { is_active: true, retired_at: null })
    .eq('id', targetId)
    .select('id')

  if (error) {
    if (error.message.includes('retired_at')) {
      return { error: 'DB에 퇴사 처리 컬럼(retired_at)이 아직 없습니다. Supabase SQL Editor에서 마이그레이션을 먼저 실행해주세요.' }
    }
    return { error: error.message }
  }
  if (!updated || updated.length === 0) return { error: '변경되지 않았습니다.' }

  revalidatePath('/settings')
  revalidatePath('/companies')
  revalidatePath('/dashboard')
  revalidatePath('/tasks')
  return {}
}
