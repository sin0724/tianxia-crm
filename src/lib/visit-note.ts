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

// 한 구간(콤마·" / "로 나뉜 조각 하나)을 해석
function parseSegment(s: string, year: number): VisitRange | null {
  if (!s) return null

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

  // 2) 열린 기간: "7/19~" — 종료 미정이므로 그 달 말일까지로 본다
  const openEnded = s.match(/(\d{1,2})[/.](\d{1,2})\s*[~\-](?!\s*\d)/)
  if (openEnded) {
    const m = parseInt(openEnded[1], 10)
    const start = toDate(year, m, parseInt(openEnded[2], 10))
    const end = toDate(year, m, lastDayOfMonth(year, m))
    if (start && end) return { start, end }
  }

  // 3) "7월 12일" / "7월12일~15일"
  const koDay = s.match(/(\d{1,2})월\s*(\d{1,2})일(?:\s*[~\-]\s*(\d{1,2})일)?/)
  if (koDay) {
    const m = parseInt(koDay[1], 10)
    const d1 = parseInt(koDay[2], 10)
    const d2 = koDay[3] ? parseInt(koDay[3], 10) : d1
    const start = toDate(year, m, d1)
    const end = toDate(year, m, Math.max(d1, d2))
    if (start && end) return { start, end }
  }

  // 4) 월 범위: "7~8월"
  const monthRange = s.match(/(\d{1,2})\s*[~\-]\s*(\d{1,2})월/)
  if (monthRange) {
    const m1 = parseInt(monthRange[1], 10), m2 = parseInt(monthRange[2], 10)
    const start = toDate(year, m1, 1)
    const end = toDate(year, m2, lastDayOfMonth(year, m2))
    if (start && end && end >= start) return { start, end }
  }

  // 5) "7월초" / "8월 중순" / "8월말" / "7월중" / "7월" — 초 1~10, 중순 11~20, 말 21~말일, 그 외 월 전체
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

  // 6) 단일 날짜: "7/20", "7.20"
  const single = s.match(/(\d{1,2})[/.](\d{1,2})/)
  if (single) {
    const d = toDate(year, parseInt(single[1], 10), parseInt(single[2], 10))
    if (d) return { start: d, end: d }
  }

  return null
}

// 연도 표기가 없는 자유 메모는 기준일(todayStr)의 연도로 해석한다.
// "1월 방문"을 12월에 적는 해넘김 케이스는 드물어 단순화 — 지난 날짜로 해석되면
// 지남 처리되므로 최소한 잘못된 미래 일정으로 남지는 않는다.
// "6/27~7/1 부산 / 7월중 제주"처럼 여러 일정이 있으면 전체를 아우르는 범위로 합친다
// (지남 판정은 마지막 일정 기준이 되어 미래 일정이 지워지지 않는다).
export function parseVisitNote(note: string | null | undefined, todayStr: string): VisitRange | null {
  if (!note) return null
  // 전각 물결(～)·대시 통일 후 " / ", 콤마, 가운뎃점으로 구간 분리 (날짜의 /와 구분)
  const s = note.trim().replace(/[～〜]/g, '~').replace(/[–—−]/g, '-')
  if (!s) return null
  const year = parseInt(todayStr.slice(0, 4), 10)

  const ranges = s.split(/\s+\/\s+|[,·]/)
    .map(seg => parseSegment(seg.trim(), year))
    .filter((r): r is VisitRange => r !== null)
  if (ranges.length === 0) return null

  return {
    start: ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0].start),
    end:   ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0].end),
  }
}
