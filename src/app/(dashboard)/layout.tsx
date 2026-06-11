import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { getProfile } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} />
      {/* pb-16: 모바일 하단 탭 바에 콘텐츠가 가려지지 않도록 */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </div>
    </div>
  )
}
