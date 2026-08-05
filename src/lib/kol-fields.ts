// KOL 가져오기/등록에서 공유하는 필드 정의와 파서 (클라이언트에서도 사용 가능)

import type { CrmField } from '@/lib/csv'
import { KOL_CATEGORY, GONGGU_CATEGORY, type Currency } from '@/lib/constants'

export const KOL_FIELDS: CrmField[] = [
  // 이름 또는 인스타그램 중 하나만 있으면 됨 (이름이 비면 IG 핸들로 대체)
  { key: 'name',       label: '이름',           required: false, aliases: ['활동명', 'KOL명', 'kol', '이름(활동명)', '계정명', '이름/활동명'] },
  { key: 'instagram',  label: '인스타그램',     required: false, aliases: ['ig', 'ig링크', 'ig 링크', '인스타', '인스타링크', '인스타 링크', '인스타그램 링크', 'instagram', '핸들', '계정', 'url', '링크'] },
  { key: 'email',      label: '이메일',         required: false, aliases: ['email', 'e-mail', '메일', '이메일 주소', '연락 이메일'] },
  { key: 'followers',  label: '팔로워',         required: false, aliases: ['팔로워수', '팔로워 수', 'followers', '팔로워(명)'] },
  { key: 'categories', label: '카테고리',       required: false, aliases: ['분류', '장르', '카테고리(복수)', '주제'] },
  // 레거시 원문 — 고정비/제공항목이 매핑되지 않으면 이 값에서 자동 분해한다 (parseRateText)
  { key: 'rate',       label: '진행 단가(원문)', required: false, aliases: ['진행 단가', '단가', '진행단가', '비용', '고료', '원고료', '가격'] },
  { key: 'fee_amount',        label: '고정비',        required: false, aliases: ['고정비 금액', '고정단가', '고정 단가', '정액', '금액', 'fee'] },
  { key: 'fee_currency',      label: '통화',          required: false, aliases: ['화폐', 'currency', '통화단위', '단위'] },
  { key: 'deliverables',      label: '제공 항목',     required: false, aliases: ['제공항목', '제공 내역', '제공내역', '산출물', '콘텐츠 구성', '컨텐츠 구성', '제공'] },
  { key: 'rs_rate',           label: 'RS 요율',       required: false, aliases: ['rs', 'RS율', 'rs요율', 'RS(%)', '요율', '수수료율', '수익배분'] },
  { key: 'gonggu_categories', label: '공구 카테고리', required: false, aliases: ['공구카테고리', '공구 품목', '공구품목', '공구 분류', '공구분류'] },
  { key: 'visit_note', label: '방문 예정',      required: false, aliases: ['방문예정', '방문 예정일', '방문예정일', '방문일정', '방문 일정', '방문'] },
  { key: 'visit_date', label: '방문 대표 날짜', required: false, aliases: ['방문날짜', '방문 날짜', '대표날짜', '대표 날짜'] },
  { key: 'history',    label: '히스토리',       required: false, aliases: ['진행이력', '진행 이력', '협업브랜드', '협업 브랜드', '이력', '메모', '비고', '특이사항'] },
]

// "@handle" / "https://instagram.com/handle/" / "www.instagram.com/handle?igsh=…" / "handle" → "handle" (소문자)
export function normalizeHandle(v: string | undefined | null): string | null {
  if (!v) return null
  const handle = v
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
  return handle || null
}

// 이름 유사 검사로 훑어오는 기존 KOL 수 상한 — 정규화 비교라 DB에서 거를 수 없어 앱에서 대조한다
export const KOL_NAME_SCAN_LIMIT = 2000

