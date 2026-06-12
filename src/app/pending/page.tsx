import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { LogoutButton } from './LogoutButton'

export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.is_active) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-3xl mb-3">⏳</p>
        <h1 className="text-lg font-semibold text-gray-900">승인 대기 중</h1>
        <p className="mt-2 text-sm text-gray-500">
          계정이 생성되었지만 아직 관리자 승인이 필요합니다.
          <br />
          관리자에게 승인을 요청해주세요.
        </p>
        <p className="mt-3 text-xs text-gray-400">{profile.email}</p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
