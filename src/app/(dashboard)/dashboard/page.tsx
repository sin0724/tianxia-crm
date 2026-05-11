import { Header } from '@/components/layout/Header'
import { BarChart } from '@/components/dashboard/BarChart'
import { requireAuth } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard'
import type { DashboardStats, ChartRow } from '@/lib/dashboard'

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
    blue:   'text-blue-600',
    green:  'text-green-600',
    orange: 'text-orange-500',
    red:    'text-red-500',
  }[accent ?? 'blue']

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accentCls}`}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-8 mb-3">
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

function toContractAmountItems(rows: ChartRow[]) {
  return rows
    .filter(r => r.contractAmount > 0)
    .map(r => ({
      label:   r.label,
      value:   r.contractAmount,
      display: fmtAmount(r.contractAmount),
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Page ──────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await requireAuth()
  const { stats, byAssignee, bySource, byCategory, byStatus } =
    await getDashboardData(profile)

  const scopeLabel = ROLE_LABEL[profile.role]

  return (
    <>
      <Header title={`대시보드 — ${scopeLabel} 현황`} />
      <main className="flex-1 p-6 max-w-5xl">

        {/* ── KPI ─────────────────────────────────────── */}
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
          <div className="sm:col-span-2">
            <BarChart
              title="담당자별 계약 완료 금액"
              items={toContractAmountItems(byAssignee)}
              emptyMessage="계약 완료 금액 없음"
            />
          </div>
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
