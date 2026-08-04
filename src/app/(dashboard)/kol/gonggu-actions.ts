'use server'

// KOL 공구매출 이력 CRUD — 열람은 전직원, 쓰기는 KOL 관리 권한자만 (RLS와 동일 기준)

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canManageKol } from '@/lib/auth'
import { logKolAudit } from '@/lib/kol-audit'
import { parseAmount } from '@/lib/kol-fields'
import { fmtMoney, isCurrency, type Currency } from '@/lib/constants'

interface ActionResult {
  error: string
}

export interface KolGongguSaleInput {
  title: string      // 공구명 (필수)
  brand: string      // 진행 브랜드/업체
  sale_date: string  // "YYYY-MM-DD" 또는 빈 값
  amount: string     // 공구매출 금액
  currency: string   // 'TWD' | 'KRW'
  quantity: string   // 판매 수량
  notes: string      // 반응, 재구매율 등
}

interface SaleRow {
  title: string
  brand: string | null
  sale_date: string | null
  amount: number
  currency: Currency
  quantity: number | null
  notes: string | null
}

type ParseResult = { ok: false; error: string } | { ok: true; row: SaleRow }

function toRow(input: KolGongguSaleInput): ParseResult {
  const title = input.title.trim()
  if (!title) return { ok: false, error: '공구명을 입력하세요.' }

  const amount = parseAmount(input.amount)
  if (input.amount.trim() && amount === null) {
    return { ok: false, error: '공구매출 금액을 해석할 수 없습니다. 예: 420000, 420,000, 1,200만' }
  }

  let quantity: number | null = null
  const qtyRaw = input.quantity.trim().replace(/[,\s개]/g, '')
  if (qtyRaw) {
    const n = Number(qtyRaw)
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: '판매 수량은 0 이상의 숫자로 입력하세요.' }
    quantity = Math.round(n)
  }

  const sale_date = /^\d{4}-\d{2}-\d{2}$/.test(input.sale_date.trim()) ? input.sale_date.trim() : null

  return {
    ok: true,
    row: {
      title,
      brand:    input.brand.trim() || null,
      sale_date,
      amount:   amount ?? 0,
      currency: isCurrency(input.currency) ? input.currency : 'TWD',
      quantity,
      notes:    input.notes.trim() || null,
    },
  }
}

async function requireKolManager() {
  const profile = await requireAuth()
  return canManageKol(profile) ? profile : null
}

function friendlyError(message: string, code?: string): string {
  if (code === '42501' || /row-level security/i.test(message)) {
    return '공구매출 이력 수정은 관리자 또는 KOL 담당자만 가능합니다.'
  }
  return message
}

// 로그에는 이력 자체보다 "어느 KOL의 이력인지"가 중요하므로 이름을 함께 남긴다
async function kolNameOf(kolId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('kols').select('name').eq('id', kolId).single()
  return data?.name ?? null
}

// DB에서 돌려받은 행은 NUMERIC이 문자열로 올 수 있어 금액은 Number를 거친다
function describeSale(row: {
  title: string; brand: string | null; amount: number | string
  currency: string; sale_date: string | null
}): string {
  const parts = [row.title]
  if (row.brand) parts.push(row.brand)
  parts.push(fmtMoney(Number(row.amount), row.currency))
  if (row.sale_date) parts.push(row.sale_date)
  return parts.join(' · ')
}

export async function createKolGongguSale(
  kolId: string,
  input: KolGongguSaleInput,
): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: '공구매출 이력 추가는 관리자 또는 KOL 담당자만 가능합니다.' }

  const parsed = toRow(input)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from('kol_gonggu_sales')
    .insert({ ...parsed.row, kol_id: kolId, created_by: profile.id })
    .select('id')
    .single()
  if (error) return { error: friendlyError(error.message, error.code) }

  await logKolAudit({
    actor:      profile,
    action:     'create',
    target:     'gonggu_sale',
    targetId:   created?.id ?? null,
    targetName: await kolNameOf(kolId),
    summary:    `공구매출 추가 — ${describeSale(parsed.row)}`,
    details:    { kol_id: kolId, after: parsed.row },
  })

  revalidatePath('/kol')
}

export async function updateKolGongguSale(
  id: string,
  input: KolGongguSaleInput,
): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: '공구매출 이력 수정은 관리자 또는 KOL 담당자만 가능합니다.' }

  const parsed = toRow(input)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { data: before } = await supabase.from('kol_gonggu_sales').select('*').eq('id', id).single()

  const { data: updated, error } = await supabase
    .from('kol_gonggu_sales')
    .update(parsed.row)
    .eq('id', id)
    .select('id, kol_id')
  if (error) return { error: friendlyError(error.message, error.code) }
  if (!updated || updated.length === 0) return { error: '수정할 수 없는 공구매출 이력입니다.' }

  await logKolAudit({
    actor:      profile,
    action:     'update',
    target:     'gonggu_sale',
    targetId:   id,
    targetName: await kolNameOf(updated[0].kol_id),
    summary:    `공구매출 수정 — ${describeSale(parsed.row)}`,
    details:    { kol_id: updated[0].kol_id, before, after: parsed.row },
  })

  revalidatePath('/kol')
}

export async function deleteKolGongguSale(id: string): Promise<ActionResult | undefined> {
  const profile = await requireKolManager()
  if (!profile) return { error: '공구매출 이력 삭제는 관리자 또는 KOL 담당자만 가능합니다.' }

  const supabase = await createClient()
  const { data: deleted, error } = await supabase
    .from('kol_gonggu_sales')
    .delete()
    .eq('id', id)
    .select('*')
  if (error) return { error: friendlyError(error.message, error.code) }
  if (!deleted || deleted.length === 0) return { error: '삭제할 수 없는 공구매출 이력입니다.' }

  const row = deleted[0]
  await logKolAudit({
    actor:      profile,
    action:     'delete',
    target:     'gonggu_sale',
    targetId:   id,
    targetName: await kolNameOf(row.kol_id),
    summary:    `공구매출 삭제 — ${describeSale(row)}`,
    details:    { kol_id: row.kol_id, deleted: row },
  })

  revalidatePath('/kol')
}
