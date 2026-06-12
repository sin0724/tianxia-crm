'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickLogActivity } from '@/app/(dashboard)/companies/activity-actions'
import { ACTIVITY_TYPE, ACTIVITY_RESULT } from '@/lib/constants'
import type { TaskCompany } from '@/lib/tasks'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

const NEXT_DAY_OPTIONS = [
  { label: '내일',   days: 1 },
  { label: '+3일',   days: 3 },
  { label: '+1주',   days: 7 },
  { label: '+2주',   days: 14 },
  { label: '없음',   days: 0 },
] as const

interface TaskSectionProps {
  title: string
  companies: TaskCompany[]
  dateLabel: string
  dateKey: keyof Pick<TaskCompany, 'next_action_at' | 'last_contacted_at' | 'meeting_at' | 'inflow_date'>
  emptyMessage: string
  accent?: 'red'
}

export function TaskSection({ title, companies, dateLabel, dateKey, emptyMessage, accent }: TaskSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set())

  // 직접 기록 미니 폼 (한 번에 하나만 펼침)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formType, setFormType] = useState('전화')
  const [formResult, setFormResult] = useState('')
  const [formDays, setFormDays] = useState(3)
  const [formMemo, setFormMemo] = useState('')

  function submitLog(companyId: string, type: string, result: string | null, days: number, memo?: string) {
    setError(null)
    startTransition(async () => {
      const res = await quickLogActivity(companyId, type, result, days, memo ?? null)
      if (res?.error) {
        setError(res.error)
        return
      }
      setLoggedIds(prev => new Set(prev).add(companyId))
      setExpandedId(null)
      router.refresh()
    })
  }

  function toggleExpand(companyId: string) {
    if (expandedId === companyId) {
      setExpandedId(null)
      return
    }
    setExpandedId(companyId)
    setFormType('전화')
    setFormResult('')
    setFormDays(3)
    setFormMemo('')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {companies.length > 0 && (
          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
            accent === 'red' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {companies.length}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-5 py-2">{error}</p>
      )}

      {companies.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {companies.map(c => (
            <div key={c.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/companies/${c.id}`} className="text-sm font-medium text-gray-900 truncate block hover:text-blue-600">
                    {c.company_name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[
                      c.category ?? '—',
                      c.profiles?.name ?? '—',
                      c.status,
                      c.inflow_date ? `${c.inflow_date.slice(0, 7).replace('-', '.')} 유입` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500">{dateLabel}</p>
                  <p className="text-xs font-medium text-gray-700 mt-0.5">
                    {fmtDate(c[dateKey] as string | null)}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="text-xs px-2.5 py-1 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                  >
                    📞 {c.phone}
                  </a>
                )}
                {loggedIds.has(c.id) ? (
                  <span className="text-xs text-green-600">✓ 기록됨</span>
                ) : (
                  <>
                    <button
                      onClick={() => submitLog(c.id, '전화', '부재', 1)}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      title="전화/부재로 기록하고 다음 액션일을 내일로 설정"
                    >
                      부재 (내일 재시도)
                    </button>
                    <button
                      onClick={() => submitLog(c.id, '전화', null, 3)}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      title="통화로 기록하고 다음 액션일을 3일 뒤로 설정"
                    >
                      통화함 (+3일)
                    </button>
                    <button
                      onClick={() => toggleExpand(c.id)}
                      disabled={isPending}
                      className={`text-xs px-2.5 py-1 border rounded-md disabled:opacity-50 transition-colors ${
                        expandedId === c.id
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      ✏️ 직접 기록 {expandedId === c.id ? '▴' : '▾'}
                    </button>
                  </>
                )}
              </div>

              {/* 직접 기록 미니 폼 */}
              {expandedId === c.id && !loggedIds.has(c.id) && (
                <div className="mt-2.5 border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-2.5">
                  <div className="flex flex-wrap gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">활동 유형</label>
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ACTIVITY_TYPE.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">결과</label>
                      <select
                        value={formResult}
                        onChange={e => setFormResult(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">선택 안 함</option>
                        {ACTIVITY_RESULT.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">다음 액션일</label>
                      <div className="flex gap-1">
                        {NEXT_DAY_OPTIONS.map(opt => (
                          <button
                            key={opt.days}
                            type="button"
                            onClick={() => setFormDays(opt.days)}
                            className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                              formDays === opt.days
                                ? 'border-blue-500 bg-blue-600 text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={formMemo}
                    onChange={e => setFormMemo(e.target.value)}
                    placeholder="메모 (선택) — 통화 내용, 특이사항 등"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => submitLog(c.id, formType, formResult || null, formDays, formMemo)}
                      disabled={isPending}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isPending ? '저장 중...' : '기록 저장'}
                    </button>
                    <button
                      onClick={() => setExpandedId(null)}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
