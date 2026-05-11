import Link from 'next/link'
import type { DuplicateCandidate } from '@/app/(dashboard)/companies/duplicate-actions'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

interface DuplicateModalProps {
  candidates: DuplicateCandidate[]
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DuplicateModal({ candidates, onConfirm, onCancel, isPending }: DuplicateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">

        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">⚠️ 중복 고객 후보가 있습니다</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            아래 고객과 유사한 정보가 감지되었습니다. 그래도 등록하시겠습니까?
          </p>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {candidates.map(c => (
            <div key={c.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-semibold text-gray-900">{c.company_name}</span>
                    {c.matchReasons.map(r => (
                      <span
                        key={r}
                        className="inline-flex px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                    <span>담당자: <span className="text-gray-700">{c.profiles?.name ?? '—'}</span></span>
                    <span>상태: <span className="text-gray-700">{c.status}</span></span>
                    <span>연락처: <span className="text-gray-700">{c.phone ?? '—'}</span></span>
                    <span>DB 경로: <span className="text-gray-700">{c.source ?? '—'}</span></span>
                    <span>마지막 연락: <span className="text-gray-700">{fmtDate(c.last_contacted_at)}</span></span>
                  </div>
                  {c.latest_note && (
                    <p className="mt-1.5 text-xs text-gray-400 truncate">
                      메모: {c.latest_note}
                    </p>
                  )}
                </div>
                <Link
                  href={`/companies/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap transition-colors"
                >
                  상세 보기 →
                </Link>
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
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? '저장 중...' : '그래도 등록하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
