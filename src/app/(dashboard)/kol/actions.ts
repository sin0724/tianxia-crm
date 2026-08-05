'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canManageKol } from '@/lib/auth'
import { logKolAudit, diffKolFields, summarizeChanges, describeKol, summarizeNames } from '@/lib/kol-audit'
import {
  normalizeHandle, parseFollowers, parseAmount, sanitizeDeliverables,
  normalizeKolName, isSimilarKolName, KOL_NAME_SCAN_LIMIT,
} from '@/lib/kol-fields'
import { getKolCategoryNames } from '@/lib/kol-categories'
import { parseVisitNote } from '@/lib/visit-note'
import { kstDateString } from '@/lib/datetime'
import { GONGGU_CATEGORY, isCurrency, type Currency } from '@/lib/constants'

interface ActionResult {
  error: string
}

export interface KolInput {
  name: string
  instagram: string      // 핸들 또는 URL — 서버에서 핸들로 정규화
  email: string          // 선택 입력
  followers: string      // 숫자 문자열 (빈 값 허용)
  categories: string[]
  // ── 진행 조건 ── (레거시 rate 원문은 폼에서 수정하지 않고 보존한다)
  fee_amount: string        // 고정비 금액 (빈 값 허용)
  fee_currency: string      // 'TWD' | 'KRW'
  deliverables: string[]    // 제공 항목 칩
  rs_rate: string           // RS 요율(%) 0~100
  gonggu_categories: string[]
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
  fee_amount: number | null
  fee_currency: Currency
  deliverables: string[]
  rs_rate: number | null
  gonggu_categories: string[]
  /** 담당자가 진행 조건을 저장했으면 원문 확인이 끝난 것으로 본다 */
  rate_needs_review: boolean
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

  const fee_amount = parseAmount(input.fee_amount)
  if (input.fee_amount.trim() && fee_amount === null) {
    return { ok: false, error: '고정비를 해석할 수 없습니다. 예: 13300, 13,300' }
  }

  // 고정비만 받는 KOL, RS만 받는 KOL, 둘 다인 KOL이 모두 있어 두 값은 독립적이다
  const rsRaw = input.rs_rate.trim().replace(/[%％\s]/g, '')
  let rs_rate: number | null = null
  if (rsRaw) {
    const n = Number(rsRaw)
    if (!Number.isFinite(n)) return { ok: false, error: 'RS 요율은 숫자로 입력하세요. 예: 15' }
    if (n < 0 || n > 100)   return { ok: false, error: 'RS 요율은 0~100 사이로 입력하세요.' }
    rs_rate = Math.round(n * 100) / 100
  }

