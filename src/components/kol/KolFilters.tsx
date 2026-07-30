'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { KolCopyButton } from '@/components/kol/KolCopyButton'
import { kstDateString, kstEndOfWeek } from '@/lib/datetime'
import { CURRENCIES, CURRENCY_LABEL, DELIVERABLE_PRESETS, FX_NOTE, GONGGU_CATEGORY } from '@/lib/constants'

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
  const [feeMin, setFeeMin] = useState(sp.get('fee_min') ?? '')
  const [feeMax, setFeeMax] = useState(sp.get('fee_max') ?? '')
  const [feeCur, setFeeCur] = useState(sp.get('fee_cur') ?? 'TWD')
  const [visitFrom, setVisitFrom] = useState(sp.get('visit_from') ?? '')
  const [visitTo,   setVisitTo]   = useState(sp.get('visit_to') ?? '')

  const category    = sp.get('category') ?? ''
  const gonggu      = sp.get('gonggu_category') ?? ''
  const deliverable = sp.get('deliverable') ?? ''
  const needsReview = sp.get('needs_review') ?? ''
  const sort        = sp.get('sort') ?? ''

  function push(overrides: Record<string, string> = {}) {
    const cur = {
      q, followers_min: min, followers_max: max,
      fee_min: feeMin, fee_max: feeMax, fee_cur: feeMin || feeMax ? feeCur : '',
      visit_from: visitFrom, visit_to: visitTo,
      category, gonggu_category: gonggu, deliverable, needs_review: needsReview, sort,
    }
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
    setQ(''); setMin(''); setMax(''); setFeeMin(''); setFeeMax(''); setFeeCur('TWD')
    setVisitFrom(''); setVisitTo('')
    router.push('/kol')
  }

  const hasFilter = [
    q, min, max, feeMin, feeMax, visitFrom, visitTo,
    category, gonggu, deliverable, needsReview, sort,
  ].some(Boolean)

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

        {/* 고정비 범위 — 통화가 섞여 있어 기준 통화로 환산해 비교한다 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">고정비</span>
          <form onSubmit={onSearch} className="flex items-center gap-1.5">
            <input
              type="text" inputMode="numeric" value={feeMin} aria-label="고정비 최소"
              onChange={e => setFeeMin(e.target.value)}
              placeholder="최소"
              className="w-20 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">~</span>
            <input
              type="text" inputMode="numeric" value={feeMax} aria-label="고정비 최대"
              onChange={e => setFeeMax(e.target.value)}
              placeholder="최대"
              className="w-20 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={feeCur} aria-label="고정비 범위 통화"
              onChange={e => setFeeCur(e.target.value)}
              className="px-1.5 py-1 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
            </select>
            <button type="submit" className="px-2.5 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors">
              적용
            </button>
          </form>
          <span className="text-[11px] text-gray-400">통화가 달라도 {FX_NOTE}으로 환산해 비교합니다</span>
        </div>

        {/* 공구 카테고리 — 이 KOL로 돌릴 수 있는 공구 품목 (콘텐츠 장르와 별개) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">공구 카테고리</span>
          {GONGGU_CATEGORY.map(c => (
            <Pill
              key={c} label={c} active={gonggu === c}
              onClick={() => push({ gonggu_category: gonggu === c ? '' : c })}
            />
          ))}
        </div>

        {/* 제공 항목 — 부분 검색 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">제공 항목</span>
          {DELIVERABLE_PRESETS.map(p => (
            <Pill
              key={p} label={p} active={deliverable === p}
              onClick={() => push({ deliverable: deliverable === p ? '' : p })}
            />
          ))}
          {deliverable && !DELIVERABLE_PRESETS.includes(deliverable as typeof DELIVERABLE_PRESETS[number]) && (
            <Pill label={`${deliverable} ✕`} active onClick={() => push({ deliverable: '' })} />
          )}
          <span className="text-[11px] text-gray-400">검색창에 &quot;릴스&quot;를 입력해도 찾을 수 있습니다</span>
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
              placeholder="이름, IG 핸들·링크, 제공 항목, 협업 브랜드, 히스토리 검색..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
              검색
            </button>
          </form>

          {/* 단가 원문 파싱이 애매해 사람이 정리해야 하는 KOL만 모아 보기 */}
          <Pill
            label="⚠ 원문 확인 필요"
            active={needsReview === '1'}
            onClick={() => push({ needs_review: needsReview === '1' ? '' : '1' })}
          />

          <select
            aria-label="정렬" value={sort}
            onChange={e => push({ sort: e.target.value })}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">최신화순</option>
            <option value="followers">팔로워 많은순</option>
            <option value="fee">고정비 높은순</option>
            <option value="fee_asc">고정비 낮은순</option>
            <option value="gonggu">누적 공구매출 많은순</option>
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

// 알약 모양 토글 버튼 (공구 카테고리 · 제공 항목 · 원문 확인 필요)
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
