import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { KolAdditionNotice } from '@/components/kol/KolAdditionNotice'
import { AssignmentNotice } from '@/components/companies/AssignmentNotice'
import { getProfile } from '@/lib/auth'
import { countKolsAddedToday } from '@/lib/kols'
import { countCompaniesAssignedToMeToday } from '@/lib/companies'
import { kstDateString } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!profile.is_active) redirect('/pending')

  // 오늘 새로 추가된 KOL 리스트 / 나에게 배분된 거래처를 팝업 공지로 알린다.
  const [kolAddedToday, assignedToMeToday] = await Promise.all([
    countKolsAddedToday(),
    countCompaniesAssignedToMeToday(profile.id),
  ])
  const todayKey = kstDateString()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} />
      {/* pb-16: 모바일 하단 탭 바에 콘텐츠가 가려지지 않도록 */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </div>
      <AssignmentNotice
        count={assignedToMeToday}
        todayKey={todayKey}
        href={`/companies?assigned_to=${profile.id}`}
      />
      <KolAdditionNotice count={kolAddedToday} todayKey={todayKey} />
    </div>
  )
}
