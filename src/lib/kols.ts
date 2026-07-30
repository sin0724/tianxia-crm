import { createClient } from '@/lib/supabase/server'
import { normalizeHandle } from '@/lib/kol-fields'
import { kstStartOfDay } from '@/lib/datetime'
import { TWD_TO_KRW, isCurrency, type Currency } from '@/lib/constants'
import type { KolGongguSale } from '@/lib/kol-gonggu-sales'

// 목록 조회는 뷰를 쓴다 — 누적 공구매출 합계, 고정비 환산액(정렬·범위 필터용),
// 제공 항목 부분 검색용 문자열이 여기서 계산된다. 쓰기는 kols 테이블에 직접.
const KOL_VIEW = 'kols_with_gonggu'

export interface Kol {
  id: string
  name: string
  instagram_handle: string | null
  email: string | null
  followers: number | null
  categories: string[]
  /** [레거시] 진행 단가 원문 — 보존용. 신규 입력은 fee_* / deliverables 사용 */
  rate: string | null
  visit_note: string | null
  visit_date: string | null
  visit_end_date: string | null
  history: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // ── 진행 조건 ──
  fee_amount: number | null
  fee_currency: Currency
  deliverables: string[]
  rs_rate: number | null
  gonggu_categories: string[]
  /** rate 원문 파싱이 애매한 건 — 목록에 "원문 확인 필요" 배지 */
  rate_needs_review: boolean
  // ── 뷰 계산 컬럼 (누적 공구매출) ──
  gonggu_sales_twd: number
  gonggu_sales_krw: number
  /** 정렬용 환산 합계 (TWD_TO_KRW 기준) — 표시는 통화별 값을 쓴다 */
  gonggu_sales_krw_total: number
  gonggu_sales_count: number
  gonggu_sales_last_date: string | null
}

export interface KolListFilters {
  q?: string
  category?: string
  gonggu_category?: string
  deliverable?: string   // 제공 항목 부분 검색 ("릴스")
  followers_min?: string // 만 단위 (예: "8" = 8만)
  followers_max?: string
  fee_min?: string       // 고정비 범위 — fee_cur 통화 기준으로 입력
  fee_max?: string
  fee_cur?: string       // 'TWD'(기본) | 'KRW' — 범위 입력값의 통화
  needs_review?: string  // '1'이면 "원문 확인 필요"만
  visit_from?: string    // 방문 대표 날짜 범위 "YYYY-MM-DD"
  visit_to?: string
  sort?: string          // 'updated'(기본) | 'followers' | 'visit' | 'name' | 'fee' | 'fee_asc' | 'gonggu'
  page?: number
}

export const KOL_PAGE_SIZE = 50

export interface KolListResult {
  kols: Kol[]
  total: number
  page: number
  pageCount: number
  /** 조회 시각(ms) — "n일 미갱신" 계산용 (렌더 중 Date.now() 호출 회피) */
  now: number
}

// 만 단위 입력 → 실제 팔로워 수 ("8" → 80000, "0.5" → 5000)
function manToCount(v?: string): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) : null
}

