// ── KOL 변경 로그 (감사 로그) ─────────────────────────────────
// KOL 리스트에 손을 댄 기록을 남기고(logKolAudit), admin 전용 화면에서 조회한다.
// 기록은 작업자 세션으로 삽입되므로 RLS가 actor_id = auth.uid()를 강제한다.
// 열람은 RLS(admin만)와 페이지의 requireRole(['admin'])이 이중으로 막는다.

import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { kstDayEndISO, kstDayStartISO } from '@/lib/datetime'
import { fmtFollowers, fmtMoney, type KolLogAction, type KolLogTarget } from '@/lib/constants'

// ── 기록 ──────────────────────────────────────────────────────

export interface KolAuditEntry {
  actor: Profile
  action: KolLogAction
  /** 기본값 'kol' */
  target?: KolLogTarget
  targetId?: string | null
  /** 대상 이름 스냅샷 — 삭제 후에도 무엇이었는지 남기기 위해 저장 */
  targetName?: string | null
  summary?: string | null
  details?: Record<string, unknown> | null
  itemCount?: number | null
}

// 로그 기록 실패가 본 작업(등록·수정·삭제)을 되돌리거나 막으면 안 되므로
// 이 함수는 절대 throw하지 않는다. 실패는 서버 로그로만 남긴다.
export async function logKolAudit(entry: KolAuditEntry): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('kol_audit_logs').insert({
      actor_id:    entry.actor.id,
      actor_name:  entry.actor.name,
      actor_email: entry.actor.email,
      action:      entry.action,
      target_type: entry.target ?? 'kol',
      target_id:   entry.targetId ?? null,
      target_name: entry.targetName ?? null,
      summary:     entry.summary ?? null,
      details:     entry.details ?? null,
      item_count:  entry.itemCount ?? null,
    })
    if (error) console.error('[kol-audit] 로그 기록 실패:', error.message)
  } catch (e) {
    console.error('[kol-audit] 로그 기록 실패:', e)
  }
}

// ── 변경 내역 요약 ────────────────────────────────────────────

// 로그에 남길 KOL 필드와 표시 이름 (순서 = 요약에 나오는 순서)
const KOL_FIELDS: [string, string][] = [
  ['name',              '이름'],
  ['instagram_handle',  '인스타그램'],
  ['email',             '이메일'],
  ['followers',         '팔로워'],
  ['categories',        '카테고리'],
  ['fee_amount',        '고정비'],
  ['fee_currency',      '통화'],
  ['rs_rate',           'RS 요율'],
  ['deliverables',      '제공 항목'],
  ['gonggu_categories', '공구 카테고리'],
  ['visit_note',        '방문 메모'],
  ['visit_date',        '방문 시작일'],
  ['visit_end_date',    '방문 종료일'],
  ['history',           '히스토리'],
]

const LONG_TEXT_LIMIT = 60

// 값을 비교·표시용 문자열로 정규화. NUMERIC 컬럼이 문자열로 올 수 있어
// 숫자는 Number를 거친 뒤 비교한다 (13300 vs "13300"을 변경으로 오인하지 않게).
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '—'
  if (typeof v === 'number') return v.toLocaleString('ko-KR')
  const s = String(v)
  const n = Number(s)
  if (s.trim() !== '' && Number.isFinite(n)) return n.toLocaleString('ko-KR')
  return s.length > LONG_TEXT_LIMIT ? `${s.slice(0, LONG_TEXT_LIMIT)}…` : s
}

export interface FieldChange {
  label: string
  from: string
  to: string
}

/** 수정 전후 행을 비교해 바뀐 필드만 뽑는다 */
export function diffKolFields(
  before: Record<string, unknown> | null | undefined,
  after: object,
): FieldChange[] {
  if (!before) return []
  const next = after as Record<string, unknown>
  const changes: FieldChange[] = []
  for (const [key, label] of KOL_FIELDS) {
    if (!(key in next)) continue
    const from = fmtValue(before[key])
    const to   = fmtValue(next[key])
    if (from !== to) changes.push({ label, from, to })
  }
  return changes
}

const SUMMARY_MAX_FIELDS = 3

/** "팔로워 80,000 → 95,000 · 고정비 — → NT$13,300 외 2건" */
export function summarizeChanges(changes: FieldChange[]): string {
  if (changes.length === 0) return '변경 없음 (재저장)'
  const head = changes
    .slice(0, SUMMARY_MAX_FIELDS)
    .map(c => `${c.label} ${c.from} → ${c.to}`)
    .join(' · ')
  const rest = changes.length - SUMMARY_MAX_FIELDS
  return rest > 0 ? `${head} 외 ${rest}건` : head
}

interface KolLike {
  instagram_handle?: string | null
  followers?: number | null
  fee_amount?: number | null
  fee_currency?: string | null
  categories?: string[] | null
}

