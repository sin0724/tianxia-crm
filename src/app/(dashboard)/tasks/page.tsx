import { Header } from '@/components/layout/Header'
import { TaskSection } from '@/components/tasks/TaskSection'
import { getTodayActions, getTodayMeetings, getLongNoContact, getProposalPending } from '@/lib/tasks'
import { requireAuth } from '@/lib/auth'

export default async function TasksPage() {
  await requireAuth()

  const [todayActions, todayMeetings, longNoContact, proposalPending] = await Promise.all([
    getTodayActions(),
    getTodayMeetings(),
    getLongNoContact(),
    getProposalPending(),
  ])

  return (
    <>
      <Header title="오늘 할 일" />
      <main className="flex-1 p-6 max-w-3xl space-y-4">
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
