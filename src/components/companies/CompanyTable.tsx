'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { StatusBadge } from './StatusBadge'
import { COMPANY_STATUS } from '@/lib/constants'
import type { Company, ProfileOption } from '@/lib/companies'
import { deleteCompany, deleteCompanies, assignCompanies, bulkUpdateCompanies } from '@/app/(dashboard)/companies/actions'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

function fmtMonth(s: string | null) {
  if (!s) return '—'
  return s.slice(0, 7).replace('-', '.')
}

function isOverdue(s: string | null) {
  // 오늘 자정 이전이면 기한 초과 (당일은 초과 아님)
  return !!s && new Date(s).getTime() < new Date().setHours(0, 0, 0, 0)
}

interface CompanyTableProps {
  companies: Company[]
  canDelete?: boolean
  /** admin/manager: 선택한 거래처를 담당자에게 일괄 배분 가능 */
  canAssign?: boolean
  profiles?: ProfileOption[]
  /** 일괄 수정용 구분/DB경로 자동완성 옵션 */
  categories?: string[]
  sources?: string[]
}

export function CompanyTable({
  companies, canDelete = false, canAssign = false,
  profiles = [], categories = [], sources = [],
}: CompanyTableProps) {
  const [confirmId, setConfirmId]       = useState<string | null>(null)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm]   = useState(false)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [assignee, setAssignee]         = useState('')
  const [assignedMsg, setAssignedMsg]   = useState<string | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkStatus, setBulkStatus]     = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkSource, setBulkSource]     = useState('')
  const [bulkInflow, setBulkInflow]     = useState('')
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
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteCompanies(ids)
      if (result?.error) setDeleteError(result.error)
      setSelectedIds(new Set())
    })
  }

  function handleDelete(id: string) {
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteCompany(id)
      if (result?.error) {
        setDeleteError(result.error)
        setConfirmId(null)
      }
    })
  }

  function handleAssign(target: string | 'auto') {
    const ids = Array.from(selectedIds)
    setDeleteError(null)
    setAssignedMsg(null)
    startTransition(async () => {
      const result = await assignCompanies(ids, target)
      if (result?.error) {
        setDeleteError(result.error)
        return
      }
      setSelectedIds(new Set())
      setAssignee('')
      setAssignedMsg(`${ids.length}건 배분 완료 — 담당자에게 알림을 보냈습니다.`)
    })
  }

  function handleBulkEdit() {
    const ids = Array.from(selectedIds)
    setDeleteError(null)
    setAssignedMsg(null)
    startTransition(async () => {
      const result = await bulkUpdateCompanies(ids, {
        status:       bulkStatus || undefined,
        category:     bulkCategory || undefined,
        source:       bulkSource || undefined,
        inflow_month: bulkInflow || undefined,
      })
      if (result?.error) {
        setDeleteError(result.error)
        return
      }
      setSelectedIds(new Set())
      setShowBulkEdit(false)
      setBulkStatus(''); setBulkCategory(''); setBulkSource(''); setBulkInflow('')
      setAssignedMsg(`${ids.length}건 일괄 수정 완료`)
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
      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{deleteError}</p>
      )}
      {assignedMsg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">✓ {assignedMsg}</p>
      )}

      {/* 선택 액션 바 */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
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
                onClick={() => setShowBulkEdit(v => !v)}
                disabled={isDeleting}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-white disabled:opacity-50 transition-colors"
              >
                ✏️ 일괄 수정
              </button>

              {canAssign && (
                <span className="inline-flex items-center gap-1.5">
                  <select
                    value={assignee}
                    onChange={e => setAssignee(e.target.value)}
                    disabled={isDeleting}
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="배분할 담당자"
                  >
                    <option value="">담당자 선택</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    onClick={() => handleAssign(assignee)}
                    disabled={isDeleting || !assignee}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    배분
                  </button>
                  <button
                    onClick={() => handleAssign('auto')}
                    disabled={isDeleting}
                    title="활성 영업사원에게 돌아가며 균등하게 배분합니다"
                    className="px-3 py-1.5 border border-blue-300 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    ⚖️ 균등 배분
                  </button>
                </span>
              )}

              {canDelete && (
                <button
                  onClick={() => { setBulkConfirm(true) }}
                  className="px-3 py-1.5 border border-red-300 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 transition-colors"
                >
                  선택 삭제 ({selectedIds.size}개)
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 일괄 수정 패널 — 비워둔 항목은 변경하지 않음 */}
      {someSelected && showBulkEdit && (
        <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
            <select
              value={bulkStatus}
              onChange={e => setBulkStatus(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">변경 안 함</option>
              {COMPANY_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">구분</label>
            <input
              type="text"
              list="bulk-category-options"
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              placeholder="변경 안 함"
              className="w-36 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="bulk-category-options">
              {categories.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">DB 경로</label>
            <input
              type="text"
              list="bulk-source-options"
              value={bulkSource}
              onChange={e => setBulkSource(e.target.value)}
              placeholder="변경 안 함"
              className="w-36 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="bulk-source-options">
              {sources.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">유입월 (DB 월)</label>
            <input
              type="month"
              value={bulkInflow}
              onChange={e => setBulkInflow(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleBulkEdit}
            disabled={isDeleting || (!bulkStatus && !bulkCategory.trim() && !bulkSource.trim() && !bulkInflow)}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? '수정 중...' : `선택한 ${selectedIds.size}건 수정`}
          </button>
          <button
            onClick={() => setShowBulkEdit(false)}
            disabled={isDeleting}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* 모바일: 카드 리스트 */}
      <div className="md:hidden space-y-2">
        <label className="flex items-center gap-2 px-1 py-1 text-sm text-gray-500">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          전체 선택
        </label>
        {companies.map(c => (
          <div
            key={c.id}
            className={`bg-white border rounded-xl p-4 ${selectedIds.has(c.id) ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggleRow(c.id)}
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/companies/${c.id}`} className="font-medium text-gray-900 truncate hover:text-blue-600">
                    {c.company_name}
                  </Link>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-xs text-gray-500 truncate">
                  {[
                    c.category, c.region, c.source,
                    c.inflow_date ? `${fmtMonth(c.inflow_date)} 유입` : null,
                    c.profiles?.name,
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="mt-1 inline-block text-xs text-blue-600 hover:underline">
                    📞 {c.phone}
                  </a>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>미팅 {fmtDate(c.meeting_at)}</span>
                  <span>연락 {fmtDate(c.last_contacted_at)}</span>
                  <span className={isOverdue(c.next_action_at) ? 'text-red-600 font-semibold' : ''}>
                    액션 {fmtDate(c.next_action_at)}
                  </span>
                </div>
                {c.latest_note && (
                  <p className="mt-1.5 text-xs text-gray-400 truncate">{c.latest_note}</p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {confirmId === c.id ? (
                    <>
                      <span className="text-xs text-gray-600">정말 삭제할까요?</span>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={isDeleting}
                        className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-md"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/companies/${c.id}`}
                        className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
                      >
                        수정
                      </Link>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmId(c.id)}
                          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-500 rounded-md hover:bg-gray-50"
                        >
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 데스크탑: 테이블 */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                {['상호명','구분','지역','DB 경로','유입월','담당자','상태','미팅 예정일','마지막 연락일','다음 액션일','최근 특이사항','작업'].map(h => (
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
                  <Td>{fmtMonth(c.inflow_date)}</Td>
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
                          onClick={() => handleDelete(c.id)}
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
                        {canDelete && (
                          <button
                            onClick={() => setConfirmId(c.id)}
                            className="text-xs px-2 py-0.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-50"
                          >
                            삭제
                          </button>
                        )}
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
