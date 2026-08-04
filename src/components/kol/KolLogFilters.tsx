'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  KOL_LOG_ACTIONS, KOL_LOG_ACTION_LABEL,
  KOL_LOG_TARGETS, KOL_LOG_TARGET_LABEL,
} from '@/lib/constants'
import { kstDateString, kstStartOfWeek } from '@/lib/datetime'

interface Props {
  total: number
  actors: { id: string; name: string }[]
}

const DAY_MS = 24 * 60 * 60 * 1000

// 기간 빠른 필터 (모두 KST 달력 기준)
function periodPresets(): { label: string; from: string; to: string }[] {
  const today = kstDateString()
  return [
    { label: '오늘',       from: today, to: today },
    { label: '이번 주',    from: kstDateString(kstStartOfWeek()), to: today },
    { label: '최근 30일',  from: kstDateString(new Date(Date.now() - 29 * DAY_MS)), to: today },
  ]
}

export function KolLogFilters({ total, actors }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const [q,    setQ]    = useState(sp.get('q') ?? '')
  const [from, setFrom] = useState(sp.get('from') ?? '')
  const [to,   setTo]   = useState(sp.get('to') ?? '')

  const action = sp.get('action') ?? ''
  const target = sp.get('target') ?? ''
  const actor  = sp.get('actor') ?? ''

  function push(overrides: Record<string, string> = {}) {
    const merged = { q, from, to, action, target, actor, ...overrides }
    const params = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.push(`/kol/logs?${params}`)
  }

  function onPeriod(preset: { from: string; to: string }) {
    const active = from === preset.from && to === preset.to
    const next = active ? { from: '', to: '' } : preset
    setFrom(next.from)
    setTo(next.to)
    push({ from: next.from, to: next.to })
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    push()
  }

  function onClear() {
    setQ(''); setFrom(''); setTo('')
    router.push('/kol/logs')
  }

  const hasFilter = [q, from, to, action, target, actor].some(Boolean)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* 작업 종류 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 w-16">작업</span>
        <Pill label="전체" active={!action} onClick={() => push({ action: '' })} />
        {KOL_LOG_ACTIONS.map(a => (
          <Pill
            key={a} label={KOL_LOG_ACTION_LABEL[a]} active={action === a}
            onClick={() => push({ action: action === a ? '' : a })}
          />
        ))}
      </div>

      {/* 대상 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 w-16">대상</span>
        <Pill label="전체" active={!target} onClick={() => push({ target: '' })} />
        {KOL_LOG_TARGETS.map(t => (
          <Pill
            key={t} label={KOL_LOG_TARGET_LABEL[t]} active={target === t}
            onClick={() => push({ target: target === t ? '' : t })}
          />
        ))}
      </div>

      {/* 기간 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 w-16">기간</span>
        {periodPresets().map(p => (
          <Pill
            key={p.label} label={p.label}
            active={from === p.from && to === p.to}
            onClick={() => onPeriod(p)}
          />
        ))}
        <form onSubmit={onSearch} className="flex items-center gap-1.5">
          <input
            type="date" value={from} aria-label="시작일"
            onChange={e => setFrom(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date" value={to} aria-label="종료일"
            onChange={e => setTo(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="px-2.5 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors">
            적용
          </button>
        </form>
      </div>

      {/* 작업자 + 검색 */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          aria-label="작업자" value={actor}
          onChange={e => push({ actor: e.target.value })}
          className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">작업자 전체</option>
          {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <form onSubmit={onSearch} className="flex flex-1 min-w-[200px] gap-2">
          <input
            type="text" value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="KOL 이름, 변경 내용, 작업자 검색..."
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

        <span className="text-sm text-gray-400 whitespace-nowrap">{total.toLocaleString('ko-KR')}건</span>
      </div>
    </div>
  )
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}
