'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { normalizeHandle, parseFollowers } from '@/lib/kol-fields'
import { getKolCategoryNames } from '@/lib/kol-categories'
import { parseVisitNote } from '@/lib/visit-note'
import { kstDateString } from '@/lib/datetime'

interface ActionResult {
  error: string
}

export interface KolInput {
  name: string
  instagram: string      // 핸들 또는 URL — 서버에서 핸들로 정규화
  email: string          // 선택 입력
  followers: string      // 숫자 문자열 (빈 값 허용)
  categories: string[]
  rate: string
  visit_note: string
  visit_date: string     // "YYYY-MM-DD" 또는 빈 값
  history: string
}

interface KolRow {
  name: string
  instagram_handle: string | null
  email: string | null
  followers: number | null
  categories: string[]
  rate: string | null
  visit_note: string | null
  visit_date: string | null
  visit_end_date: string | null
  history: string | null
}

type ParseResult = { ok: false; error: string } | { ok: true; row: KolRow }

function toRow(input: KolInput, validCategories: string[]): ParseResult {
  const handle = normalizeHandle(input.instagram)
  // 이름이 비어 있으면 IG 핸들을 이름으로 사용
  const name = input.name.trim() || handle
  if (!name) return { ok: false, error: '이름 또는 인스타그램을 입력하세요.' }

  const followers = parseFollowers(input.followers)
  if (input.followers.trim() && followers === null) {
    return { ok: false, error: '팔로워 수를 해석할 수 없습니다. 예: 95000, 95,000, 9.5만' }
  }

  return {
    ok: true,
    row: {
      name,
      instagram_handle: handle,
      email: input.email.trim() || null,
      followers,
      categories: input.categories.filter(c => validCategories.includes(c)),
      rate:       input.rate.trim() || null,
      ...resolveVisit(input.visit_note, input.visit_date),
      history:    input.history.trim() || null,
    },
  }
}

// 방문 예정 메모("7월중", "7/12~7/15")를 날짜 범위로 해석해 시작/종료일을 채운다.
// 직접 입력한 대표 날짜가 있으면 시작일은 그것을 우선한다.
function resolveVisit(noteInput: string, dateInput: string) {
  const visit_note = noteInput.trim() || null
  const explicit = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : null
  const parsed = parseVisitNote(visit_note, kstDateString())
  return {
    visit_note,
    visit_date:     explicit ?? parsed?.start ?? null,
    visit_end_date: parsed?.end ?? explicit ?? null,
  }
}

// RLS도 admin만 쓰기를 허용하지만, 친절한 에러를 위해 앱 레벨에서도 확인한다.
async function requireAdmin() {
  const profile = await requireAuth()
  if (profile.role !== 'admin') return null
  return profile
}

function friendlyError(message: string, code?: string): string {
  if (code === '23505') return '이미 등록된 인스타그램 핸들입니다. 기존 KOL을 검색해보세요.'
  if (code === '42501' || /row-level security/i.test(message)) return 'KOL 등록/수정은 관리자만 가능합니다.'
  return message
}

export async function createKol(input: KolInput): Promise<ActionResult | undefined> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'KOL 등록은 관리자만 가능합니다.' }

  const parsed = toRow(input, await getKolCategoryNames())
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase.from('kols').insert({ ...parsed.row, created_by: profile.id })
  if (error) return { error: friendlyError(error.message, error.code) }

  revalidatePath('/kol')
}

export async function updateKol(id: string, input: KolInput): Promise<ActionResult | undefined> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'KOL 수정은 관리자만 가능합니다.' }

  const parsed = toRow(input, await getKolCategoryNames())
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase.from('kols').update(parsed.row).eq('id', id)
  if (error) return { error: friendlyError(error.message, error.code) }

  revalidatePath('/kol')
}

export async function deleteKol(id: string): Promise<ActionResult | undefined> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'KOL 삭제는 관리자만 가능합니다.' }

  const supabase = await createClient()
  const { data: deleted, error } = await supabase.from('kols').delete().eq('id', id).select('id')
  if (error) return { error: friendlyError(error.message, error.code) }
  if (!deleted || deleted.length === 0) return { error: '삭제할 수 없는 KOL입니다.' }

  revalidatePath('/kol')
}

// 선택 삭제 (일괄) — 표의 체크박스로 고른 KOL들을 한 번에 삭제
export async function deleteKols(ids: string[]): Promise<ActionResult | undefined> {
  const profile = await requireAdmin()
  if (!profile) return { error: 'KOL 삭제는 관리자만 가능합니다.' }
  if (ids.length === 0) return

  const supabase = await createClient()
  const { data: deleted, error } = await supabase.from('kols').delete().in('id', ids).select('id')
  if (error) return { error: friendlyError(error.message, error.code) }

  const count = deleted?.length ?? 0
  revalidatePath('/kol')
  if (count === 0) return { error: '삭제된 KOL이 없습니다.' }
  if (count < ids.length) return { error: `${ids.length}명 중 ${count}명만 삭제되었습니다.` }
}
