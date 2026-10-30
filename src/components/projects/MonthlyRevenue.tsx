import Link from 'next/link'
import {
  UNMATCHED_ASSIGNEE,
  buildRevenueTable,
  monthSnapshot,
  type CompanyAssigneeRecord,
  type FinanceClientAlias,
  type ProjectListFilters,
  type RevenueMetric,
  type StaffProject,
} from '@/lib/staff-progress'

const fieldCls =
  'px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3182f6]/30'

function fmtWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

function queryHref(filters: ProjectListFilters, month: string, metric: RevenueMetric): string {
  const params = new URLSearchParams()
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.q) params.set('q', filters.q)
  params.set('month', month)
  if (metric === 'deposit') params.set('metric', 'deposit')
  return `/projects?${params.toString()}`
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <p className="text-[13px] text-gray-500 mb-1.5">{label}</p>
      <p className="text-xl font-bold tracking-tight text-gray-900">{value}</p>
    </div>
  )
}

export function MonthlyRevenue({
  projects,
  companies,
  aliases,
  filters,
  month,
  metric,
}: {
  projects: StaffProject[]
  companies: CompanyAssigneeRecord[]
  aliases: FinanceClientAlias[]
  filters: ProjectListFilters
  month: string
  metric: RevenueMetric
}) {
  const year = Number(month.slice(0, 4))
  const table = buildRevenueTable(projects, companies, year, metric, aliases)
  const snapshot = monthSnapshot(projects, companies, month, aliases)
  const top = metric === 'deposit' ? snapshot.topDeposit : snapshot.topContract
  const maxCell = Math.max(1, ...table.rows.flatMap(row => row.amounts))
  const monthIndex = table.months.indexOf(month)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-gray-900">월별 매출</h2>
          <p className="mt-1 text-xs text-gray-400">
            {year}년 · 계약매출은 계약일, 입금매출은 입금일의 한국 시간 기준입니다. 위 필터가 적용된 프로젝트만 집계합니다.
          </p>
        </div>
        <form action="/projects" className="flex flex-wrap items-center gap-2">
          {filters.assignee && <input type="hidden" name="assignee" value={filters.assignee} />}
          {filters.status && <input type="hidden" name="status" value={filters.status} />}
          {filters.category && <input type="hidden" name="category" value={filters.category} />}
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          {metric === 'deposit' && <input type="hidden" name="metric" value="deposit" />}
          <input
            type="month"
            name="month"
            aria-label="기준 월"
            defaultValue={month}
            className={fieldCls}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#3182f6] text-white text-sm font-medium rounded-xl hover:bg-[#1b64da] transition-colors"
          >
            적용
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={queryHref(filters, month, 'contract')}
          aria-current={metric === 'contract' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${metric === 'contract' ? 'bg-[#3182f6] text-white' : 'bg-white text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}
        >
          계약매출
        </Link>
        <Link
          href={queryHref(filters, month, 'deposit')}
          aria-current={metric === 'deposit' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${metric === 'deposit' ? 'bg-[#3182f6] text-white' : 'bg-white text-gray-600 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`}
        >
          입금매출
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="이번달 계약매출" value={fmtWon(snapshot.contract)} />
        <StatCard label="이번달 입금" value={fmtWon(snapshot.deposit)} />
        <StatCard
          label={metric === 'deposit' ? '이번달 담당자 1위 · 입금' : '이번달 담당자 1위 · 계약'}
          value={top ? `${top.assignee} ${fmtWon(top.amount)}` : '—'}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-3 py-3 text-left whitespace-nowrap">담당자</th>
                {table.months.map((label, index) => (
                  <th
                    key={label}
                    className={`px-2 py-3 text-right whitespace-nowrap ${index === monthIndex ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    {Number(label.slice(5))}월
                  </th>
                ))}
                <th className="px-3 py-3 text-right whitespace-nowrap">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-gray-400">표시할 매출이 없습니다.</td>
                </tr>
              ) : table.rows.map(row => (
                <tr key={row.assignee} className="hover:bg-gray-50">
                  <td className={`px-3 py-2 font-medium whitespace-nowrap ${row.assignee === UNMATCHED_ASSIGNEE ? 'text-gray-400' : 'text-gray-900'}`}>
                    {row.assignee}
                  </td>
                  {row.amounts.map((amount, index) => (
                    <td
                      key={table.months[index]}
                      className={`px-2 py-2 text-right whitespace-nowrap ${index === monthIndex ? 'bg-blue-50' : ''}`}
                    >
                      <div className="text-gray-800">{amount ? amount.toLocaleString('ko-KR') : '0'}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                        <div
                          className="h-full rounded-full bg-[#3182f6]"
                          style={{ width: `${Math.round((amount / maxCell) * 100)}%` }}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                    {row.total.toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-3 whitespace-nowrap">총 월매출</td>
                {table.totals.map((amount, index) => (
                  <td
                    key={table.months[index]}
                    className={`px-2 py-3 text-right whitespace-nowrap ${index === monthIndex ? 'bg-blue-50' : ''}`}
                  >
                    {amount.toLocaleString('ko-KR')}
                  </td>
                ))}
                <td className="px-3 py-3 text-right whitespace-nowrap">{table.grand.toLocaleString('ko-KR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  )
}
