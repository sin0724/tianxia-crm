'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

interface ActionResult {
  error: string
}

// 새 카테고리 색상 자동 배정 팔레트 — 클래스 문자열이 소스에 있어야 Tailwind가 CSS를 생성한다
const COLOR_PALETTE = [
  'bg-pink-100 text-pink-700',
  'bg-red-100 text-red-700',
  'bg-orange-100 text-orange-700',
  'bg-yellow-100 text-yellow-800',
  'bg-green-100 text-green-700',
  'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
  'bg-purple-100 text-purple-700',
  'bg-gray-100 text-gray-600',
]

async function requireAdmin() {
  const profile = await requireAuth()
  if (profile.role !== 'admin') return null
  return profile
}

function friendlyError(message: string, code?: string): string {
  if (code === '42P01') return '카테고리 테이블이 아직 없습니다. Supabase SQL 편집기에서 schema.sql의 "11. KOL 카테고리 관리" 섹션을 실행해주세요.'
  if (code === '23505') return '이미 있는 카테고리 이름입니다.'
  if (code === '42501' || /row-level security/i.test(message)) return '카테고리 관리는 관리자만 가능합니다.'
  return message
}

// kols.categories 배열에서 카테고리 이름을 바꾸거나(newName 지정) 제거(newName null)
async function propagateToKols(oldName: string, newName: string | null): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kols')
    .select('id, categories')
    .contains('categories', [oldName])
  if (error) return friendlyError(error.message, error.code)

  for (const row of data ?? []) {
    const next = new Set((row.categories as string[]).map(c => (c === oldName ? newName : c)).filter((c): c is string => c !== null))
    const { error: upErr } = await supabase.from('kols').update({ categories: [...next] }).eq('id', row.id)
    if (upErr) return friendlyError(upErr.message, upErr.code)
  }
  return null
}

export async function createKolCategory(name: string): Promise<ActionResult | undefined> {
  if (!(await requireAdmin())) return { error: '카테고리 관리는 관리자만 가능합니다.' }
  const trimmed = name.trim()
  if (!trimmed) return { error: '카테고리 이름을 입력하세요.' }

  const supabase = await createClient()
  const { data: existing, error: selErr } = await supabase
    .from('kol_categories')
    .select('color, sort_order')
    .order('sort_order', { ascending: false })
  if (selErr) return { error: friendlyError(selErr.message, selErr.code) }

  // 가장 덜 쓰인 팔레트 색을 자동 배정 (겹침 최소화)
  const usage = new Map(COLOR_PALETTE.map(c => [c, 0]))
  for (const row of existing ?? []) usage.set(row.color, (usage.get(row.color) ?? 0) + 1)
  const color = [...usage.entries()].sort((a, b) => a[1] - b[1])[0][0]
  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1

  const { error } = await supabase
    .from('kol_categories')
    .insert({ name: trimmed, color, sort_order: nextOrder })
  if (error) return { error: friendlyError(error.message, error.code) }

  revalidatePath('/kol')
}

export async function renameKolCategory(id: string, newName: string): Promise<ActionResult | undefined> {
  if (!(await requireAdmin())) return { error: '카테고리 관리는 관리자만 가능합니다.' }
  const trimmed = newName.trim()
  if (!trimmed) return { error: '카테고리 이름을 입력하세요.' }

  const supabase = await createClient()
  const { data: row, error: selErr } = await supabase
    .from('kol_categories')
    .select('name')
    .eq('id', id)
    .single()
  if (selErr || !row) return { error: friendlyError(selErr?.message ?? '카테고리를 찾을 수 없습니다.', selErr?.code) }
  if (row.name === trimmed) return

  const { error } = await supabase.from('kol_categories').update({ name: trimmed }).eq('id', id)
  if (error) return { error: friendlyError(error.message, error.code) }

  // 기존 KOL들에 붙은 태그도 함께 변경
  const propErr = await propagateToKols(row.name, trimmed)
  if (propErr) return { error: `카테고리 이름은 바뀌었지만 KOL 태그 갱신 중 오류: ${propErr}` }

  revalidatePath('/kol')
}

export async function deleteKolCategory(id: string): Promise<ActionResult | undefined> {
  if (!(await requireAdmin())) return { error: '카테고리 관리는 관리자만 가능합니다.' }

  const supabase = await createClient()
  const { data: row, error: selErr } = await supabase
    .from('kol_categories')
    .select('name')
    .eq('id', id)
    .single()
  if (selErr || !row) return { error: friendlyError(selErr?.message ?? '카테고리를 찾을 수 없습니다.', selErr?.code) }

  const { error } = await supabase.from('kol_categories').delete().eq('id', id)
  if (error) return { error: friendlyError(error.message, error.code) }

  // KOL들에 붙은 태그에서도 제거
  const propErr = await propagateToKols(row.name, null)
  if (propErr) return { error: `카테고리는 삭제됐지만 KOL 태그 정리 중 오류: ${propErr}` }

  revalidatePath('/kol')
}

export async function moveKolCategory(id: string, direction: 'up' | 'down'): Promise<ActionResult | undefined> {
  if (!(await requireAdmin())) return { error: '카테고리 관리는 관리자만 가능합니다.' }

  const supabase = await createClient()
  const { data, error: selErr } = await supabase
    .from('kol_categories')
    .select('id, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (selErr || !data) return { error: friendlyError(selErr?.message ?? '조회 실패', selErr?.code) }

  const idx = data.findIndex(c => c.id === id)
  const swapWith = direction === 'up' ? idx - 1 : idx + 1
  if (idx === -1 || swapWith < 0 || swapWith >= data.length) return

  // 위치 교환 후 전체 순번 재부여 (sort_order 중복·구멍 정리 겸)
  const order = [...data]
  ;[order[idx], order[swapWith]] = [order[swapWith], order[idx]]
  for (let i = 0; i < order.length; i++) {
    if (order[i].sort_order === i + 1) continue
    const { error } = await supabase.from('kol_categories').update({ sort_order: i + 1 }).eq('id', order[i].id)
    if (error) return { error: friendlyError(error.message, error.code) }
  }

  revalidatePath('/kol')
}
