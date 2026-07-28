import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'manager' | 'sales'

export interface Profile {
  id: string
  name: string
  email: string
  role: UserRole
  team: string | null
  slack_user_id: string | null
  is_active: boolean
  /** KOL 리스트 관리 권한 — role과 별개로 admin이 담당자에게 켜 준다 */
  can_manage_kol: boolean
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, name, email, role, team, slack_user_id, is_active, can_manage_kol')
    .eq('id', user.id)
    .single()

  return data ?? null
}

// 인증 필수 페이지에서 사용. 미로그인 시 /login으로 리다이렉트.
// 신규 가입자(is_active = false)는 관리자 승인 전까지 /pending으로 보냄.
export async function requireAuth(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!profile.is_active) redirect('/pending')
  return profile
}

// 특정 role만 접근 가능한 페이지에서 사용. 권한 없으면 /dashboard로 리다이렉트.
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireAuth()
  if (!roles.includes(profile.role)) redirect('/dashboard')
  return profile
}

export function isAdminOrManager(role: UserRole): boolean {
  return role === 'admin' || role === 'manager'
}

// KOL 등록/수정/삭제·엑셀 가져오기·카테고리 관리 권한.
// admin은 항상 보유하고, 그 외에는 admin이 설정 > 팀 관리에서 켜 준 담당자만.
export function canManageKol(profile: Profile): boolean {
  return profile.role === 'admin' || profile.can_manage_kol
}

// KOL 관리 전용 페이지에서 사용. 권한 없으면 열람 가능한 /kol로 되돌린다.
export async function requireKolManager(): Promise<Profile> {
  const profile = await requireAuth()
  if (!canManageKol(profile)) redirect('/kol')
  return profile
}
