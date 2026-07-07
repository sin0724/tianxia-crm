'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function Pagination({ page, pageCount, total, basePath = '/companies' }: { page: number; pageCount: number; total: number; basePath?: string }) {
  const router = useRouter()
  const sp = useSearchParams()

  if (pageCount <= 1) return null

  function goto(p: number) {
    const params = new URLSearchParams(sp.toString())
    if (p <= 1) params.delete('page')
    else params.set('page', String(p))
    router.push(`${basePath}?${params}`)
  }

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={() => goto(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← 이전
      </button>
      <span className="text-sm text-gray-500">
        {page} / {pageCount} 페이지 <span className="text-gray-400">(총 {total.toLocaleString('ko-KR')}건)</span>
      </span>
      <button
        onClick={() => goto(page + 1)}
        disabled={page >= pageCount}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        다음 →
      </button>
    </div>
  )
}
