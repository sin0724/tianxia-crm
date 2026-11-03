import { TEAM_BADGE_COLOR, type CompanyTeam } from '@/lib/constants'

// 거래처 소속 팀(DB 출처) 뱃지 — 담당자와 무관하게 "어느 팀 DB인가"를 보여준다.
// 팀 미지정(도입 전 데이터)은 표시하지 않는다.
export function TeamBadge({ team }: { team: string | null | undefined }) {
  if (!team) return null
  const color = TEAM_BADGE_COLOR[team as CompanyTeam] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      title={team === '0팀' ? '0팀(회사 DB) 건 — 매출은 0팀으로 집계' : `${team} 건`}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none whitespace-nowrap ${color}`}
    >
      {team}
    </span>
  )
}
