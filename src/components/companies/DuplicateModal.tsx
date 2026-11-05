import Link from 'next/link'
import { TeamBadge } from './TeamBadge'
import { COMPANY_DB_TEAM, memberLabel } from '@/lib/constants'
import type { DuplicateCandidate } from '@/app/(dashboard)/companies/duplicate-actions'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

interface DuplicateModalProps {
  candidates: DuplicateCandidate[]
  /** 새로 등록할 때 들어갈 소속 팀 */
  newTeam?: string | null
  onConfirm: () => void
  /** 기존 0팀 건을 내 팀으로 가져오기 */
  onClaim: (id: string) => void
  onCancel: () => void
  isPending?: boolean
}

export function DuplicateModal({ candidates, newTeam, onConfirm, onClaim, onCancel, isPending }: DuplicateModalProps) {
  const hasCompanyDb = candidates.some(c => c.team === COMPANY_DB_TEAM)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">

        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">⚠️ 중복 고객 후보가 있습니다</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {hasCompanyDb
              ? '이미 0팀(회사 DB)으로 들어온 건이 있습니다. 같은 고객인지 확인해주세요.'
              : '아래 고객과 유사한 정보가 감지되었습니다. 그래도 등록하시겠습니까?'}
          </p>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {candidates.map(c => (
            <div key={c.id} className="px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-gray-900">{c.company_name}</span>
                    <TeamBadge team={c.team} />
                    {c.matchReasons.map(r => (
                      <span
                        key={r}
                        className="inline-flex px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                    <span>담당자: <span className="text-gray-700">{c.profiles ? memberLabel(c.profiles.name, c.profiles.team) : '—'}</span></span>
                    <span>상태: <span className="text-gray-700">{c.status}</span></span>
                    {c.canView && <span>연락처: <span className="text-gray-700">{c.phone ?? '—'}</span></span>}
                    <span>DB 경로: <span className="text-gray-700">{c.source ?? '—'}</span></span>
                    {c.canView && <span>마지막 연락: <span className="text-gray-700">{fmtDate(c.last_contacted_at)}</span></span>}
                  </div>
                  {c.latest_note && (
                    <p className="mt-1.5 text-xs text-gray-400 truncate">
                      메모: {c.latest_note}
                    </p>
                  )}
                </div>
                <div className="shrink-0 self-start flex flex-col items-stretch gap-1.5">
                  {c.claimTeam && (
                    <button
                      type="button"
                      onClick={() => onClaim(c.id)}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs font-medium bg-[#3182f6] text-white rounded-xl hover:bg-[#1b64da] disabled:opacity-50 whitespace-nowrap transition-colors"
                    >
                      내 팀({c.claimTeam})으로 가져오기
                    </button>
                  )}
                  {c.canView && (
                    <Link
                      href={`/companies/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs text-center border border-gray-200 rounded-xl hover:bg-gray-50 whitespace-nowrap transition-colors"
                    >
                      상세 보기 →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 버튼 */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 bg-[#3182f6] text-white text-sm font-medium rounded-xl hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
          >
            {isPending ? '저장 중...' : newTeam ? `그래도 새로 등록 (${newTeam})` : '그래도 등록하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
