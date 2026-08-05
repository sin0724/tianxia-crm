'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createKpiMetric, updateKpiMetric, deleteKpiMetric,
  swapKpiMetricOrder, seedDefaultKpiMetrics,
} from '@/app/(dashboard)/settings/kpi-metric-actions'
import { KPI_KIND_LABEL, KPI_KIND_HINT, type KpiMetricKind } from '@/lib/constants'
import type { KpiMetric } from '@/lib/kpi'

const inputCls = 'px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const KIND_BADGE: Record<KpiMetricKind, string> = {
  manual:  'bg-blue-100 text-blue-700',
  meeting: 'bg-purple-100 text-purple-700',
}

export function KpiMetricSettings({ metrics }: { metrics: KpiMetric[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function run(fn: () => Promise<{ error?: string }>, onDone?: () => void) {
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

  if (metrics.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          아직 KPI 항목이 없습니다. 기본 항목(KOL 제안 · 스레드 업로드 · 미팅 3종)을 만들고 시작하세요.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => run(seedDefaultKpiMetrics)}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          기본 항목 만들기
        </button>
      </div>
    )
  }

  const totalTarget = metrics
    .filter(m => m.is_active)
    .reduce((sum, m) => sum + m.monthly_target, 0)

  return (
    <div className="space-y-3">
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
        {metrics.map((m, i) => (
          <div key={m.id} className={`p-3 ${m.is_active ? 'bg-white' : 'bg-gray-50'}`}>
            {editingId === m.id ? (
              <MetricEditor
                metric={m}
                isPending={isPending}
                onCancel={() => setEditingId(null)}
                onSave={changes => run(() => updateKpiMetric(m.id, changes), () => setEditingId(null))}
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col">
                  <button
                    onClick={() => run(() => swapKpiMetricOrder(m.id, metrics[i - 1].id))}
                    disabled={isPending || i === 0}
                    className="text-[10px] leading-none text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300"
                    title="위로"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => run(() => swapKpiMetricOrder(m.id, metrics[i + 1].id))}
                    disabled={isPending || i === metrics.length - 1}
                    className="text-[10px] leading-none text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300"
                    title="아래로"
                  >
                    ▼
                  </button>
                </div>

                <span className={`text-sm font-medium ${m.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {m.label}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGE[m.kind]}`}>
                  {KPI_KIND_LABEL[m.kind]}
                </span>
                {m.kind === 'meeting' && m.is_default && (
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">기본</span>
                )}

                <span className="ml-auto text-sm text-gray-600 whitespace-nowrap">
                  월 <span className="font-semibold text-gray-900">{m.monthly_target}</span>건
                </span>

                <button
                  onClick={() => { setEditingId(m.id); setAdding(false); setError(null) }}
                  disabled={isPending}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  수정
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        활성 항목 {metrics.filter(m => m.is_active).length}개 · 1인당 월 목표 합계 {totalTarget}건
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

      {adding ? (
        <NewMetricForm
          isPending={isPending}
          onCancel={() => setAdding(false)}
          onSave={input => run(() => createKpiMetric(input), () => setAdding(false))}
        />
      ) : (
        <button
          onClick={() => { setAdding(true); setEditingId(null); setError(null) }}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
        >
          + KPI 항목 추가
        </button>
      )}
    </div>
  )
}

// ── 기존 항목 수정 ────────────────────────────────────────────
// 기록 방식(kind)은 바꾸지 않는다 — 집계 경로가 달라 과거 실적의 의미가 흔들린다.
// 더 쓰지 않는 항목은 삭제 대신 '숨김'을 권한다 (지난 달 실적이 사라지지 않도록).

function MetricEditor({
  metric, isPending, onSave, onCancel,
}: {
  metric: KpiMetric
  isPending: boolean
  onSave: (changes: { label?: string; monthly_target?: number; is_active?: boolean; is_default?: boolean }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(metric.label)
  const [target, setTarget] = useState(String(metric.monthly_target))
  const router = useRouter()
  const [delError, setDelError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  function handleDelete() {
    setDelError(null)
    startDelete(async () => {
      const result = await deleteKpiMetric(metric.id)
      if (result?.error) setDelError(result.error)
      else { onCancel(); router.refresh() }
    })
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSave({ label, monthly_target: Number(target) })
      }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          className={`${inputCls} flex-1 min-w-40`}
          placeholder="항목 이름"
          autoFocus
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">월</span>
          <input
            type="number"
            min={0}
            value={target}
            onChange={e => setTarget(e.target.value)}
            className={`${inputCls} w-20`}
          />
          <span className="text-xs text-gray-500">건</span>
        </div>
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
          저장
        </button>
        <button type="button" onClick={onCancel}
          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800">
          취소
        </button>
      </div>

      <p className="text-xs text-gray-400">{KPI_KIND_HINT[metric.kind]}</p>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button type="button" disabled={isPending}
          onClick={() => onSave({ is_active: !metric.is_active })}
          className="text-gray-500 hover:text-gray-800 disabled:opacity-50">
          {metric.is_active ? '숨기기 (새 기록 중단, 지난 실적 유지)' : '다시 사용하기'}
        </button>

        {metric.kind === 'meeting' && !metric.is_default && (
          <button type="button" disabled={isPending}
            onClick={() => onSave({ is_default: true })}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-50">
            기본 미팅으로 지정 (종류 미지정 자동 기록이 여기로)
          </button>
        )}

        <button type="button" disabled={isDeleting}
          onClick={handleDelete}
          className="ml-auto text-red-500 hover:text-red-700 disabled:opacity-50">
          삭제
        </button>
      </div>

      {delError && <p className="text-xs text-red-600">{delError}</p>}
    </form>
  )
}

// ── 새 항목 추가 ──────────────────────────────────────────────

function NewMetricForm({
  isPending, onSave, onCancel,
}: {
  isPending: boolean
  onSave: (input: { label: string; kind: KpiMetricKind; monthly_target: number }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<KpiMetricKind>('manual')
  const [target, setTarget] = useState('10')

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSave({ label, kind, monthly_target: Number(target) })
      }}
      className="border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="항목 이름 (예: 인스타 DM 발송)"
          required
          autoFocus
          className={`${inputCls} flex-1 min-w-40`}
        />
        <select value={kind} onChange={e => setKind(e.target.value as KpiMetricKind)} className={inputCls}>
          <option value="manual">{KPI_KIND_LABEL.manual}</option>
          <option value="meeting">{KPI_KIND_LABEL.meeting}</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">월</span>
          <input type="number" min={0} value={target} onChange={e => setTarget(e.target.value)}
            className={`${inputCls} w-20`} />
          <span className="text-xs text-gray-500">건</span>
        </div>
      </div>

      <p className="text-xs text-gray-500">{KPI_KIND_HINT[kind]}</p>

      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
          추가
        </button>
        <button type="button" onClick={onCancel}
          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800">
          취소
        </button>
      </div>
    </form>
  )
}
