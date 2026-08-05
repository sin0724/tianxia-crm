'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  logKpiEntry, deleteKpiEntry, updateKpiEntryMetric,
} from '@/app/(dashboard)/tasks/kpi-actions'
import { fmtDateKST } from '@/lib/datetime'
import type { KpiEntry, KpiMetric, KpiRow } from '@/lib/kpi'

interface KpiQuickLogProps {
  metrics: KpiMetric[]
  myKpi: KpiRow | null
  /** 이번 달 내 기록 전체 — 자동 기록까지 그대로 보여주는 근거 목록 */
  monthEntries: KpiEntry[]
  monthLabel: string
}

// 항목 이름은 관리자가 바꿀 수 있으므로 색은 기록 방식으로만 구분한다
const BTN_CLS = [
  'bg-violet-600 hover:bg-violet-700',
  'bg-gray-800 hover:bg-gray-900',
  'bg-teal-600 hover:bg-teal-700',
  'bg-indigo-600 hover:bg-indigo-700',
]

export function KpiQuickLog({ metrics, myKpi, monthEntries, monthLabel }: KpiQuickLogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [showLog, setShowLog] = useState(false)

  const manualMetrics  = metrics.filter(m => m.kind === 'manual')
  const meetingMetrics = metrics.filter(m => m.kind === 'meeting')
  const labelOf = (key: string) => metrics.find(m => m.key === key)?.label

  function run(fn: () => Promise<{ error: string } | undefined>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result?.error) {
        setError(result.error)
        return
      }
      onDone?.()
      router.refresh()
    })
  }

  // 버튼 한 번이면 바로 기록된다. 주제는 옆 칸에 미리 적어두면 함께 남고, 비워도 그만.
  function log(metric: KpiMetric) {
    run(() => logKpiEntry(metric.key, topic), () => setTopic(''))
  }

  const autoCount = monthEntries.filter(e => e.source === 'auto').length

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">이번 달 KPI</h3>
          <p className="text-xs text-gray-400">{monthLabel} 누적 · 매월 1일 초기화</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {manualMetrics.map((m, i) => (
            <button
              key={m.key}
              onClick={() => log(m)}
              disabled={isPending}
              className={`px-3 py-1.5 text-white text-xs font-medium rounded-md disabled:opacity-50 transition-colors ${BTN_CLS[i % BTN_CLS.length]}`}
            >
              + {m.label}
            </button>
          ))}
        </div>
      </div>

      {manualMetrics.length > 0 && (
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="주제·대상을 먼저 적어두면 기록에 함께 남습니다 (선택)"
          className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

      {myKpi && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {metrics.map(m => (
            <KpiProgress
              key={m.key}
              label={m.label}
              auto={m.kind === 'meeting'}
              value={myKpi.counts[m.key] ?? 0}
              target={m.monthly_target}
            />
          ))}
        </div>
      )}

      {meetingMetrics.length > 0 && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2 leading-relaxed">
          🤝 <strong className="text-gray-500">미팅 KPI는 자동 기록됩니다.</strong> 거래처 상태를
          &lsquo;미팅진행&rsquo;으로 바꾸거나, 활동에 &lsquo;미팅&rsquo;을 남기거나, 미팅 예정일이 지나면
          담당자 실적으로 잡힙니다. 아래 기록에서 실제로 잡혔는지 확인하고 미팅 종류도 바꿀 수 있습니다.
        </p>
      )}

      <div className="border-t border-gray-100 pt-3">
        <button
          onClick={() => setShowLog(v => !v)}
          className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <span>
            이번 달 기록 {monthEntries.length}건
            {autoCount > 0 && <span className="text-gray-400"> (자동 {autoCount}건 포함)</span>}
          </span>
          <span className="text-gray-300">{showLog ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>

        {showLog && (
          <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
            {monthEntries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">아직 이번 달 기록이 없습니다.</p>
            ) : monthEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs py-1">
                <span className="text-gray-300 w-11 shrink-0">{fmtDateKST(e.entry_date)}</span>

                {e.source === 'auto' ? (
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">자동</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">직접</span>
                )}

                {/* 자동 기록된 미팅은 종류를 그 자리에서 바로잡을 수 있다 */}
                {e.source === 'auto' && meetingMetrics.length > 0 ? (
                  <select
                    value={e.metric_key}
                    disabled={isPending}
                    onChange={ev => run(() => updateKpiEntryMetric(e.id, ev.target.value))}
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white text-gray-700 max-w-40"
                  >
                    {meetingMetrics.some(m => m.key === e.metric_key) ? null : (
                      <option value={e.metric_key}>{labelOf(e.metric_key) ?? e.entry_type}</option>
                    )}
                    {meetingMetrics.map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-gray-700 truncate">{labelOf(e.metric_key) ?? e.entry_type}</span>
                )}

                {e.company_id && e.companies && (
                  <Link
                    href={`/companies/${e.company_id}`}
                    className="text-gray-400 hover:text-blue-600 hover:underline truncate"
                  >
                    {e.companies.company_name}
                  </Link>
                )}
                {e.topic && <span className="text-gray-400 truncate">— {e.topic}</span>}

                <button
                  onClick={() => run(() => deleteKpiEntry(e.id))}
                  disabled={isPending}
                  className="shrink-0 ml-auto text-gray-300 hover:text-red-500 transition-colors"
                  title="기록 취소"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiProgress({
  label, value, target, auto,
}: { label: string; value: number; target: number; auto?: boolean }) {
  // 목표가 0이면 "집계만 하고 목표는 없는" 항목 — 진행률 바 대신 건수만 보여준다
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const done = target > 0 && value >= target
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="text-gray-500 truncate">
          {label}
          {auto && <span className="ml-1 text-purple-400" title="미팅에서 자동 기록">자동</span>}
        </span>
        <span className={`font-semibold shrink-0 ${done ? 'text-green-600' : 'text-gray-700'}`}>
          {value}{target > 0 && ` / ${target}`}{done && ' ✓'}
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
