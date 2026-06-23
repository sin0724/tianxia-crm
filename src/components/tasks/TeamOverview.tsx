import Link from 'next/link'
import { KPI_TARGETS } from '@/lib/constants'

export interface RepOverviewRow {
  userId: string
  name: string
  todayActions: number
  overdue: number
  meetings: number
  longNoContact: number
  kolThisWeek: number
  threadsThisWeek: number
  meetingsThisWeek: number
}

/** 관리자/매니저용 팀 현황판 — 담당자별 오늘 업무량 + KPI 진행 상황 */
export function TeamOverview({ rows, unassignedCount }: { rows: RepOverviewRow[]; unassignedCount?: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">팀 현황판</h3>
        <span className="text-xs text-gray-400">
          KPI 목표(주): KOL {KPI_TARGETS.kolPerWeek}건 · 스레드 {KPI_TARGETS.threadsPerWeek}건 · 미팅 {KPI_TARGETS.meetingsPerWeek}건
        </span>
        {unassignedCount !== undefined && unassignedCount > 0 && (
          <Link
            href="/companies?assigned_to=none"
            className="ml-auto text-xs px-2.5 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-md hover:bg-orange-100 transition-colors"
          >
            📥 미배정 {unassignedCount}건 배분하기 →
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">활성 영업사원이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left whitespace-nowrap">담당자</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">기한 초과</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">오늘 액션</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">오늘 미팅</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">장기 미연락</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">KOL (주)</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">스레드 (주)</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">미팅 (주)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.userId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/companies?assigned_to=${r.userId}`}
                      className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={`px-4 py-3 text-center font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                    {r.overdue > 0 ? r.overdue : '—'}
                  </td>
                  <td className={`px-4 py-3 text-center ${r.todayActions > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                    {r.todayActions > 0 ? r.todayActions : '—'}
                  </td>
                  <td className={`px-4 py-3 text-center ${r.meetings > 0 ? 'text-purple-700 font-medium' : 'text-gray-300'}`}>
                    {r.meetings > 0 ? r.meetings : '—'}
                  </td>
                  <td className={`px-4 py-3 text-center ${r.longNoContact > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                    {r.longNoContact > 0 ? r.longNoContact : '—'}
                  </td>
                  <KpiCell value={r.kolThisWeek} target={KPI_TARGETS.kolPerWeek} />
                  <KpiCell value={r.threadsThisWeek} target={KPI_TARGETS.threadsPerWeek} />
                  <KpiCell value={r.meetingsThisWeek} target={KPI_TARGETS.meetingsPerWeek} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KpiCell({ value, target }: { value: number; target: number }) {
  const done = value >= target
  return (
    <td className={`px-4 py-3 text-center whitespace-nowrap font-medium ${done ? 'text-green-600' : 'text-gray-600'}`}>
      {value}<span className="text-gray-400 font-normal">/{target}</span>{done && ' ✓'}
    </td>
  )
}
