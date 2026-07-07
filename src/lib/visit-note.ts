// 방문 예정 자유 표기("7월중 방문", "8월말", "7/12~7/15") → 날짜 범위 해석
// 서버(저장·크론 백필)와 클라이언트(지남 판정) 양쪽에서 사용하는 순수 함수.

export interface VisitRange {
  start: string // "YYYY-MM-DD"
  end: string   // "YYYY-MM-DD"
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function toDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null
  const clamped = Math.min(Math.max(day, 1), lastDayOfMonth(year, month))
  return `${year}-${pad(month)}-${pad(clamped)}`
}

// 연도 표기가 없는 자유 메모는 기준일(todayStr)의 연도로 해석한다.
// "1월 방문"을 12월에 적는 해넘김 케이스는 드물어 단순화 — 지난 날짜로 해석되면
// 지남 처리되므로 최소한 잘못된 미래 일정으로 남지는 않는다.
export function parseVisitNote(note: string | null | undefined, todayStr: string): VisitRange | null {
  if (!note) return null
  const s = note.trim()
  if (!s) return null
  const year = parseInt(todayStr.slice(0, 4), 10)

  // 1) 기간: "7/12~7/15", "7.12 - 7.15", "7/12~15" (뒤쪽 월 생략 허용)
  const range = s.match(/(\d{1,2})[/.](\d{1,2})\s*[~\-]\s*(?:(\d{1,2})[/.])?(\d{1,2})/)
  if (range) {
    const m1 = parseInt(range[1], 10), d1 = parseInt(range[2], 10)
    const m2 = range[3] ? parseInt(range[3], 10) : m1
    const d2 = parseInt(range[4], 10)
    const start = toDate(year, m1, d1)
    const end = toDate(year, m2, d2)
    if (start && end) return end >= start ? { start, end } : { start, end: start }
  }

  // 2) "7월 12일" / "7월12일~15일"
  const koDay = s.match(/(\d{1,2})월\s*(\d{1,2})일(?:\s*[~\-]\s*(\d{1,2})일)?/)
  if (koDay) {
    const m = parseInt(koDay[1], 10)
    const d1 = parseInt(koDay[2], 10)
    const d2 = koDay[3] ? parseInt(koDay[3], 10) : d1
    const start = toDate(year, m, d1)
    const end = toDate(year, m, Math.max(d1, d2))
    if (start && end) return { start, end }
  }

  // 3) "7월초" / "8월 중순" / "8월말" / "7월중" / "7월" — 초 1~10, 중순 11~20, 말 21~말일, 그 외 월 전체
  const koMonth = s.match(/(\d{1,2})월\s*(초순|초|중순|말경|말|중)?/)
  if (koMonth) {
    const m = parseInt(koMonth[1], 10)
    const q = koMonth[2]
    const eom = m >= 1 && m <= 12 ? lastDayOfMonth(year, m) : 0
    const [d1, d2] =
      q === '초' || q === '초순' ? [1, 10] :
      q === '중순'               ? [11, 20] :
      q === '말' || q === '말경' ? [21, eom] :
      [1, eom] // '중' 또는 수식어 없음 → 월 전체
    const start = toDate(year, m, d1)
    const end = toDate(year, m, d2)
    if (start && end) return { start, end }
  }

  // 4) 단일 날짜: "7/20", "7.20"
  const single = s.match(/(\d{1,2})[/.](\d{1,2})/)
  if (single) {
    const d = toDate(year, parseInt(single[1], 10), parseInt(single[2], 10))
    if (d) return { start: d, end: d }
  }

  return null
}
