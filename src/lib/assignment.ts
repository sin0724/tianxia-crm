// ── 재배분(기존 DB) 판별 ─────────────────────────────────────
// 오래된 DB를 다시 나눠줄 때 새로 들어온 DB와 섞여 보이지 않도록 "재배분"으로 구분한다.
//  - 다른 담당자에게서 넘어온 건(previous_assigned_to 기록 있음)
//  - 이전 담당 기록이 없더라도 배분 시점에 유입일(없으면 등록일)이 일정 기간 이상 지난 건
//    (기록 컬럼 도입 전 재배분분·오래 묵은 미배정 DB를 함께 잡기 위함)
// 클라이언트/서버 어디서든 쓸 수 있도록 DB 접근 없이 계산한다.

/** 배분 시점 기준 유입 후 이 일수 이상 지났으면 재배분(기존 DB) */
export const REASSIGN_AGE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function isReassigned(c: {
  assigned_at: string | null
  inflow_date: string | null
  created_at?: string | null
  previous_assigned_to?: string | null
}): boolean {
  if (!c.assigned_at) return false
  if (c.previous_assigned_to) return true
  // inflow_date는 KST 달력 날짜("YYYY-MM-DD")
  const base = c.inflow_date
    ? new Date(`${c.inflow_date}T00:00:00+09:00`)
    : c.created_at ? new Date(c.created_at) : null
  if (!base || isNaN(base.getTime())) return false
  return new Date(c.assigned_at).getTime() - base.getTime() >= REASSIGN_AGE_DAYS * DAY_MS
}
