import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { TaskSection } from '@/components/tasks/TaskSection'
import { TeamOverview, type RepOverviewRow } from '@/components/tasks/TeamOverview'
import { KpiQuickLog } from '@/components/kpi/KpiQuickLog'
import { createClient } from '@/lib/supabase/server'
import {
  getTodayActions, getOverdueActions, getTodayMeetings,
  getLongNoContact, getProposalPending, getFreshInflow,
  type TaskCompany,
} from '@/lib/tasks'
import { getKpiData, getMyTodayKpiEntries, type KpiRow } from '@/lib/kpi'
import { requireAuth, isAdminOrManager } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

// 담당자별 업무량 집계 (관리자/매니저 팀 현황판용)
function buildOverviewRows(
  kpiRows: KpiRow[],
  lists: { today: TaskCompany[]; overdue: TaskCompany[]; meetings: TaskCompany[]; noContact: TaskCompany[] },
): RepOverviewRow[] {
  const rows: RepOverviewRow[] = kpiRows.map(k => ({
    userId: k.userId,
    name: k.name,
    todayActions: 0,
    overdue: 0,
    meetings: 0,
    longNoContact: 0,
    kolToday: k.kolToday,
    threadsThisWeek: k.threadsThisWeek,
    meetingsThisMonth: k.meetingsThisMonth,
  }))
  const byId = new Map(rows.map(r => [r.userId, r]))

  for (const c of lists.today)     if (c.assigned_to) { const r = byId.get(c.assigned_to); if (r) r.todayActions++ }
  for (const c of lists.overdue)   if (c.assigned_to) { const r = byId.get(c.assigned_to); if (r) r.overdue++ }
  for (const c of lists.meetings)  if (c.assigned_to) { const r = byId.get(c.assigned_to); if (r) r.meetings++ }
  for (const c of lists.noContact) if (c.assigned_to) { const r = byId.get(c.assigned_to); if (r) r.longNoContact++ }

  // 급한 사람(연체 많은 순) 먼저
  return rows.sort((a, b) => b.overdue - a.overdue || b.todayActions - a.todayActions)
}

export default async function TasksPage({ searchParams }: PageProps) {
  const profile = await requireAuth()
  const sp = await searchParams
  const isSupervisor = isAdminOrManager(profile.role)

  // admin/manager는 "내 담당만" 토글 가능, sales는 RLS로 본인 것만 보임
  const mineOnly = sp.mine === '1'
  const filters = mineOnly ? { assigned_to: profile.id } : {}

  const [todayActions, overdueActions, todayMeetings, longNoContact, proposalPending, freshInflow, kpiRows, todayEntries] =
    await Promise.all([
      getTodayActions(filters),
      getOverdueActions(filters),
      getTodayMeetings(filters),
      getLongNoContact(filters),
      getProposalPending(filters),
      getFreshInflow(filters),
      getKpiData(profile),
      profile.role === 'sales' ? getMyTodayKpiEntries(profile.id) : Promise.resolve([]),
    ])

  // 미배정(배분 대기) 건수 — 감독자에게만 표시
  let unassignedCount: number | undefined
  if (isSupervisor) {
    const supabase = await createClient()
    let q = supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .is('assigned_to', null)
    for (const s of ['계약 완료', '실패', '제외']) q = q.neq('status', s)
    const { count } = await q
    unassignedCount = count ?? 0
  }

  const myKpi = kpiRows.find(r => r.userId === profile.id) ?? null
  const overviewRows = isSupervisor && !mineOnly
    ? buildOverviewRows(kpiRows, {
        today: todayActions, overdue: overdueActions,
        meetings: todayMeetings, noContact: longNoContact,
      })
    : []

  // 관리자 전체 보기: 담당자별 장기 미연락은 팀 현황판 숫자로 충분하므로
  // 목록에는 회사 DB(미배정) 건만 노출
  const supervisorAllView = isSupervisor && !mineOnly
  const noContactList = supervisorAllView
    ? longNoContact.filter(c => !c.assigned_to)
    : longNoContact

  return (
    <>
      <Header title="오늘 할 일" />
      <main className="flex-1 p-4 sm:p-6 max-w-3xl space-y-4">
        {/* 영업사원: 개인 KPI 퀵 로그 / 관리자·매니저: 팀 현황판 */}
        {profile.role === 'sales' ? (
          <KpiQuickLog myKpi={myKpi} todayEntries={todayEntries} />
        ) : !mineOnly ? (
          <TeamOverview rows={overviewRows} unassignedCount={unassignedCount} />
        ) : null}

        {isSupervisor && (
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit">
            <Link
              href="/tasks"
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                !mineOnly ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              전체
            </Link>
            <Link
              href="/tasks?mine=1"
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mineOnly ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              내 담당만
            </Link>
          </div>
        )}

        <TaskSection
          title="기한 초과"
          companies={overdueActions}
          dateLabel="다음 액션일"
          dateKey="next_action_at"
          emptyMessage="기한이 지난 액션이 없습니다. 👍"
          accent="red"
        />
        <TaskSection
          title="오늘 액션 필요"
          companies={todayActions}
          dateLabel="다음 액션일"
          dateKey="next_action_at"
          emptyMessage="오늘 액션이 필요한 거래처가 없습니다."
        />
        <TaskSection
          title="오늘 미팅"
          companies={todayMeetings}
          dateLabel="미팅 시간"
          dateKey="meeting_at"
          emptyMessage="오늘 예정된 미팅이 없습니다."
        />
        <TaskSection
          title="이번 달 신규 유입 (미연락)"
          companies={freshInflow}
          dateLabel="유입일"
          dateKey="inflow_date"
          emptyMessage="이번 달 유입 중 미연락 건이 없습니다."
        />
        <TaskSection
          title={supervisorAllView ? '장기 미연락 — 회사 DB (미배정)' : '장기 미연락 (7일 이상)'}
          companies={noContactList}
          dateLabel="마지막 연락"
          dateKey="last_contacted_at"
          emptyMessage={supervisorAllView ? '미배정 장기 미연락 건이 없습니다.' : '장기 미연락 거래처가 없습니다.'}
        />
        <TaskSection
          title="제안서 발송 후 미답변 (3일 이상)"
          companies={proposalPending}
          dateLabel="마지막 연락"
          dateKey="last_contacted_at"
          emptyMessage="팔로우업이 필요한 거래처가 없습니다."
        />
      </main>
    </>
  )
}
