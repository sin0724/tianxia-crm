import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { requireRole } from '@/lib/auth'
import { getAssignmentOverview } from '@/lib/companies'

// 배분 현황 (admin/manager 전용)
// 담당자별 보유 거래처와 배분 회차별 내역을 보여줘
// "누구한테 몇 건씩 갔는지"를 한눈에 확인할 수 있게 한다.
// 배분 이력·합계는 admin에게만 노출된다.

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function AssignmentsPage() {
  const profile = await requireRole(['admin', 'manager'])
  const isAdmin = profile.role === 'admin'
  const { unassigned, loads, batches, recentTotals } = await getAssignmentOverview()
  const maxLoad = Math.max(1, ...loads.map(l => l.total))

  return (
    <>
      <Header title="배분 현황" />
      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            담당자별 보유 거래처와 배분 이력 (마지막 배정 기준)
          </p>
          <Link href="/companies" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            ← 거래처 목록
          </Link>
        </div>

        {/* 미배정 대기 */}
        <Link
          href="/companies?assigned_to=none"
          className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm text-gray-500">미배정 (배분 대기)</span>
          <span className="ml-3 text-lg font-semibold text-gray-900">{unassigned}건</span>
          <span className="ml-2 text-sm text-blue-600">목록 보기 →</span>
        </Link>

        {/* 담당자별 보유 현황 */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">
            담당자별 보유 현황
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2 font-medium">담당자</th>
                  <th className="px-4 py-2 font-medium text-right">보유 거래처</th>
                  <th className="px-4 py-2 font-medium text-right">미연락(신규)</th>
                  <th className="px-4 py-2 font-medium w-1/3">비중</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loads.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">배정된 거래처가 없습니다.</td></tr>
                )}
                {loads.map(l => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{l.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.total}건</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {l.uncontacted > 0
                        ? <span className="text-amber-600 font-medium">{l.uncontacted}건</span>
                        : <span className="text-gray-400">0건</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.round((l.total / maxLoad) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/companies?assigned_to=${l.id}`} className="text-blue-600 hover:underline whitespace-nowrap">
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 담당자별 배분 합계 + 배분 이력 (admin 전용) */}
        {isAdmin && (
        <>
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">
            담당자별 배분 합계 <span className="font-normal text-gray-400">— 최근 50회 기준</span>
          </h2>
          {recentTotals.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">배분 이력이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {recentTotals.map(t => (
                <span key={t.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm">
                  <span className="font-medium text-gray-900">{t.name}</span>
                  <span className="text-blue-700 font-semibold tabular-nums">{t.count}건</span>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">
            배분 이력 <span className="font-normal text-gray-400">— 배정 시각 기준, 최근 50회</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2 font-medium whitespace-nowrap">일시</th>
                  <th className="px-4 py-2 font-medium text-right">건수</th>
                  <th className="px-4 py-2 font-medium">담당자별 배분</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">배분 이력이 없습니다.</td></tr>
                )}
                {batches.map(b => (
                  <tr key={b.assignedAt} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 tabular-nums">{fmtDateTime(b.assignedAt)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{b.total}건</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {b.perAssignee.map(p => `${p.name} ${p.count}건`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-gray-400">
          이력은 거래처에 남은 마지막 배정 기록으로 계산됩니다. 이후 다른 담당자에게 재배정된 건은
          새 배정 회차로 옮겨져 집계되며, 삭제된 거래처는 이력에서 빠집니다.
        </p>
        </>
        )}
      </main>
    </>
  )
}
