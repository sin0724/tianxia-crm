import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { KolAdditionNotice } from '@/components/kol/KolAdditionNotice'
import { getProfile } from '@/lib/auth'
import { countKolsAddedToday } from '@/lib/kols'
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

  // 오늘 새로 추가된 KOL 리스트가 있으면 전 직원에게 팝업 공지로 알린다.
  const kolAddedToday = await countKolsAddedToday()

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} />
      {/* pb-16: 모바일 하단 탭 바에 콘텐츠가 가려지지 않도록 */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </div>
      <KolAdditionNotice count={kolAddedToday} todayKey={kstDateString()} />
    </div>
  )
}
