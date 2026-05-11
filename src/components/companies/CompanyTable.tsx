'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { StatusBadge } from './StatusBadge'
import type { Company } from '@/lib/companies'
import { deleteCompany, deleteCompanies } from '@/app/(dashboard)/companies/actions'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

function isOverdue(s: string | null) {
  return !!s && new Date(s) < new Date()
}

export function CompanyTable({ companies }: { companies: Company[] }) {
  const [confirmId, setConfirmId]       = useState<string | null>(null)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm]   = useState(false)
  const [isDeleting, startTransition]   = useTransition()

  const allSelected  = companies.length > 0 && selectedIds.size === companies.length
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(companies.map(c => c.id)))
  }

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    setBulkConfirm(false)
    startTransition(async () => {
      await deleteCompanies(ids)
      setSelectedIds(new Set())
    })
  }

  if (companies.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <p className="text-sm text-gray-400">조건에 맞는 거래처가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* 선택 액션 바 */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size}개 선택됨</span>
          <div className="flex-1" />
          {bulkConfirm ? (
            <>
              <span className="text-sm text-gray-600">
                {selectedIds.size === companies.length ? '전체' : `선택한 ${selectedIds.size}개`}를 정말 삭제하시겠습니까?
              </span>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setBulkConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectedIds(new Set(companies.map(c => c.id)))}
                className="text-sm text-blue-600 hover:underline"
              >
                전체 {companies.length}개 선택
              </button>
              <button
                onClick={() => { setBulkConfirm(true) }}
                className="px-3 py-1.5 border border-red-300 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 transition-colors"
              >
                선택 삭제 ({selectedIds.size}개)
              </button>
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {['상호명','구분','지역','DB 경로','담당자','상태','미팅 예정일','마지막 연락일','다음 액션일','최근 특이사항','작업'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {companies.map(c => (
                <tr key={c.id} className={`transition-colors ${selectedIds.has(c.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <Link href={`/companies/${c.id}`} className="hover:text-blue-600 hover:underline">
                      {c.company_name}
                    </Link>
                  </td>
                  <Td>{c.category}</Td>
                  <Td>{c.region}</Td>
                  <Td>{c.source}</Td>
                  <Td>{c.profiles?.name}</Td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={c.status} />
                  </td>
                  <Td>{fmtDate(c.meeting_at)}</Td>
                  <Td>{fmtDate(c.last_contacted_at)}</Td>
                  <td className={`px-4 py-3 whitespace-nowrap text-sm ${isOverdue(c.next_action_at) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {fmtDate(c.next_action_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs">
                    <p className="truncate">{c.latest_note ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {confirmId === c.id ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-gray-600">정말요?</span>
                        <button
                          onClick={() => startTransition(() => { deleteCompany(c.id) })}
                          disabled={isDeleting}
                          className="text-xs px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs px-2 py-0.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-50"
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Link
                          href={`/companies/${c.id}`}
                          className="text-xs px-2 py-0.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-50"
                        >
                          수정
                        </Link>
                        <button
                          onClick={() => setConfirmId(c.id)}
                          className="text-xs px-2 py-0.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-50"
                        >
                          삭제
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{children ?? '—'}</td>
}