/** 등록·삭제 로그용 한 줄 요약: "@yenpeiju · 9.5만 · NT$13,300 · 뷰티" */
export function describeKol(kol: KolLike): string {
  const parts: string[] = []
  if (kol.instagram_handle) parts.push(`@${kol.instagram_handle}`)
  if (kol.followers != null) parts.push(fmtFollowers(Number(kol.followers)))
  if (kol.fee_amount != null) parts.push(fmtMoney(Number(kol.fee_amount), kol.fee_currency ?? 'TWD'))
  if (kol.categories?.length) parts.push(kol.categories.join(', '))
  return parts.join(' · ')
}

const NAME_SAMPLE = 5

/** "A, B, C 외 7명" — 일괄 작업 로그용 */
export function summarizeNames(names: string[]): string {
  const head = names.slice(0, NAME_SAMPLE).join(', ')
  const rest = names.length - NAME_SAMPLE
  return rest > 0 ? `${head} 외 ${rest}명` : head
}

// 내보내기(복사) 로그에 "어떤 조건으로 뽑아갔는지"를 남긴다
const FILTER_LABELS: Record<string, string> = {
  q:               '검색어',
  category:        '카테고리',
  gonggu_category: '공구 카테고리',
  deliverable:     '제공 항목',
  followers_min:   '팔로워 최소(만)',
  followers_max:   '팔로워 최대(만)',
  fee_min:         '고정비 최소',
  fee_max:         '고정비 최대',
  fee_cur:         '고정비 통화',
  needs_review:    '원문 확인 필요',
  visit_from:      '방문 시작',
  visit_to:        '방문 종료',
  sort:            '정렬',
}

export function describeKolFilters(filters: Record<string, unknown>): string {
  const parts = Object.entries(FILTER_LABELS)
    .filter(([key]) => {
      const v = filters[key]
      return v !== undefined && v !== null && String(v).trim() !== ''
    })
    .map(([key, label]) => `${label} ${String(filters[key])}`)
  return parts.length > 0 ? parts.join(' · ') : '필터 없음(전체)'
}

// ── 조회 (admin 전용) ─────────────────────────────────────────

export interface KolAuditLog {
  id: string
  actor_id: string | null
  actor_name: string
  actor_email: string | null
  action: string
  target_type: string
  target_id: string | null
  target_name: string | null
  summary: string | null
  details: Record<string, unknown> | null
  item_count: number | null
  created_at: string
}

export interface KolAuditFilters {
  action?: string
  target?: string
  actor?: string      // actor_id
  from?: string       // "YYYY-MM-DD" (KST)
  to?: string
  q?: string          // 대상 이름·요약 검색
  page?: number
}

export const KOL_LOG_PAGE_SIZE = 50

export interface KolAuditListResult {
  logs: KolAuditLog[]
  total: number
  page: number
  pageCount: number
  /** 테이블이 아직 없을 때 (schema.sql 15번 섹션 미실행) 안내를 띄우기 위한 플래그 */
  tableMissing: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getKolAuditLogs(filters: KolAuditFilters = {}): Promise<KolAuditListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase
    .from('kol_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * KOL_LOG_PAGE_SIZE, page * KOL_LOG_PAGE_SIZE - 1)

  if (filters.action) query = query.eq('action', filters.action)
  if (filters.target) query = query.eq('target_type', filters.target)
  if (filters.actor)  query = query.eq('actor_id', filters.actor)
  if (filters.from && DATE_RE.test(filters.from)) query = query.gte('created_at', kstDayStartISO(filters.from))
  if (filters.to   && DATE_RE.test(filters.to))   query = query.lte('created_at', kstDayEndISO(filters.to))

  if (filters.q?.trim()) {
    // PostgREST or() 구문 보호: 와일드카드 이스케이프 후 값을 따옴표로 감쌈
    const safe = filters.q.trim().replace(/[%_\\]/g, '\\$&').replace(/"/g, '\\"')
    query = query.or(`target_name.ilike."%${safe}%",summary.ilike."%${safe}%",actor_name.ilike."%${safe}%"`)
  }

  const { data, count, error } = await query
  const total = count ?? 0
  return {
    logs: (data as KolAuditLog[]) ?? [],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / KOL_LOG_PAGE_SIZE)),
    tableMissing: error?.code === '42P01',
  }
}

/** 필터 드롭다운용 작업자 목록 — 로그에 실제로 등장한 사람만 (탈퇴자 포함) */
export async function getKolAuditActors(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kol_audit_logs')
    .select('actor_id, actor_name')
    .order('created_at', { ascending: false })
    .limit(2000)

  const byId = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.actor_id && !byId.has(row.actor_id)) byId.set(row.actor_id, row.actor_name)
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
}
