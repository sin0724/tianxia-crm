'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchKolCopyRows } from '@/app/(dashboard)/kol/copy-actions'
import type { KolCopyRow } from '@/lib/kols'
import { fmtFollowers } from '@/lib/constants'
import { fmtDateKST } from '@/lib/datetime'

// ── 복사 텍스트 조립 ─────────────────────────────────────────
// KOL 리스트 (팔로워 3~7만) · 4명
//
// 1. https://instagram.com/beauty_kim · 3.2만
//    방문: 7/12~7/15 방문

function buildHeader(sp: URLSearchParams, count: number): string {
  const parts: string[] = []

  const min = sp.get('followers_min')
  const max = sp.get('followers_max')
  if (min && max)      parts.push(`팔로워 ${min}~${max}만`)
  else if (min)        parts.push(`팔로워 ${min}만~`)
  else if (max)        parts.push(`팔로워 ~${max}만`)

  const category = sp.get('category')
  if (category) parts.push(category)

  const q = sp.get('q')
  if (q) parts.push(`"${q}"`)

  return parts.length > 0
    ? `KOL 리스트 (${parts.join(' · ')}) · ${count}명`
    : `KOL 리스트 · 전체 ${count}명`
}

function buildCopyText(rows: KolCopyRow[], sp: URLSearchParams): string {
  const items = rows.map((kol, i) => {
    const who = kol.instagram_handle
      ? `https://instagram.com/${kol.instagram_handle}`
      : kol.name
    const followers = kol.followers !== null ? ` · ${fmtFollowers(kol.followers)}` : ''
    const visit = kol.visit_note ?? (kol.visit_date ? fmtDateKST(kol.visit_date) : null)

    const lines = [`${i + 1}. ${who}${followers}`]
    if (visit) lines.push(`   방문: ${visit}`)
    return lines.join('\n')
  })

  return [buildHeader(sp, rows.length), '', items.join('\n\n')].join('\n')
}

// 클립보드 쓰기 (navigator.clipboard 불가 환경 폴백 포함)
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────

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
          sort:          sp.get('sort') ?? undefined,
        })
        const ok = await copyToClipboard(buildCopyText(rows, sp))
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
      title="필터에 걸린 전체 리스트를 '인스타 링크 · 팔로워 · 방문 예정' 텍스트로 복사 (카톡·슬랙에 붙여넣기)"
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
        : '📋 텍스트 복사'}
    </button>
  )
}