// 이름 중복 후보 판정 — 표기 차이("김민지 (뷰티)" vs "김민지")를 같은 사람으로 보기 위해
// 공백·괄호·구분기호를 걷어낸 뒤 비교한다. 단건 등록과 엑셀 가져오기가 같은 기준을 쓴다.
export function normalizeKolName(name: string): string {
  return name.toLowerCase().replace(/[\s\(\)\[\]（）【】·•\-_.,'"@]/g, '')
}

// 완전 일치뿐 아니라 포함 관계도 후보로 본다 — 사람이 확인하는 경고라서
// 오탐이 좀 있어도 놓치는 것보다 낫다. 2자 미만은 아무 이름에나 걸려 제외.
export function isSimilarKolName(a: string, b: string): boolean {
  const na = normalizeKolName(a)
  const nb = normalizeKolName(b)
  if (na.length < 2 || nb.length < 2) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

// "95,000" / "95000명" / "9.5만" / "1.2만명" / "9.5천" → 95000. 해석 불가 시 null (행 자체는 살림)
// 단위 없는 소수("2.3")는 "2.3만"에서 단위가 잘린 입력이므로 거부한다 — 팔로워 수는 소수가 될 수 없다
export function parseFollowers(v: string | undefined | null): number | null {
  if (!v) return null
  const s = v.trim().replace(/[,\s]/g, '').replace(/명$/, '')
  if (!s) return null
  const unit = s.match(/^(\d+(?:\.\d+)?)(만|천|[kK])$/)
  if (unit) {
    const mult = unit[2] === '만' ? 10000 : 1000
    return Math.round(parseFloat(unit[1]) * mult)
  }
  if (!/^\d+(?:\.0*)?$/.test(s)) return null
  const n = Math.round(parseFloat(s))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── 진행 조건 (고정비 · 통화 · 제공 항목 · RS 요율) ─────────────

// "13,300" / "13,300 NTD" / "8000원" / "1,200만원" / "1.5만" → 숫자. 해석 불가 시 null
export function parseAmount(v: string | undefined | null): number | null {
  if (!v) return null
  const s = v
    .trim()
    .replace(/NT\$|NTD|TWD|KRW|₩|元|원/gi, '')  // 통화 표기 제거 (통화는 parseCurrency가 따로 읽음)
    .replace(/[,\s]/g, '')
  if (!s) return null
  const unit = s.match(/^(\d+(?:\.\d+)?)(만|천)$/)
  if (unit) return Math.round(parseFloat(unit[1]) * (unit[2] === '만' ? 10000 : 1000))
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null
  const n = Math.round(parseFloat(s))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// "NTD" / "NT$" / "대만달러" → TWD, "원" / "KRW" / "₩" → KRW. 판단 불가 시 null
// NTD 표기를 먼저 본다 — "원고료 13,300 NTD"처럼 둘이 섞이면 명시적 코드가 우선.
export function parseCurrency(v: string | undefined | null): Currency | null {
  if (!v) return null
  const s = v.trim()
  if (/(NT\$|NTD|TWD|대만|臺|台|元)/i.test(s)) return 'TWD'
  if (/(KRW|₩|원|한국)/i.test(s)) return 'KRW'
  return null
}

const DELIVERABLE_MAX_LEN   = 40
const DELIVERABLE_MAX_COUNT = 20

// 제공 항목 정리 — 앞뒤 공백 제거, 빈 값·중복 제거, 길이·개수 상한.
// "5개 이상", "3일" 같은 뉘앙스를 그대로 보존해야 하므로 값 자체는 건드리지 않는다.
export function sanitizeDeliverables(items: string[]): string[] {
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, DELIVERABLE_MAX_LEN)
    if (!t || out.includes(t)) continue
    out.push(t)
    if (out.length >= DELIVERABLE_MAX_COUNT) break
  }
  return out
}

// "릴스 1개, 스토리 5개 이상 / 바이오링크 3일" → ["릴스 1개","스토리 5개 이상","바이오링크 3일"]
export function parseDeliverables(v: string | undefined | null): string[] {
  if (!v) return []
  return sanitizeDeliverables(v.split(/[,;·|\n\/]+/))
}

// "15" / "15%" / "15 %" → 15. 0~100 벗어나거나 숫자가 아니면 null
export function parseRsRate(v: string | undefined | null): number | null {
  if (!v) return null
  const s = v.trim().replace(/[%％\s]/g, '')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

// 엑셀에서 흔한 표기를 공구 카테고리 정식 명칭으로 흡수
const GONGGU_ALIASES: Record<string, string> = {
  '건기식': '헬스·건기식', '헬스': '헬스·건기식', '건강식품': '헬스·건기식',
  '헬스/건기식': '헬스·건기식', '헬스·건기식': '헬스·건기식',
  '육아': '유아', '키즈': '유아', '유아동': '유아', '육아/키즈': '유아',
  '반려': '반려동물', '펫': '반려동물',
  '가전': '디지털', '전자': '디지털', 'it': '디지털',
  '푸드': '식품', '음식': '식품',
  '생활': '리빙', '홈': '리빙',
  '화장품': '뷰티', '코스메틱': '뷰티',
}

// "뷰티, 건기식" → ["뷰티","헬스·건기식"] (GONGGU_CATEGORY에 있는 값만 남긴다)
export function parseGongguCategories(v: string | undefined | null): string[] {
  if (!v) return []
  const out = new Set<string>()
  for (const raw of v.split(/[,|;\n]+/)) {
    const t = raw.trim()
    if (!t) continue
    const exact = GONGGU_CATEGORY.find(c => c === t)
    if (exact) { out.add(exact); continue }
    const alias = GONGGU_ALIASES[t] ?? GONGGU_ALIASES[t.toLowerCase()]
    if (alias) { out.add(alias); continue }
    // "뷰티/식품"처럼 슬래시를 구분자로 쓴 경우 분해 시도
    for (const part of t.split('/')) {
      const p = part.trim()
      const m = GONGGU_CATEGORY.find(c => c === p) ?? GONGGU_ALIASES[p] ?? GONGGU_ALIASES[p.toLowerCase()]
      if (m) out.add(m)
    }
  }
  return [...out]
}

export interface ParsedRateText {
  amount: number | null
  currency: Currency
  deliverables: string[]
  /** 파싱이 실패했거나 애매함 — 목록에 "원문 확인 필요" 배지를 띄운다 */
  needsReview: boolean
}

// 레거시 rate 원문("13,300 NTD / 릴스 1개, 스토리 5개 이상, 바이오링크 3일")을
// 고정비·통화·제공 항목으로 분해. supabase/schema.sql 14-e의 백필과 같은 규칙이며,
// 자유 텍스트라 100% 파싱은 불가능하므로 애매한 건은 needsReview로 넘긴다.
export function parseRateText(rate: string | undefined | null): ParsedRateText | null {
  const src = rate?.trim()
  if (!src) return null

  const slash = src.indexOf('/')
  const head = slash >= 0 ? src.slice(0, slash) : src
  // 첫 숫자 토큰 (+"만"/"천" 단위까지) 만 읽는다
  const amount = parseAmount(head.match(/\d[\d,]*(?:\.\d+)?\s*[만천]?/)?.[0] ?? null)
  const currency = parseCurrency(src)
  const deliverables = slash >= 0 ? sanitizeDeliverables(src.slice(slash + 1).split(',')) : []

  return {
    amount,
    currency: currency ?? 'TWD',
    deliverables,
    // 금액을 못 읽었거나 / 통화 표기가 없거나 / 단위가 생략된 듯한 소액("피드 50")
    needsReview: amount === null || currency === null || amount < 1000,
  }
}

/** 가져오기 행에서 진행 조건 관련 컬럼만 (KolImportRow와 구조 호환) */
export interface KolFeeInput {
  rate?: string
  fee_amount?: string
  fee_currency?: string
  deliverables?: string
  rs_rate?: string
  gonggu_categories?: string
}

// 새 컬럼(고정비·통화·제공항목)이 매핑돼 있으면 그것을 쓰고,
// 없으면 레거시 rate 원문에서 분해한 값을 쓴다. 가져오기 화면 미리보기와
// 실제 저장이 같은 결과를 보여주도록 양쪽이 이 함수를 공유한다.
export function resolveKolFee(row: KolFeeInput) {
  const legacy = parseRateText(row.rate)
  const amount = parseAmount(row.fee_amount)
  const currency = parseCurrency(row.fee_currency) ?? parseCurrency(row.fee_amount)
  const items = parseDeliverables(row.deliverables)
  const fromNewColumns = amount !== null || items.length > 0

  return {
    fee_amount:   amount ?? legacy?.amount ?? null,
    fee_currency: currency ?? legacy?.currency ?? ('TWD' as Currency),
    deliverables: items.length > 0 ? items : (legacy?.deliverables ?? []),
    rs_rate:      parseRsRate(row.rs_rate),
    gonggu_categories: parseGongguCategories(row.gonggu_categories),
    // 원문에서 분해한 값만 사람 확인 대상 — 새 컬럼으로 직접 넣은 값은 그대로 신뢰
    rate_needs_review: !fromNewColumns && (legacy?.needsReview ?? false),
  }
}

// "뷰티, 라이프스타일" / "뷰티/패션" → 유효 카테고리 목록에 있는 값만 추출
// valid 미지정 시 기본 목록 사용 (DB 카테고리는 호출부에서 넘긴다)
export function parseCategories(v: string | undefined | null, valid: readonly string[] = KOL_CATEGORY): string[] {
  if (!v) return []
  const out = new Set<string>()
  for (const raw of v.split(/[,|;·\n]+/)) {
    const t = raw.trim()
    if (!t) continue
    // '의료/시술', '맛집/F&B'처럼 슬래시가 카테고리명 자체인 경우를 먼저 매칭
    const exact = valid.find(c => c === t)
    if (exact) { out.add(exact); continue }
    // "뷰티/패션"처럼 슬래시를 구분자로 쓴 경우 분해 시도
    for (const part of t.split('/')) {
      const p = part.trim()
      const m = valid.find(c => c === p)
      if (m) out.add(m)
    }
  }
  return [...out]
}
