import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { BarChart } from '@/components/dashboard/BarChart'
import { AssignmentBanner } from '@/components/dashboard/AssignmentBanner'
import { requireAuth } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard'
import { getUnreadNotifications } from '@/lib/notifications'
import { STAGES, STAGE_COLOR } from '@/lib/constants'
import type { ChartRow } from '@/lib/dashboard'

// ── 헬퍼 ──────────────────────────────────────────────────────

function fmtAmount(n: number) {
  if (n === 0) return '0원'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString('ko-KR')}만원`
  return `${n.toLocaleString('ko-KR')}원`
}

const ROLE_LABEL = { admin: '전체', manager: '팀', sales: '개인' } as const

// ── 하위 컴포넌트 ──────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'blue' | 'green' | 'orange' | 'red'
}) {
  const accentCls = {
    blue:   'text-gray-900',
    green:  'text-[#3182f6]',
    orange: 'text-orange-500',
    red:    'text-[#f04452]',
  }[accent ?? 'blue']

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <p className="text-[13px] text-gray-500 mb-1.5">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${accentCls}`}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold tracking-tight text-gray-900 mt-10 mb-3 first:mt-0">
      {children}
    </h2>
  )
}

// ── 차트 헬퍼 ─────────────────────────────────────────────────

function toCountItems(rows: ChartRow[]) {
  return rows.map(r => ({ label: r.label, value: r.count }))
}

function toContractCountItems(rows: ChartRow[]) {
  return rows
    .filter(r => r.contractCount > 0)
    .map(r => ({ label: r.label, value: r.contractCount }))
    .sort((a, b) => b.value - a.value)
}

// ── Page ──────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await requireAuth()
  const [{ stats, byAssignee, bySource, byCategory, byStatus, cohorts }, notifications] =
    await Promise.all([
      getDashboardData(profile),
      getUnreadNotifications(profile.id),
    ])

  const scopeLabel = ROLE_LABEL[profile.role]

  return (
    <>
      <Header title={`대시보드 — ${scopeLabel} 현황`} />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl">

        <AssignmentBanner
          notifications={notifications}
          href={`/companies?assigned_to=${profile.id}&sort=assigned`}
        />

        {/* ── 영업 단계 파이프라인 ───────────────────────── */}
        <SectionTitle>영업 단계</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAGES.map(stage => (
            <div key={stage} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLOR[stage]}`}>
                {stage}
              </span>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {stats.stageCounts[stage].toLocaleString('ko-KR')}
              </p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatCard label="가망 전환율 (잠재 → 가망 이상)" value={`${stats.prospectRate}%`} accent="blue" />
          <StatCard label="계약 전환율 (전체 → 계약)"      value={`${stats.contractRate}%`} accent="green" />
        </div>

        {/* ── 핵심 지표 ─────────────────────────────────── */}
        <SectionTitle>핵심 지표</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="전체 고객 수"          value={stats.totalCompanies}    accent="blue" />
          <StatCard label="이번 달 신규 등록"      value={stats.newThisMonth}      accent="blue" />
          <StatCard label="오늘 연락 예정"         value={stats.todayActions}      accent="orange" />
          <StatCard label="이번 주 미팅 예정"      value={stats.thisWeekMeetings}  accent="blue" />
          <StatCard label="제안서 발송"            value={stats.proposalSent}      accent="blue" />
          <StatCard label="계약 검토"              value={stats.contractReview}    accent="orange" />
          <StatCard label="계약 완료"              value={stats.contractDone}      accent="green" />
          <StatCard
            label="계약 완료 금액"
            value={fmtAmount(stats.contractDoneAmount)}
            accent="green"
          />
          <StatCard
            label="장기 미연락 (7일+)"
            value={stats.longNoContact}
            accent="red"
          />
          {profile.role !== 'sales' && (
            <Link href="/companies?assigned_to=none" className="block">
              <StatCard
                label="미배정 (배분 대기) →"
                value={stats.unassigned}
                accent="orange"
              />
            </Link>
          )}
        </div>

        {/* ── 월별 유입 코호트 ──────────────────────────── */}
        <SectionTitle>월별 유입 코호트 — 유입 시점별 DB 성과</SectionTitle>
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-4 py-3 text-left whitespace-nowrap">유입월</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">유입 수</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">가망 도달</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">미팅 도달</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">계약</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">계약 전환율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cohorts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">데이터 없음</td></tr>
                ) : cohorts.map(r => (
                  <tr key={r.month} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {r.month === '미지정' ? (
                        <span className="text-gray-400">미지정</span>
                      ) : (
                        <Link
                          href={`/companies?inflow_month=${r.month}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {r.month.replace('-', '년 ')}월 DB
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-800">{r.total.toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3 text-center text-blue-700">{r.prospects}</td>
                    <td className="px-4 py-3 text-center text-purple-700">{r.meetings}</td>
                    <td className="px-4 py-3 text-center text-emerald-700 font-medium">{r.contracts}</td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {r.total > 0 ? `${Math.round((r.contracts / r.total) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 담당자별 ─────────────────────────────────── */}
        <SectionTitle>담당자별</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BarChart
            title="담당자별 고객 수"
            items={toCountItems(byAssignee)}
          />
          <BarChart
            title="담당자별 계약 완료 수"
            items={toContractCountItems(byAssignee)}
            emptyMessage="계약 완료 내역 없음"
          />
        </div>

        {/* ── DB 경로별 ─────────────────────────────────── */}
        <SectionTitle>DB 경로별</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BarChart
            title="DB 경로별 고객 수"
            items={toCountItems(bySource)}
          />
          <BarChart
            title="DB 경로별 계약 완료 수"
            items={toContractCountItems(bySource)}
            emptyMessage="계약 완료 내역 없음"
          />
        </div>

        {/* ── 구분 / 상태별 ─────────────────────────────── */}
        <SectionTitle>구분 / 상태별</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BarChart
            title="구분별 고객 수"
            items={toCountItems(byCategory)}
          />
          <BarChart
            title="상태별 고객 수"
            items={toCountItems(byStatus)}
          />
        </div>

      </main>
    </>
  )
}
