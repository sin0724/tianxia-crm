'use client'

import { useState, useTransition, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { deleteKol } from '@/app/(dashboard)/kol/actions'
import { KolFormModal } from '@/components/kol/KolFormModal'
import { KOL_CATEGORY_COLOR, fmtFollowers } from '@/lib/constants'
import { fmtDateKST, fmtFullDateKST } from '@/lib/datetime'
import type { Kol } from '@/lib/kols'

const STALE_DAYS = 21 // 3주 이상 미갱신이면 리스트에서 표시

interface KolTableProps {
  kols: Kol[]
  isAdmin: boolean
  /** 서버 렌더 시각(ms) — 렌더 중 Date.now() 호출을 피하기 위해 서버에서 내려준다 */
  now: number
}

export function KolTable({ kols, isAdmin, now }: KolTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Kol | null>(null)

  function onDelete(kol: Kol) {
    if (!confirm(`'${kol.name}' KOL을 삭제할까요? 히스토리도 함께 삭제됩니다.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteKol(kol.id)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  if (kols.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">
        조건에 맞는 KOL이 없습니다.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400">
              <th className="px-4 py-2.5 font-medium">이름</th>
              <th className="px-3 py-2.5 font-medium">카테고리</th>
              <th className="px-3 py-2.5 font-medium">팔로워</th>
              <th className="px-3 py-2.5 font-medium">진행 단가</th>
              <th className="px-3 py-2.5 font-medium">방문 예정</th>
              <th className="px-3 py-2.5 font-medium">히스토리</th>
              <th className="px-3 py-2.5 font-medium">최신화</th>
              {isAdmin && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {kols.map(kol => {
              const expanded = expandedId === kol.id
              return (
                <Fragment key={kol.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : kol.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${expanded ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 whitespace-nowrap">{kol.name}</div>
                      {kol.instagram_handle && (
                        <a
                          href={`https://instagram.com/${kol.instagram_handle}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-pink-600 hover:underline"
                        >
                          @{kol.instagram_handle}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {kol.categories.map(c => (
                          <span key={c} className={`px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${KOL_CATEGORY_COLOR[c] ?? 'bg-gray-100 text-gray-600'}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                      {fmtFollowers(kol.followers)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate" title={kol.rate ?? undefined}>
                      {kol.rate ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {kol.visit_note
                        ? <span className="text-blue-700 font-medium">{kol.visit_note}</span>
                        : kol.visit_date
                          ? <span className="text-blue-700 font-medium">{fmtDateKST(kol.visit_date)}</span>
                          : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-[240px] truncate" title={kol.history ?? undefined}>
                      {kol.history ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <UpdatedAt value={kol.updated_at} now={now} />
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2.5 whitespace-nowrap text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setEditing(kol) }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(kol) }}
                          disabled={isPending}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>

                  {expanded && (
                    <tr className="border-b border-gray-100 bg-blue-50/30">
                      <td colSpan={isAdmin ? 8 : 7} className="px-4 py-3">
                        <div className="space-y-2 text-sm">
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                            {kol.followers !== null && <span>팔로워 {kol.followers.toLocaleString('ko-KR')}명</span>}
                            {kol.visit_date && <span>방문 대표 날짜 {fmtFullDateKST(kol.visit_date)}</span>}
                            <span>등록 {fmtFullDateKST(kol.created_at)}</span>
                            <span>최신화 {fmtFullDateKST(kol.updated_at)}</span>
                          </div>
                          {kol.rate && (
                            <p className="text-gray-700"><span className="text-xs text-gray-400 mr-2">진행 단가</span>{kol.rate}</p>
                          )}
                          <div>
                            <p className="text-xs text-gray-400 mb-1">히스토리 (진행 이력 · 협업 브랜드)</p>
                            <p className="whitespace-pre-wrap text-gray-700">
                              {kol.history ?? '기록된 히스토리가 없습니다.'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && <KolFormModal kol={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// 최신화 날짜 + 3주 이상 미갱신 경고
function UpdatedAt({ value, now }: { value: string; now: number }) {
  const days = Math.floor((now - new Date(value).getTime()) / (24 * 60 * 60 * 1000))
  const stale = days >= STALE_DAYS
  return (
    <div>
      <span className="text-gray-500">{fmtDateKST(value)}</span>
      {stale && (
        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700">
          {days}일 미갱신
        </span>
      )}
    </div>
  )
}
