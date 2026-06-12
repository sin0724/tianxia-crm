import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { TaskSection } from '@/components/tasks/TaskSection'
import { KpiQuickLog } from '@/components/kpi/KpiQuickLog'
import {
  getTodayActions, getOverdueActions, getTodayMeetings,
  getLongNoContact, getProposalPending,
} from '@/lib/tasks'
import { getKpiData, getMyTodayKpiEntries } from '@/lib/kpi'
import { requireAuth, isAdminOrManager } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function TasksPage({ searchParams }: PageProps) {
  const profile = await requireAuth()
  const sp = await searchParams

  // admin/manager는 "내 담당만" 토글 가능, sales는 RLS로 본인 것만 보임
  const mineOnly = sp.mine === '1'
  const filters = mineOnly ? { assigned_to: profile.id } : {}

  const [todayActions, overdueActions, todayMeetings, longNoContact, proposalPending, kpiRows, todayEntries] =
    await Promise.all([
      getTodayActions(filters),
      getOverdueActions(filters),
      getTodayMeetings(filters),
      getLongNoContact(filters),
      getProposalPending(filters),
      getKpiData(profile),
      getMyTodayKpiEntries(profile.id),
    ])

  const myKpi = kpiRows.find(r => r.userId === profile.id) ?? null

  return (
    <>
      <Header title="오늘 할 일" />
      <main className="flex-1 p-4 sm:p-6 max-w-3xl space-y-4">
        <KpiQuickLog myKpi={myKpi} todayEntries={todayEntries} />

        {isAdminOrManager(profile.role) && (
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
          title="장기 미연락 (7일 이상)"
          companies={longNoContact}
          dateLabel="마지막 연락"
          dateKey="last_contacted_at"
          emptyMessage="장기 미연락 거래처가 없습니다."
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
