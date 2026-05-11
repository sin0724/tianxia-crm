'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { COMPANY_STATUS, COMPANY_CATEGORY, COMPANY_SOURCE } from '@/lib/constants'
import type { ProfileOption } from '@/lib/companies'

interface CompanyFiltersProps {
  profiles: ProfileOption[]
  total: number
}

export function CompanyFilters({ profiles, total }: CompanyFiltersProps) {
  const router = useRouter()
  const sp = useSearchParams()

  const [status,      setStatus]      = useState(sp.get('status') ?? '')
  const [assignedTo,  setAssignedTo]  = useState(sp.get('assigned_to') ?? '')
  const [category,    setCategory]    = useState(sp.get('category') ?? '')
  const [source,      setSource]      = useState(sp.get('source') ?? '')
  const [nextAction,  setNextAction]  = useState(sp.get('next_action') ?? '')
  const [q,           setQ]           = useState(sp.get('q') ?? '')

  function push(overrides: Record<string, string> = {}) {
    const cur = { status, assigned_to: assignedTo, category, source, next_action: nextAction, q }
    const merged = { ...cur, ...overrides }
    const params = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.push(`/companies?${params}`)
  }

  function onSelect(key: string, value: string) {
    const setters: Record<string, (v: string) => void> = {
      status:      setStatus,
      assigned_to: setAssignedTo,
      category:    setCategory,
      source:      setSource,
      next_action: setNextAction,
    }
    setters[key]?.(value)
    push({ [key]: value })
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    push()
  }

  function onClear() {
    setStatus(''); setAssignedTo(''); setCategory('')
    setSource(''); setNextAction(''); setQ('')
    router.push('/companies')
  }

  const hasFilter = [status, assignedTo, category, source, nextAction, q].some(Boolean)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Sel label="상태" value={status} onChange={v => onSelect('status', v)}>
          <option value="">전체 상태</option>
          {COMPANY_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </Sel>

        <Sel label="담당자" value={assignedTo} onChange={v => onSelect('assigned_to', v)}>
          <option value="">전체 담당자</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Sel>

        <Sel label="구분" value={category} onChange={v => onSelect('category', v)}>
          <option value="">전체 구분</option>
          {COMPANY_CATEGORY.map(c => <option key={c} value={c}>{c}</option>)}
        </Sel>

        <Sel label="DB 경로" value={source} onChange={v => onSelect('source', v)}>
          <option value="">전체 경로</option>
          {COMPANY_SOURCE.map(s => <option key={s} value={s}>{s}</option>)}
        </Sel>

        <Sel label="다음 액션" value={nextAction} onChange={v => onSelect('next_action', v)}>
          <option value="">전체</option>
          <option value="overdue">기한 초과</option>
        </Sel>
      </div>

      <div className="flex gap-2 items-center">
        <form onSubmit={onSearch} className="flex flex-1 gap-2">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="상호명, 연락처, 메모 검색..."
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
            검색
          </button>
        </form>

        {hasFilter && (
          <button onClick={onClear} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md transition-colors">
            초기화
          </button>
        )}

        <span className="text-sm text-gray-400 whitespace-nowrap">{total}건</span>
      </div>
    </div>
  )
}

function Sel({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  )
}
