import Link from 'next/link'
import {
  PROJECT_STATUSES,
  assigneeChoices,
  assigneeNameFor,
  categoryChoices,
  filterProjects,
  formatContractDate,
  itemsFor,
  linkCompanyId,
  sortProjects,
  statusLabel,
  summarize,
  summarizeByAssignee,
  type CompanyAssigneeRecord,
  type ProjectListFilters,
  type StaffProject,
} from '@/lib/staff-progress'

const fieldCls =
  'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3182f6]/30'

const STATUS_BADGE: Record<string, string> = {
  ongoing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-200 text-gray-500',
}

function fmtWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

function fmtCount(count: number): string {
  return count.toLocaleString('ko-KR')
}

function displayText(value: string | null): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'blue' | 'green' }) {
  const color = accent === 'green' ? 'text-[#3182f6]' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <p className="text-[13px] text-gray-500 mb-1.5">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
    </div>
  )
}

function ItemList({ project, category }: { project: StaffProject; category?: string }) {
  const items = itemsFor(project, category)
  if (items.length === 0) return <span className="text-xs text-gray-400">항목 없음</span>
  return (
    <ul className="space-y-1.5 min-w-[180px]">
      {items.map((item, index) => (
        <li key={`${index}-${item.category ?? ''}-${item.product_name ?? ''}`} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {displayText(item.category)}
            </span>
            <span className="truncate text-xs font-medium text-gray-800">{displayText(item.product_name)}</span>
          </span>
          <span className="shrink-0 text-xs text-gray-700">{fmtCount(item.contracted)}</span>
        </li>
      ))}
    </ul>
  )
}

export function ProjectStatusView({
  projects,
  companies,
  assigneeDirectory,
  filters,
}: {
  projects: StaffProject[]
  companies: { id: string; company_name: string }[]
  assigneeDirectory: CompanyAssigneeRecord[]
  filters: ProjectListFilters
}) {
  const filtered = sortProjects(filterProjects(projects, filters, assigneeDirectory))
  const summary = summarize(filtered, filters.category)
  const byAssignee = summarizeByAssignee(filtered, assigneeDirectory, filters.category)
  const assignees = assigneeChoices(projects, assigneeDirectory)
  const categories = categoryChoices(projects)
  const hasFilter = Boolean(filters.assignee || filters.status || filters.category || filters.q?.trim())

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        재무 시스템 기준 · 약 1분마다 갱신됩니다. 담당자는 고객사명을 CRM 거래처와 맞춰 표시하고, 맞지 않으면 미매칭입니다.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="진행중 프로젝트 수" value={fmtCount(summary.ongoing)} />
        <StatCard label="계약금액 합계" value={fmtWon(summary.contractAmount)} accent="green" />
        <StatCard label="입금액 합계" value={fmtWon(summary.paidAmount)} accent="green" />
        <StatCard label="계약 건수 합계" value={fmtCount(summary.contractedCount)} />
      </div>
      {filters.category && (
        <p className="text-xs text-gray-400">
          금액은 프로젝트 전체 기준이고, 계약 건수는 선택한 카테고리만 합산합니다.
        </p>
      )}

      <form action="/projects" className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select name="assignee" defaultValue={filters.assignee ?? ''} aria-label="담당자" className={fieldCls}>
            <option value="">전체 담당자</option>
            {assignees.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select name="status" defaultValue={filters.status ?? ''} aria-label="상태" className={fieldCls}>
            <option value="">전체 상태</option>
            {PROJECT_STATUSES.map(status => (
              <option key={status} value={status}>{statusLabel(status)}</option>
            ))}
          </select>
          <select name="category" defaultValue={filters.category ?? ''} aria-label="카테고리" className={fieldCls}>
            <option value="">전체 카테고리</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="고객사 검색"
            aria-label="고객사 검색"
            className={`${fieldCls} min-w-[10rem] flex-1`}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#3182f6] text-white text-sm font-medium rounded-xl hover:bg-[#1b64da] transition-colors"
          >
            적용
          </button>
          {hasFilter && (
            <Link href="/projects" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">
              초기화
            </Link>
          )}
          <span className="ml-auto text-sm text-gray-400">
            전체 {fmtCount(projects.length)}건 중 {fmtCount(filtered.length)}건
          </span>
        </div>
      </form>

      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="px-4 py-3 text-left whitespace-nowrap">고객사</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">프로젝트</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">담당자</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">상태</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">계약일</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">계약금액</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">입금액</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">항목 (카테고리/상품/계약)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    {hasFilter ? '조건에 맞는 프로젝트가 없습니다.' : '표시할 프로젝트가 없습니다.'}
                  </td>
                </tr>
              ) : filtered.map((project, index) => {
                const companyId = project.client ? linkCompanyId(project.client, companies) : null
                return (
                  <tr key={`${index}-${project.client ?? ''}-${project.project}`} className="align-top hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {companyId ? (
                        <Link href={`/companies/${companyId}`} className="font-medium text-gray-900 hover:text-[#3182f6] hover:underline">
                          {project.client}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">{displayText(project.client)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{displayText(project.project)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{assigneeNameFor(project.client ?? '', assigneeDirectory)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[project.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel(project.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatContractDate(project.contract_date)}</td>
                    <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{fmtWon(project.contract_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{fmtWon(project.paid_amount)}</td>
                    <td className="px-4 py-3"><ItemList project={project} category={filters.category} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold tracking-tight text-gray-900 mb-3">담당자별 요약</h2>
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-4 py-3 text-left whitespace-nowrap">담당자</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">프로젝트</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">진행중</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">계약금액</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">입금액</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">계약 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byAssignee.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">표시할 담당자가 없습니다.</td>
                  </tr>
                ) : byAssignee.map(row => (
                  <tr key={row.assignee} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.assignee}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmtCount(row.projects)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{fmtCount(row.ongoing)}</td>
                    <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{fmtWon(row.contractAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{fmtWon(row.paidAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{fmtCount(row.contractedCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
