import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { ClaimTeamButton } from '@/components/companies/ClaimTeamButton'
import { TeamBadge } from '@/components/companies/TeamBadge'
import { requireAuth, isAdminOrManager } from '@/lib/auth'
import { COMPANY_DB_TEAM, claimTeamFor, memberLabel, memberTeam } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'

interface PageProps {
  params: Promise<{ id: string }>
}

// /리드 봇이 0팀 건에 합친 뒤 작성자에게 보내는 확인 페이지.
// 영업은 RLS로 미배정 건의 상세를 열 수 없어 서비스 롤로 조회하고, 상호·팀·담당자만 보여준다.
export default async function ClaimCompanyPage({ params }: PageProps) {
  const profile = await requireAuth()
  const { id } = await params

  const { data } = await createAdminClient()
    .from('companies')
    .select('id, company_name, team, assigned_to, profiles(name, team)')
    .eq('id', id)
    .maybeSingle()
  if (!data) notFound()

  const company = data as unknown as {
    id: string
    company_name: string
    team: string | null
    assigned_to: string | null
    profiles: { name: string; team: string | null } | null
  }
  const claimTeam = claimTeamFor(company, profile)
  const canView = isAdminOrManager(profile.role) || company.assigned_to === profile.id
  const assignee = company.profiles ? memberLabel(company.profiles.name, company.profiles.team) : null

  let notice: string | null = null
  if (!claimTeam) {
    if (company.team !== COMPANY_DB_TEAM) notice = '0팀 건이 아니라서 가져올 필요가 없습니다.'
    else if (!memberTeam(profile.team)) notice = '내 프로필에 팀이 없습니다. 관리자에게 팀 지정을 요청해주세요.'
    else notice = `${assignee ?? '다른 담당자'} 담당 건이라 직접 가져올 수 없습니다. 관리자에게 팀 변경을 요청해주세요.`
  }

  return (
    <>
      <Header title="소속 팀 확인" />
      <main className="flex-1 p-4 sm:p-6 max-w-xl">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-base font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
              {company.company_name}
              <TeamBadge team={company.team} />
            </p>
            <p className="mt-1 text-sm text-gray-500">담당자: {assignee ?? '미배정'}</p>
          </div>

          {claimTeam ? (
            <>
              <p className="text-sm text-gray-600">
                이미 0팀(회사 DB)으로 들어온 거래처입니다. 본인 퍼널에서 받은 건이 맞으면 {claimTeam}으로 가져가세요.
                계약 매출도 {claimTeam}으로 집계되고, 미배정 건은 담당자도 본인으로 지정됩니다.
              </p>
              <ClaimTeamButton companyId={company.id} team={claimTeam} />
            </>
          ) : (
            <p className="text-sm text-gray-600">{notice}</p>
          )}

          {canView && (
            <Link href={`/companies/${company.id}`} className="inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors">
              거래처 상세 보기 →
            </Link>
          )}
        </div>
      </main>
    </>
  )
}
