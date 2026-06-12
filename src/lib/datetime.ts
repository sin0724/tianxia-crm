// ── KST(Asia/Seoul) 기준 날짜 헬퍼 ───────────────────────────
// 서버가 UTC(Railway 등)로 돌아도 "오늘/이번 주/이번 달" 경계가
// 한국 시간 기준으로 계산되도록 모든 서버 코드는 이 헬퍼를 사용한다.
// KST는 DST가 없는 고정 +09:00이므로 오프셋 연산이 정확하다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 현재 시각의 KST 달력 구성요소 (UTC getter로 읽기 위해 +9h 시프트)
function kstCalendar(base: Date = new Date()) {
  const shifted = new Date(base.getTime() + KST_OFFSET_MS)
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0=일요일
  }
}

// KST 달력상 (y, m, d) 00:00:00 시점을 실제 UTC Date로 변환
function kstMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - KST_OFFSET_MS)
}

/** KST 기준 오늘 00:00:00 */
export function kstStartOfDay(): Date {
  const { y, m, d } = kstCalendar()
  return kstMidnight(y, m, d)
}

/** KST 기준 오늘 23:59:59.999 */
export function kstEndOfDay(): Date {
  return new Date(kstStartOfDay().getTime() + DAY_MS - 1)
}

/** KST 기준 오늘의 ISO 범위 { start, end } */
export function kstTodayRange(): { start: string; end: string } {
  return { start: kstStartOfDay().toISOString(), end: kstEndOfDay().toISOString() }
}

/** KST 기준 n일 전 23:59:59.999 (ISO) — "n일 이상 경과" 컷오프용 */
export function kstDaysAgoEnd(n: number): string {
  return new Date(kstStartOfDay().getTime() - (n - 1) * DAY_MS - 1).toISOString()
}

/** KST 기준 오늘 날짜 "YYYY-MM-DD" */
export function kstDateString(base: Date = new Date()): string {
  const { y, m, d } = kstCalendar(base)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** KST 기준 이번 달 1일 00:00:00 */
export function kstStartOfMonth(): Date {
  const { y, m } = kstCalendar()
  return kstMidnight(y, m, 1)
}

/** KST 기준 이번 주 월요일 00:00:00 */
export function kstStartOfWeek(): Date {
  const { y, m, d, weekday } = kstCalendar()
  const offset = weekday === 0 ? 6 : weekday - 1
  return kstMidnight(y, m, d - offset)
}

/** KST 기준 이번 주 일요일 23:59:59.999 */
export function kstEndOfWeek(): Date {
  return new Date(kstStartOfWeek().getTime() + 7 * DAY_MS - 1)
}

// ── KST 표시 포맷 ────────────────────────────────────────────

const TZ = 'Asia/Seoul'

/** "06.11" 형식 */
export function fmtDateKST(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', {
    timeZone: TZ, month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

/** "2026.06.11" 형식 */
export function fmtFullDateKST(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

/** "06.11. 14:30" 형식 */
export function fmtDateTimeKST(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('ko-KR', {
    timeZone: TZ, month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "2026. 06. 11. 14:30" 형식 */
export function fmtFullDateTimeKST(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('ko-KR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "2026년 6월 11일 목요일" 형식 */
export function todayLabelKST(): string {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}
