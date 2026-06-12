import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ProfileNameForm } from '@/components/settings/ProfileNameForm'
import { TeamManagement, type Member } from '@/components/settings/TeamManagement'

const ROLE_LABEL = { admin: '관리자', manager: '매니저', sales: '영업' }

export default async function SettingsPage() {
  const profile = await requireAuth()

  let members: Member[] = []
  if (profile.role === 'admin') {
    const supabase = await createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, team, is_active')
      .order('is_active', { ascending: true })
      .order('name')
    members = (data as Member[]) ?? []
  }

  return (
    <>
      <Header title="설정" />
      <main className="flex-1 p-4 sm:p-6">
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

          {profile.role === 'admin' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">팀 관리</h2>
              <p className="text-sm text-gray-400 mb-4">
                신규 가입자 승인, 권한 변경, 계정 비활성화를 할 수 있습니다.
              </p>
              <TeamManagement members={members} myId={profile.id} />
            </div>
          )}
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
