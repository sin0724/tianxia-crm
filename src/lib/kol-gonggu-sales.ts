// KOL 공구매출 이력 — 이 KOL이 이전에 진행한 공동구매의 판매 실적.
// 우리 시스템 밖에서 진행한 건(다른 회사 공구 등)도 기입한다.
// 용어는 "공구매출"로 고정 — gonggu-admin의 캠페인 실적과 혼동을 피한다.
// (조회는 서버 전용인 lib/kols.ts의 getKolGongguSales — 이 파일은 클라이언트에서도 쓴다)

import { CURRENCIES, isCurrency, toKrw, type Currency } from '@/lib/constants'

export interface KolGongguSale {
  id: string
  kol_id: string
  title: string                // 공구명
  brand: string | null         // 진행 브랜드/업체
  sale_date: string | null     // 진행일 "YYYY-MM-DD"
  amount: number               // 공구매출 금액 (currency 기준)
  currency: Currency
  quantity: number | null      // 판매 수량
  notes: string | null         // 반응, 재구매율 등
  created_by: string | null
  created_at: string
}

export interface GongguSalesTotals {
  /** 통화별 합계 */
  byCurrency: Record<Currency, number>
  count: number
  /** 비교·표기용 원화 환산 합계 (적용 환율은 화면에 명시) */
  krwTotal: number
  /** 두 통화 이상이 섞여 단순 합산이 불가능한 경우 */
  mixed: boolean
}

// 통화가 섞이면 단순 합산이 틀리므로 통화별로 나눠 집계하고,
// 비교용 환산 합계를 함께 돌려준다.
export function sumGongguSales(rows: KolGongguSale[]): GongguSalesTotals {
  const byCurrency = Object.fromEntries(CURRENCIES.map(c => [c, 0])) as Record<Currency, number>
  for (const r of rows) {
    byCurrency[isCurrency(r.currency) ? r.currency : 'TWD'] += Number(r.amount)
  }
  return {
    byCurrency,
    count: rows.length,
    krwTotal: CURRENCIES.reduce((sum, c) => sum + toKrw(byCurrency[c], c), 0),
    mixed: CURRENCIES.filter(c => byCurrency[c] > 0).length > 1,
  }
}
