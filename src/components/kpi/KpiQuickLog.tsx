'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logKpiEntry, deleteKpiEntry } from '@/app/(dashboard)/tasks/kpi-actions'
import { KPI_TARGETS } from '@/lib/constants'
import type { KpiEntry, KpiRow } from '@/lib/kpi'

interface KpiQuickLogProps {
  myKpi: KpiRow | null
  todayEntries: KpiEntry[]
}

export function KpiQuickLog({ myKpi, todayEntries }: KpiQuickLogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [showTopicFor, setShowTopicFor] = useState<string | null>(null)

  function log(entryType: string, withTopic: boolean) {
    if (withTopic && showTopicFor !== entryType) {
      // 스레드 업로드는 주제를 함께 기록하도록 입력창 먼저 노출
      setShowTopicFor(entryType)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await logKpiEntry(entryType, withTopic ? topic : null)
      if (result?.error) {
        setError(result.error)
        return
      }
      setTopic('')
      setShowTopicFor(null)
      router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deleteKpiEntry(id)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">오늘의 KPI</h3>
        <div className="flex gap-2">
          <button
            onClick={() => log('KOL 제안', false)}
            disabled={isPending}
            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-md hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            + KOL 제안
          </button>
          <button
            onClick={() => log('스레드 업로드', true)}
            disabled={isPending}
            className="px-3 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            + 스레드 업로드
          </button>
        </div>
      </div>

      {showTopicFor && (
        <form
          onSubmit={e => { e.preventDefault(); log(showTopicFor, true) }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="주제를 입력하세요 (선택)"
            autoFocus
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" disabled={isPending}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
            기록
          </button>
          <button type="button" onClick={() => setShowTopicFor(null)}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">
            취소
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {myKpi && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiProgress
            label="KOL 제안 (이번 주)"
            value={myKpi.kolThisWeek}
            target={KPI_TARGETS.kolPerWeek}
          />
          <KpiProgress
            label="스레드 업로드 (이번 주)"
            value={myKpi.threadsThisWeek}
            target={KPI_TARGETS.threadsPerWeek}
          />
          <KpiProgress
            label="미팅 (이번 주)"
            value={myKpi.meetingsThisWeek}
            target={KPI_TARGETS.meetingsPerWeek}
          />
        </div>
      )}

      {todayEntries.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          {todayEntries.map(e => (
            <div key={e.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 truncate">
                {e.entry_type}
                {e.topic && <span className="text-gray-400"> — {e.topic}</span>}
              </span>
              <button
                onClick={() => remove(e.id)}
                disabled={isPending}
                className="shrink-0 ml-2 text-gray-300 hover:text-red-500 transition-colors"
                title="기록 취소"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KpiProgress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  const done = value >= target
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={`font-semibold ${done ? 'text-green-600' : 'text-gray-700'}`}>
          {value} / {target}{done && ' ✓'}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