// 고정비 범위 입력 → 비교용 원화 환산값. 통화가 섞여 있어 그대로 비교하면
// NT$13,300과 8,000원의 순서가 뒤집히므로 한 통화로 환산해 비교한다.
function feeToKrw(v: string | undefined, cur: Currency): number | null {
  if (!v) return null
  const n = Number(v.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return cur === 'TWD' ? n * TWD_TO_KRW : n
}

// 정렬·필터 적용 (getKols와 텍스트 복사용 전체 조회가 공유)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyKolFilters<T extends { order: any; contains: any; gte: any; lte: any; or: any; ilike: any; eq: any }>(
  query: T,
  filters: KolListFilters,
): T {
  switch (filters.sort) {
    case 'followers':
      query = query.order('followers', { ascending: false, nullsFirst: false })
      break
    case 'visit':
      // 방문 예정일이 가까운 순 — 날짜 없는 건 뒤로
      query = query.order('visit_date', { ascending: true, nullsFirst: false })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    case 'fee':
      // 고정비 높은순 — 통화가 섞여 있으므로 환산액 기준 (화면에 환율 명시)
      query = query.order('fee_amount_krw', { ascending: false, nullsFirst: false })
      break
    case 'fee_asc':
      query = query.order('fee_amount_krw', { ascending: true, nullsFirst: false })
      break
    case 'gonggu':
      // 누적 공구매출 많은순 — 통화별 합계를 환산해 비교
      query = query.order('gonggu_sales_krw_total', { ascending: false, nullsFirst: false })
      break
    default:
      // 기본: 최신화(수정) 최근 순
      query = query.order('updated_at', { ascending: false })
  }

  if (filters.category)        query = query.contains('categories', [filters.category])
  if (filters.gonggu_category) query = query.contains('gonggu_categories', [filters.gonggu_category])

  // 제공 항목 부분 검색 — 배열을 펼친 문자열(뷰)에 ilike
  if (filters.deliverable?.trim()) {
    const safe = filters.deliverable.trim().replace(/[%_\\]/g, '\\$&')
    query = query.ilike('deliverables_text', `%${safe}%`)
  }

  if (filters.needs_review === '1') query = query.eq('rate_needs_review', true)

  const min = manToCount(filters.followers_min)
  const max = manToCount(filters.followers_max)
  if (min !== null) query = query.gte('followers', min)
  if (max !== null) query = query.lte('followers', max)

  const feeCur: Currency = isCurrency(filters.fee_cur) ? filters.fee_cur : 'TWD'
  const feeMin = feeToKrw(filters.fee_min, feeCur)
  const feeMax = feeToKrw(filters.fee_max, feeCur)
  if (feeMin !== null) query = query.gte('fee_amount_krw', feeMin)
  if (feeMax !== null) query = query.lte('fee_amount_krw', feeMax)

  // 방문 예정 날짜 범위 — 기간 겹침 판정 (범위를 걸면 날짜 없는 KOL은 자동 제외)
  // 예: "7월중"(7/1~7/31) KOL은 "이번 주"(7/7~7/13) 필터에도 걸린다.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (filters.visit_from && dateRe.test(filters.visit_from)) {
    // 방문 종료일(없으면 시작일)이 필터 시작일 이후
    query = query.or(
      `visit_end_date.gte.${filters.visit_from},and(visit_end_date.is.null,visit_date.gte.${filters.visit_from})`,
    )
  }
  if (filters.visit_to && dateRe.test(filters.visit_to)) {
    // 방문 시작일이 필터 종료일 이전
    query = query.lte('visit_date', filters.visit_to)
  }

  if (filters.q) {
    // 인스타그램 전체 URL("https://www.instagram.com/yenpeiju/")이나 "@핸들"을
    // 그대로 붙여넣어도 핸들만 추출해 검색되게 한다
    const raw = filters.q.trim()
    const q =
      /^(https?:\/\/)?(www\.)?instagram\.com\//i.test(raw) || raw.startsWith('@')
        ? (normalizeHandle(raw) ?? raw)
        : raw
    // PostgREST or() 구문 보호: 와일드카드 이스케이프 후 값 전체를 따옴표로 감쌈
    const safe = q.replace(/[%_\\]/g, '\\$&').replace(/"/g, '\\"')
    query = query.or(
      `name.ilike."%${safe}%",instagram_handle.ilike."%${safe}%",email.ilike."%${safe}%",history.ilike."%${safe}%",rate.ilike."%${safe}%",visit_note.ilike."%${safe}%",deliverables_text.ilike."%${safe}%"`,
    )
  }
  return query
}

export async function getKols(filters: KolListFilters = {}): Promise<KolListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  const query = applyKolFilters(
    supabase
      .from(KOL_VIEW)
      .select('*', { count: 'exact' })
      .range((page - 1) * KOL_PAGE_SIZE, page * KOL_PAGE_SIZE - 1),
    filters,
  )

  const { data, count } = await query
  const total = count ?? 0
  return {
    kols: (data as Kol[]) ?? [],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / KOL_PAGE_SIZE)),
    now: Date.now(),
  }
}

// ── 공구매출 이력 조회 ──
// 목록 페이지에 보이는 KOL들의 이력을 한 번에 가져와 kol_id로 묶는다
// (행 펼치기에서 추가 요청 없이 바로 보여주기 위해).
export async function getKolGongguSales(
  kolIds: string[],
): Promise<Record<string, KolGongguSale[]>> {
  if (kolIds.length === 0) return {}

  const supabase = await createClient()
  const { data } = await supabase
    .from('kol_gonggu_sales')
    .select('*')
    .in('kol_id', kolIds)
    .order('sale_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const byKol: Record<string, KolGongguSale[]> = {}
  for (const row of (data as KolGongguSale[]) ?? []) {
    ;(byKol[row.kol_id] ??= []).push(row)
  }
  return byKol
}

// ── 오늘(KST) 새로 추가된 KOL 수 — 팝업 공지용 ──
// created_at 기본값이 NOW()이므로 개별 등록·일괄 임포트 모두 집계된다.
export async function countKolsAddedToday(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('kols')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', kstStartOfDay().toISOString())
  return count ?? 0
}

// ── 텍스트 복사용 전체 조회 (페이지네이션 무시, 필터·정렬은 동일) ──

export interface KolCopyRow {
  name: string
  instagram_handle: string | null
  followers: number | null
  visit_note: string | null
  visit_date: string | null
}

export const KOL_COPY_LIMIT = 1000

export async function getKolsForCopy(filters: KolListFilters = {}): Promise<KolCopyRow[]> {
  const supabase = await createClient()
  const query = applyKolFilters(
    supabase
      .from(KOL_VIEW)
      .select('name, instagram_handle, followers, visit_note, visit_date')
      .limit(KOL_COPY_LIMIT),
    filters,
  )
  const { data } = await query
  return (data as KolCopyRow[]) ?? []
}