  return {
    ok: true,
    row: {
      name,
      instagram_handle: handle,
      email: input.email.trim() || null,
      followers,
      categories: input.categories.filter(c => validCategories.includes(c)),
      fee_amount,
      fee_currency: isCurrency(input.fee_currency) ? input.fee_currency : 'TWD',
      deliverables: sanitizeDeliverables(input.deliverables),
      rs_rate,
      gonggu_categories: input.gonggu_categories.filter(c => (GONGGU_CATEGORY as readonly string[]).includes(c)),
      rate_needs_review: false,
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

// RLS도 KOL 관리 권한자만 쓰기를 허용하지만, 친절한 에러를 위해 앱 레벨에서도 확인한다.
async function requireKolManager() {
  const profile = await requireAuth()
  if (!canManageKol(profile)) return null
  return profile
}

function friendlyError(message: string, code?: string): string {
  if (code === '23505') return '이미 등록된 인스타그램 핸들입니다. 기존 KOL을 검색해보세요.'
  if (code === '42501' || /row-level security/i.test(message)) return 'KOL 등록/수정은 관리자 또는 KOL 담당자만 가능합니다.'
  return message
}

export interface SimilarKol {
  id: string
  name: string
  instagram_handle: string | null
  followers: number | null
}

/**
 * 단건 등록 전 이름 유사 KOL을 찾는다 — 엑셀 가져오기의 중복 검사와 같은 기준.
 * IG 핸들 중복은 DB UNIQUE가 막아주지만, 핸들이 없거나 다른 계정으로 적힌 같은 사람은
 * 이름으로만 잡을 수 있다. 등록을 막지는 않고 담당자에게 확인만 요청한다.
 */
export async function findSimilarKols(rawName: string, instagram: string): Promise<SimilarKol[]> {
  await requireAuth()

  // 폼과 동일하게 이름이 비면 IG 핸들이 이름이 된다
  const name = rawName.trim() || normalizeHandle(instagram) || ''
  if (normalizeKolName(name).length < 2) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('kols')
    .select('id, name, instagram_handle, followers')
    .limit(KOL_NAME_SCAN_LIMIT)

  return (data ?? []).filter(k => isSimilarKolName(name, k.name))
}

export async function createKol(input: KolInput): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: 'KOL 등록은 관리자 또는 KOL 담당자만 가능합니다.' }

  const parsed = toRow(input, await getKolCategoryNames())
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from('kols')
    .insert({ ...parsed.row, created_by: profile.id })
    .select('id')
    .single()
  if (error) return { error: friendlyError(error.message, error.code) }

  await logKolAudit({
    actor:      profile,
    action:     'create',
    targetId:   created?.id ?? null,
    targetName: parsed.row.name,
    summary:    describeKol(parsed.row),
    details:    { after: parsed.row },
  })

  revalidatePath('/kol')
}

export async function updateKol(id: string, input: KolInput): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: 'KOL 수정은 관리자 또는 KOL 담당자만 가능합니다.' }

  const parsed = toRow(input, await getKolCategoryNames())
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  // 로그에 "무엇이 어떻게 바뀌었는지"를 남기려면 수정 전 값이 필요하다
  const { data: before } = await supabase.from('kols').select('*').eq('id', id).single()

  // RLS에 막히면 에러 없이 0건이 되므로, 실제로 바뀐 행이 있을 때만 로그를 남긴다
  const { data: updated, error } = await supabase.from('kols').update(parsed.row).eq('id', id).select('id')
  if (error) return { error: friendlyError(error.message, error.code) }
  if (!updated || updated.length === 0) return { error: '수정할 수 없는 KOL입니다.' }

  const changes = diffKolFields(before, parsed.row)
  await logKolAudit({
    actor:      profile,
    action:     'update',
    targetId:   id,
    targetName: parsed.row.name,
    summary:    summarizeChanges(changes),
    details:    { changes },
  })

  revalidatePath('/kol')
}

export async function deleteKol(id: string): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: 'KOL 삭제는 관리자 또는 KOL 담당자만 가능합니다.' }

  const supabase = await createClient()
  // 삭제된 행을 그대로 돌려받아 로그에 스냅샷으로 남긴다 (복구 판단 근거)
  const { data: deleted, error } = await supabase.from('kols').delete().eq('id', id).select('*')
  if (error) return { error: friendlyError(error.message, error.code) }
  if (!deleted || deleted.length === 0) return { error: '삭제할 수 없는 KOL입니다.' }

  const row = deleted[0]
  await logKolAudit({
    actor:      profile,
    action:     'delete',
    targetId:   id,
    targetName: row.name,
    summary:    describeKol(row),
    details:    { deleted: row },
  })

  revalidatePath('/kol')
}

// 선택 삭제 (일괄) — 표의 체크박스로 고른 KOL들을 한 번에 삭제
export async function deleteKols(ids: string[]): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: 'KOL 삭제는 관리자 또는 KOL 담당자만 가능합니다.' }
  if (ids.length === 0) return

  const supabase = await createClient()
  const { data: deleted, error } = await supabase.from('kols').delete().in('id', ids).select('*')
  if (error) return { error: friendlyError(error.message, error.code) }

  const count = deleted?.length ?? 0
  if (count > 0) {
    const names = deleted!.map(r => r.name as string)
    await logKolAudit({
      actor:     profile,
      action:    'bulk_delete',
      summary:   `${count}명 삭제 — ${summarizeNames(names)}`,
      itemCount: count,
      details:   { deleted },
    })
  }

  revalidatePath('/kol')
  if (count === 0) return { error: '삭제된 KOL이 없습니다.' }
  if (count < ids.length) return { error: `${ids.length}명 중 ${count}명만 삭제되었습니다.` }
}
