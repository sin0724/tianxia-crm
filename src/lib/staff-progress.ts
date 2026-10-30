import { unstable_cache } from 'next/cache'

// 재무 앱의 프로젝트 진행 현황. 시크릿은 서버에서만 읽고 응답·에러에 넣지 않는다.
//
// 대시보드 레이아웃이 dynamic = 'force-dynamic' 이라 fetch 캐시가 no-store 로 꺼진다.
// 그래서 데이터 캐시(unstable_cache, 60초)로 직원 전체가 같은 응답을 재사용한다.

export const STAFF_PROGRESS_REVALIDATE_SECONDS = 60

export const PROJECT_CATEGORIES = ['Dcard', 'PTT', 'Threads', 'PR', 'KOC', 'KOL'] as const

export const PROJECT_STATUSES = ['ongoing', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ongoing: '진행중',
  completed: '완료',
  cancelled: '취소',
}

export const STAFF_PROGRESS_UNCONFIGURED_MESSAGE =
  '재무 시스템 연동이 설정되지 않아 프로젝트 현황을 불러올 수 없습니다. 관리자에게 문의해 주세요.'

export const STAFF_PROGRESS_UNAVAILABLE_MESSAGE =
  '재무 시스템에서 프로젝트 현황을 가져오지 못했습니다. 잠시 후 다시 확인해 주세요.'

const AUTH_FAILED_MESSAGE =
  '재무 시스템 인증에 실패했습니다. 연동 설정을 확인해 주세요.'

const BAD_PAYLOAD_MESSAGE =
  '재무 시스템 응답 형식을 해석하지 못했습니다.'

export interface StaffProjectItem {
  project_item_id: string
  category: string
  product_name: string
  contracted: number
  delivered: number
  remaining: number
}

export interface StaffProjectTotals {
  contracted: number
  delivered: number
  remaining: number
}

export interface StaffProject {
  project_id: string
  client_id: string | null
  client_name: string
  project_name: string
  status: string
  contract_date: string | null
  assignee_employee_id: string | null
  assignee_name: string | null
  contract_amount: number
  paid_amount: number
  items: StaffProjectItem[]
  totals: StaffProjectTotals
}

export type StaffProgressResult =
  | { ok: true; projects: StaffProject[] }
  | { ok: false; reason: 'unconfigured' | 'error'; message: string }

export interface ProjectListFilters {
  assignee?: string
  status?: string
  category?: string
  q?: string
}

export interface ProgressSummary {
  ongoing: number
  contractAmount: number
  paidAmount: number
  remaining: number
}

export interface AssigneeSummary extends ProgressSummary {
  assignee: string
  projects: number
}

interface FetcherResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type StaffProgressFetcher = (
  url: string,
  init: {
    method: 'GET'
    headers: { Authorization: string; Accept: string }
    redirect: 'manual'
    signal: AbortSignal
  },
) => Promise<FetcherResponse>

// 거래처 중복 검사(duplicate-actions)와 같은 규칙. 공백·괄호·구분 기호를 뺀 소문자.
export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[\s()[\]（）【】·•\-_.,'"]/g, '')
}

export function statusLabel(status: string): string {
  return status in PROJECT_STATUS_LABEL
    ? PROJECT_STATUS_LABEL[status as ProjectStatus]
    : status || '—'
}

