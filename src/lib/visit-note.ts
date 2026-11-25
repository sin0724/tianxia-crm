// 방문 예정 자유 표기("7월중 방문", "8월말", "7/12~7/15", "7.23", "7-23", "2026-07-23") → 날짜 범위 해석
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

  // 0) 연도 포함: "2026-07-23", "2026.7.23 ~ 2026.7.25", "2026/7/23~8/1", "2026-07-23~25"
  const withYear = s.match(
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s*[~\-]\s*(?:(\d{4})[./-])?(?:(\d{1,2})[./-])?(\d{1,2}))?/,
  )
  if (withYear) {
    const y1 = parseInt(withYear[1], 10)
    const m1 = parseInt(withYear[2], 10)
    const start = toDate(y1, m1, parseInt(withYear[3], 10))
    const end = withYear[6]
      ? toDate(
          withYear[4] ? parseInt(withYear[4], 10) : y1,
          withYear[5] ? parseInt(withYear[5], 10) : m1,
          parseInt(withYear[6], 10),
        )
      : start
    if (start && end) return end >= start ? { start, end } : { start, end: start }
  }

  // 1) 기간: "7/12~7/15", "7.12 - 7.15", "7-12~7-15", "7/12~15" (뒤쪽 월 생략 허용)
  const range = s.match(/(\d{1,2})[/.\-](\d{1,2})\s*[~\-]\s*(?:(\d{1,2})[/.\-])?(\d{1,2})/)
  if (range) {
    const m1 = parseInt(range[1], 10), d1 = parseInt(range[2], 10)
    const m2 = range[3] ? parseInt(range[3], 10) : m1
    const d2 = parseInt(range[4], 10)
    const start = toDate(year, m1, d1)
    // "12/28~1/3"처럼 뒤쪽 월이 더 작으면 해를 넘기는 기간
    const end = toDate(m2 < m1 ? year + 1 : year, m2, d2)
    if (start && end) return end >= start ? { start, end } : { start, end: start }
  }

  // 2) 열린 기간: "7/19~" — 종료 미정이므로 그 달 말일까지로 본다
  const openEnded = s.match(/(\d{1,2})[/.\-](\d{1,2})\s*[~\-](?!\s*\d)/)
  if (openEnded) {
    const m = parseInt(openEnded[1], 10)
    const start = toDate(year, m, parseInt(openEnded[2], 10))
    const end = toDate(year, m, lastDayOfMonth(year, m))
    if (start && end) return { start, end }
  }

  // 3) "7월 12일" / "7월12일~15일" / "7월 23", "7월12~15" (일 생략 허용)
  const koDay = s.match(/(\d{1,2})월\s*(\d{1,2})일?(?:\s*[~\-]\s*(\d{1,2})일?)?/)
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

  // 6) 단일 날짜: "7/20", "7.20", "7-20"
  const single = s.match(/(\d{1,2})[/.\-](\d{1,2})/)
  if (single) {
    const d = toDate(year, parseInt(single[1], 10), parseInt(single[2], 10))
    if (d) return { start: d, end: d }
  }

  return null
}

// "YYYY-MM-DD"에 n개월을 더한 날짜 (일은 말일로 보정)
function shiftMonths(dateStr: string, n: number): string {
  const y = parseInt(dateStr.slice(0, 4), 10)
  const m = parseInt(dateStr.slice(5, 7), 10)
  const d = parseInt(dateStr.slice(8, 10), 10)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return toDate(ny, nm, d) ?? dateStr
}

// 연도 없는 구간은 기준일에서 앞뒤 6개월 안쪽이 되는 연도로 해석한다.
// 예) 기준 2026-11-25: "1월" → 2027-01, "7월" → 2026-07(지남), "12/5" → 2026-12-05
// 연도가 명시된 표기는 연도를 바꿔 해석해도 결과가 같으므로 그대로 유지된다.
function parseSegmentNear(s: string, refStr: string): VisitRange | null {
  const year = parseInt(refStr.slice(0, 4), 10)
  const r = parseSegment(s, year)
  if (!r) return null
  if (r.end < shiftMonths(refStr, -6)) return parseSegment(s, year + 1) ?? r
  if (r.start > shiftMonths(refStr, 6)) return parseSegment(s, year - 1) ?? r
  return r
}

// 연도가 명시된 표기("2026-07-23")는 그 연도로, 없는 자유 메모는 기준일(refStr)에서 가까운 연도로 해석한다.
// 기준일은 보통 오늘이고, 대표 날짜를 직접 입력했다면 그 날짜를 기준으로 삼는다
// (예: 대표 날짜 2027-01-10 + 메모 "1월 방문" → 2027-01-01~01-31).
// "6/27~7/1 부산 / 7월중 제주"처럼 여러 일정이 있으면 전체를 아우르는 범위로 합친다
// (지남 판정은 마지막 일정 기준이 되어 미래 일정이 지워지지 않는다).
export function parseVisitNote(note: string | null | undefined, refStr: string): VisitRange | null {
  if (!note) return null
  // 전각 물결(～)·대시 통일 후 " / ", 콤마, 가운뎃점으로 구간 분리 (날짜의 /와 구분)
  const s = note.trim().replace(/[～〜]/g, '~').replace(/[–—−]/g, '-')
  if (!s) return null

  const ranges = s.split(/\s+\/\s+|[,·]/)
    .map(seg => parseSegmentNear(seg.trim(), refStr))
    .filter((r): r is VisitRange => r !== null)
  if (ranges.length === 0) return null

  return {
    start: ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0].start),
    end:   ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0].end),
  }
}

// 메모 + 직접 입력한 대표 날짜 → 저장할 시작/종료일.
// 대표 날짜가 있으면 시작일은 그것을 우선하고, 메모 해석의 기준일로도 쓴다.
// 종료일이 시작일보다 앞서는 일은 없도록 보정한다 (메모가 다른 시기를 가리켜도 대표 날짜는 살린다).
export function resolveVisitRange(
  note: string | null | undefined,
  explicitDate: string | null | undefined,
  todayStr: string,
): { start: string | null; end: string | null } {
  const explicit = explicitDate || null
  const parsed = parseVisitNote(note, explicit ?? todayStr)
  const start = explicit ?? parsed?.start ?? null
  let end = parsed?.end ?? explicit ?? null
  if (start && end && end < start) end = start
  return { start, end }
}
