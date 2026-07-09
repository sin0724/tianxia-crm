'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { KolCopyButton } from '@/components/kol/KolCopyButton'
import { kstDateString, kstEndOfWeek } from '@/lib/datetime'

// 팔로워 빠른 필터 (만 단위)
const FOLLOWER_PRESETS: { label: string; min: string; max: string }[] = [
  { label: '~1만',    min: '',   max: '1' },
  { label: '1~5만',   min: '1',  max: '5' },
  { label: '5~10만',  min: '5',  max: '10' },
  { label: '10~50만', min: '10', max: '50' },
  { label: '50만~',   min: '50', max: '' },
]

// 방문 예정 빠른 필터 (오늘 이후 기준 — 지난 방문은 어차피 제외)
function visitPresets(): { label: string; from: string; to: string }[] {
  const today = kstDateString()
  const [y, m] = today.split('-').map(Number)
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  return [
    { label: '방문 있음', from: today, to: '' },
    { label: '이번 주',   from: today, to: kstDateString(kstEndOfWeek()) },
    { label: '이번 달',   from: today, to: monthEnd },
  ]
}

export function KolFilters({ total, categoryNames }: { total: number; categoryNames: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  const [q,   setQ]   = useState(sp.get('q') ?? '')
  const [min, setMin] = useState(sp.get('followers_min') ?? '')
  const [max, setMax] = useState(sp.get('followers_max') ?? '')
  const [visitFrom, setVisitFrom] = useState(sp.get('visit_from') ?? '')
  const [visitTo,   setVisitTo]   = useState(sp.get('visit_to') ?? '')

  const category = sp.get('category') ?? ''
  const sort     = sp.get('sort') ?? ''

  function push(overrides: Record<string, string> = {}) {
    const cur = { q, followers_min: min, followers_max: max, visit_from: visitFrom, visit_to: visitTo, category, sort }
    const merged = { ...cur, ...overrides }
    const params = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.push(`/kol?${params}`)
  }

  function onPreset(preset: { min: string; max: string }) {
    const active = min === preset.min && max === preset.max && (min || max)
    const next = active ? { min: '', max: '' } : preset
    setMin(next.min)
    setMax(next.max)
    push({ followers_min: next.min, followers_max: next.max })
  }

  function onVisitPreset(preset: { from: string; to: string }) {
    const active = visitFrom === preset.from && visitTo === preset.to
    const next = active ? { from: '', to: '' } : preset
    setVisitFrom(next.from)
    setVisitTo(next.to)
    // 방문 필터를 걸면 방문 가까운순 정렬이 자연스러움 (해제 시 정렬은 유지)
    push({ visit_from: next.from, visit_to: next.to, ...(next.from && !sort ? { sort: 'visit' } : {}) })
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    push()
  }

  function onClear() {
    setQ(''); setMin(''); setMax(''); setVisitFrom(''); setVisitTo('')
    router.push('/kol')
  }

  const hasFilter = [q, min, max, visitFrom, visitTo, category, sort].some(Boolean)

  return (
    <div className="space-y-3">
      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1.5">
        <CategoryTab label="전체" active={!category} onClick={() => push({ category: '' })} />
        {categoryNames.map(c => (
          <CategoryTab key={c} label={c} active={category === c} onClick={() => push({ category: category === c ? '' : c })} />
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        {/* 팔로워 범위 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">팔로워</span>
          {FOLLOWER_PRESETS.map(p => {
            const active = min === p.min && max === p.max
            return (
              <button
                key={p.label} onClick={() => onPreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            )
          })}
          <form onSubmit={onSearch} className="flex items-center gap-1.5">
            <input
              type="number" min="0" step="0.1" value={min}
              onChange={e => setMin(e.target.value)}
              placeholder="최소"
              className="w-18 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">만 ~</span>
            <input
              type="number" min="0" step="0.1" value={max}
              onChange={e => setMax(e.target.value)}
              placeholder="최대"
              className="w-18 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">만</span>
            <button type="submit" className="px-2.5 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors">
              적용
            </button>
          </form>
        </div>

        {/* 방문 예정 범위 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">방문 예정</span>
          {visitPresets().map(p => {
            const active = visitFrom === p.from && visitTo === p.to
            return (
              <button
                key={p.label} onClick={() => onVisitPreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            )
          })}
          <form onSubmit={onSearch} className="flex items-center gap-1.5">
            <input
              type="date" value={visitFrom} aria-label="방문 시작일"
              onChange={e => setVisitFrom(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">~</span>
            <input
              type="date" value={visitTo} aria-label="방문 종료일"
              onChange={e => setVisitTo(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="px-2.5 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors">
              적용
            </button>
          </form>
        </div>

        {/* 검색 + 정렬 */}
        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={onSearch} className="flex flex-1 min-w-[200px] gap-2">
            <input
              type="text" value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="이름, IG 핸들·링크, 협업 브랜드, 히스토리 검색..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
              검색
            </button>
          </form>

          <select
            aria-label="정렬" value={sort}
            onChange={e => push({ sort: e.target.value })}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">최신화순</option>
            <option value="followers">팔로워 많은순</option>
            <option value="visit">방문 예정 가까운순</option>
            <option value="name">이름순</option>
          </select>

          {hasFilter && (
            <button onClick={onClear} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-md transition-colors">
              초기화
            </button>
          )}

          <span className="text-sm text-gray-400 whitespace-nowrap">{total}명</span>
          <KolCopyButton total={total} />
        </div>
      </div>
    </div>
  )
}

function CategoryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}
