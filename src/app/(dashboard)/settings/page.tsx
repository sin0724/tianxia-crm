import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { ProfileNameForm } from '@/components/settings/ProfileNameForm'

const ROLE_LABEL = { admin: '관리자', manager: '매니저', sales: '영업' }

export default async function SettingsPage() {
  const profile = await requireAuth()

  return (
    <>
      <Header title="설정" />
      <main className="flex-1 p-6">
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">계정 정보</h2>
            <div className="space-y-3">
              <InfoRow label="이메일" value={profile.email} />
              <InfoRow label="권한"   value={ROLE_LABEL[profile.role]} />
              {profile.team && <InfoRow label="팀" value={profile.team} />}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">담당자 이름 설정</h2>
            <p className="text-sm text-gray-400 mb-4">이름은 거래처 담당자 표기 및 사이드바에 사용됩니다.</p>
            <ProfileNameForm currentName={profile.name} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">시스템</h2>
            <p className="text-sm text-gray-400">추가 설정 항목이 여기에 표시됩니다.</p>
          </div>
        </div>
      </main>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}
