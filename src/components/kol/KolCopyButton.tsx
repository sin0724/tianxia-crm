'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchKolCopyRows } from '@/app/(dashboard)/kol/copy-actions'
import { buildKolCopyText, copyToClipboard } from '@/lib/kol-copy'
import { kstDateString } from '@/lib/datetime'

// "2026-07-07" → "07.07"
function shortDate(s: string): string {
  return s.slice(5).replace('-', '.')
}

// 적용된 필터를 헤더 한 줄로 요약: "KOL 리스트 (팔로워 3~7만 · 방문 07.07~07.13) · 12명"
function buildHeader(sp: URLSearchParams, count: number): string {
  const parts: string[] = []

  const min = sp.get('followers_min')
  const max = sp.get('followers_max')
  if (min && max)      parts.push(`팔로워 ${min}~${max}만`)
  else if (min)        parts.push(`팔로워 ${min}만~`)
  else if (max)        parts.push(`팔로워 ~${max}만`)

  const vFrom = sp.get('visit_from')
  const vTo   = sp.get('visit_to')
  if (vFrom && vTo)    parts.push(`방문 ${shortDate(vFrom)}~${shortDate(vTo)}`)
  else if (vFrom)      parts.push(`방문 ${shortDate(vFrom)}~`)
  else if (vTo)        parts.push(`방문 ~${shortDate(vTo)}`)

  const category = sp.get('category')
  if (category) parts.push(category)

  const q = sp.get('q')
  if (q) parts.push(`"${q}"`)

  return parts.length > 0
    ? `KOL 리스트 (${parts.join(' · ')}) · ${count}명`
    : `KOL 리스트 · 전체 ${count}명`
}

export function KolCopyButton({ total }: { total: number }) {
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copiedCount, setCopiedCount] = useState(0)

  function onCopy() {
    setStatus('idle')
    startTransition(async () => {
      try {
        const rows = await fetchKolCopyRows({
          q:             sp.get('q') ?? undefined,
          category:      sp.get('category') ?? undefined,
          followers_min: sp.get('followers_min') ?? undefined,
          followers_max: sp.get('followers_max') ?? undefined,
          visit_from:    sp.get('visit_from') ?? undefined,
          visit_to:      sp.get('visit_to') ?? undefined,
          sort:          sp.get('sort') ?? undefined,
        })
        const text = buildKolCopyText(rows, buildHeader(sp, rows.length), kstDateString())
        const ok = await copyToClipboard(text)
        setCopiedCount(rows.length)
        setStatus(ok ? 'copied' : 'error')
      } catch {
        setStatus('error')
      }
      setTimeout(() => setStatus('idle'), 3000)
    })
  }

  return (
    <button
      onClick={onCopy}
      disabled={isPending || total === 0}
      title="필터에 걸린 전체 리스트를 '인스타 링크 · 팔로워 · 방문 예정' 텍스트로 복사 (일부만 필요하면 표에서 체크 후 선택 복사)"
      className={`px-3 py-1.5 text-sm border rounded-md transition-colors disabled:opacity-40 whitespace-nowrap ${
        status === 'copied'
          ? 'text-green-700 border-green-300 bg-green-50'
          : status === 'error'
            ? 'text-red-600 border-red-300 bg-red-50'
            : 'text-gray-600 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {isPending ? '복사 준비 중...'
        : status === 'copied' ? `✓ ${copiedCount}명 복사됨`
        : status === 'error' ? '복사 실패 — 다시 시도'
        : '📋 전체 복사'}
    </button>
  )
}