export function formatContractDate(value: string | null): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${year}.${month}.${day}`
  }
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time))
  const [year, month, day] = parts.split('-')
  return `${year}.${month}.${day}`
}

export function progressPercent(contracted: number, delivered: number): number {
  if (contracted <= 0) return delivered > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((delivered / contracted) * 100)))
}

export function assigneeLabel(project: StaffProject, projects: StaffProject[]): string {
  const name = project.assignee_name?.trim() || '미배정'
  const ids = new Set(
    projects
      .filter(row => (row.assignee_name?.trim() || '미배정') === name)
      .map(row => row.assignee_employee_id)
      .filter((id): id is string => !!id),
  )
  if (ids.size > 1 && project.assignee_employee_id) {
    return `${name} (${project.assignee_employee_id})`
  }
  return name
}

export function assigneeChoices(projects: StaffProject[]): string[] {
  const labels = [...new Set(projects.map(project => assigneeLabel(project, projects)))]
  return labels.sort((a, b) => {
    if (a === '미배정') return 1
    if (b === '미배정') return -1
    return a.localeCompare(b, 'ko')
  })
}

export function categoryChoices(projects: StaffProject[]): string[] {
  const extras = new Set<string>()
  for (const project of projects) {
    for (const item of project.items) {
      if (!(PROJECT_CATEGORIES as readonly string[]).includes(item.category)) extras.add(item.category)
    }
  }
  return [
    ...PROJECT_CATEGORIES,
    ...[...extras].sort((a, b) => a.localeCompare(b, 'ko')),
  ]
}

function clientMatches(name: string, query: string): boolean {
  if (name.toLowerCase().includes(query)) return true
  const normalizedQuery = normalizeCompanyName(query)
  return normalizedQuery.length > 0 && normalizeCompanyName(name).includes(normalizedQuery)
}

export function filterProjects(projects: StaffProject[], filters: ProjectListFilters): StaffProject[] {
  const assignee = filters.assignee?.trim() ?? ''
  const status = filters.status?.trim() ?? ''
  const category = filters.category?.trim() ?? ''
  const query = filters.q?.trim().toLowerCase() ?? ''
  return projects.filter(project => {
    if (assignee && assigneeLabel(project, projects) !== assignee) return false
    if (status && project.status !== status) return false
    if (category && !project.items.some(item => item.category === category)) return false
    if (query && !clientMatches(project.client_name, query)) return false
    return true
  })
}

export function itemsFor(project: StaffProject, category?: string): StaffProjectItem[] {
  const selected = category?.trim()
  if (!selected) return project.items
  return project.items.filter(item => item.category === selected)
}

function remainingOf(project: StaffProject, category?: string): number {
  if (!category?.trim()) return project.totals.remaining
  return itemsFor(project, category).reduce((sum, item) => sum + item.remaining, 0)
}

export function summarize(projects: StaffProject[], category?: string): ProgressSummary {
  return projects.reduce<ProgressSummary>((acc, project) => {
    if (project.status === 'ongoing') acc.ongoing += 1
    acc.contractAmount += project.contract_amount
    acc.paidAmount += project.paid_amount
    acc.remaining += remainingOf(project, category)
    return acc
  }, { ongoing: 0, contractAmount: 0, paidAmount: 0, remaining: 0 })
}

export function summarizeByAssignee(
  projects: StaffProject[],
  all: StaffProject[],
  category?: string,
): AssigneeSummary[] {
  const grouped = new Map<string, AssigneeSummary>()
  for (const project of projects) {
    const assignee = assigneeLabel(project, all)
    const row = grouped.get(assignee) ?? {
      assignee,
      projects: 0,
      ongoing: 0,
      contractAmount: 0,
      paidAmount: 0,
      remaining: 0,
    }
    row.projects += 1
    if (project.status === 'ongoing') row.ongoing += 1
    row.contractAmount += project.contract_amount
    row.paidAmount += project.paid_amount
    row.remaining += remainingOf(project, category)
    grouped.set(assignee, row)
  }
  return [...grouped.values()].sort(
    (a, b) => b.contractAmount - a.contractAmount || a.assignee.localeCompare(b.assignee, 'ko'),
  )
}

const STATUS_RANK: Record<string, number> = { ongoing: 0, completed: 1, cancelled: 2 }

export function sortProjects(projects: StaffProject[]): StaffProject[] {
  return [...projects].sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    if (rank !== 0) return rank
    const date = (b.contract_date ?? '').localeCompare(a.contract_date ?? '')
    if (date !== 0) return date
    return a.client_name.localeCompare(b.client_name, 'ko')
  })
}

// 완전 일치가 하나면 그 거래처, 아니면 정규화 일치가 하나일 때만 연결한다.
export function linkCompanyId(
  clientName: string,
  companies: { id: string; company_name: string }[],
): string | null {
  const trimmed = clientName.trim()
  if (!trimmed) return null
  const exact = companies.filter(company => company.company_name.trim() === trimmed)
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) return null
  const key = normalizeCompanyName(trimmed)
  if (!key) return null
  const normalized = companies.filter(company => normalizeCompanyName(company.company_name) === key)
  return normalized.length === 1 ? normalized[0].id : null
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function parseItem(raw: unknown): StaffProjectItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asText(row.project_item_id)
  if (!id) return null
  return {
    project_item_id: id,
    category: asText(row.category) ?? '—',
    product_name: asText(row.product_name) ?? '—',
    contracted: asNumber(row.contracted),
    delivered: asNumber(row.delivered),
    remaining: asNumber(row.remaining),
  }
}

function sumItems(items: StaffProjectItem[]): StaffProjectTotals {
  return items.reduce<StaffProjectTotals>((acc, item) => {
    acc.contracted += item.contracted
    acc.delivered += item.delivered
    acc.remaining += item.remaining
    return acc
  }, { contracted: 0, delivered: 0, remaining: 0 })
}

function parseTotals(raw: unknown, items: StaffProjectItem[]): StaffProjectTotals {
  const fallback = sumItems(items)
  if (!raw || typeof raw !== 'object') return fallback
  const row = raw as Record<string, unknown>
  return {
    contracted: 'contracted' in row ? asNumber(row.contracted) : fallback.contracted,
    delivered: 'delivered' in row ? asNumber(row.delivered) : fallback.delivered,
    remaining: 'remaining' in row ? asNumber(row.remaining) : fallback.remaining,
  }
}

function parseProject(raw: unknown): StaffProject | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const projectId = asText(row.project_id)
  if (!projectId) return null
  const items = Array.isArray(row.items)
    ? row.items.map(parseItem).filter((item): item is StaffProjectItem => item !== null)
    : []
  const status = asText(row.status) ?? ''
  return {
    project_id: projectId,
    client_id: asText(row.client_id),
    client_name: asText(row.client_name) ?? '—',
    project_name: asText(row.project_name) ?? '—',
    status,
    contract_date: asText(row.contract_date),
    assignee_employee_id: asText(row.assignee_employee_id),
    assignee_name: asText(row.assignee_name),
    contract_amount: asNumber(row.contract_amount),
    paid_amount: asNumber(row.paid_amount),
    items,
    totals: parseTotals(row.totals, items),
  }
}

function rowsFromPayload(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  for (const key of ['projects', 'rows', 'data']) {
    if (Array.isArray(row[key])) return row[key]
  }
  if (asText(row.project_id)) return [row]
  return null
}

export function parseStaffProjects(payload: unknown): StaffProject[] | null {
  const rows = rowsFromPayload(payload)
  if (!rows) return null
  const projects = rows.map(parseProject).filter((project): project is StaffProject => project !== null)
  if (rows.length > 0 && projects.length === 0) return null
  return projects
}

function progressUrl(apiUrl: string): string | null {
  let base: URL
  try {
    base = new URL(apiUrl)
  } catch {
    return null
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null
  if (base.username || base.password) return null
  return `${base.toString().replace(/\/$/, '')}/api/integrations/staff-progress`
}

export async function fetchStaffProgress(options?: {
  apiUrl?: string | null
  secret?: string | null
  fetchImpl?: StaffProgressFetcher
}): Promise<StaffProgressResult> {
  const apiUrl = (options?.apiUrl ?? process.env.FINANCE_API_URL)?.trim() ?? ''
  const secret = (options?.secret ?? process.env.FINANCE_STAFF_PROGRESS_SECRET)?.trim() ?? ''
  if (!apiUrl || !secret) {
    return { ok: false, reason: 'unconfigured', message: STAFF_PROGRESS_UNCONFIGURED_MESSAGE }
  }
  const url = progressUrl(apiUrl)
  if (!url) {
    return { ok: false, reason: 'error', message: STAFF_PROGRESS_UNAVAILABLE_MESSAGE }
  }

  const fetchImpl = options?.fetchImpl ?? ((input, init) => fetch(input, { ...init, cache: 'no-store' }))
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, reason: 'error', message: STAFF_PROGRESS_UNAVAILABLE_MESSAGE }
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: 'error',
        message: response.status === 401 || response.status === 403
          ? AUTH_FAILED_MESSAGE
          : `재무 시스템에서 프로젝트 현황을 가져오지 못했습니다. (HTTP ${response.status})`,
      }
    }
    const projects = parseStaffProjects(await response.json())
    if (!projects) return { ok: false, reason: 'error', message: BAD_PAYLOAD_MESSAGE }
    return { ok: true, projects }
  } catch {
    return { ok: false, reason: 'error', message: STAFF_PROGRESS_UNAVAILABLE_MESSAGE }
  }
}

const cachedStaffProgress = unstable_cache(
  () => fetchStaffProgress(),
  ['finance-staff-progress'],
  { revalidate: STAFF_PROGRESS_REVALIDATE_SECONDS },
)

export function loadStaffProgress(): Promise<StaffProgressResult> {
  return cachedStaffProgress()
}
