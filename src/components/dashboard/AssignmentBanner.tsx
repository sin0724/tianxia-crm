'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markNotificationsRead } from '@/app/(dashboard)/dashboard/actions'
import { fmtDateTimeKST } from '@/lib/datetime'
import type { InAppNotification } from '@/lib/notifications'

interface AssignmentBannerProps {
  notifications: InAppNotification[]
  href: string // "내 거래처 보기" — 본인 담당분을 배분 최신순으로
}

// 제목 "거래처 12건 배정 (신규 10건 · 재배분 2건)"에서 건수를 읽는다.
// 형식이 다르면 알림 1개를 1건으로 본다.
function countOf(n: InAppNotification) {
  const total = Number(n.title.match(/거래처\s*(\d+)건/)?.[1] ?? 1)
  const reassigned = Number(n.title.match(/재배분\s*(\d+)건/)?.[1] ?? 0)
  return { total, reassigned }
}

// 배분할 때마다 알림이 1개씩 생겨 목록이 길게 쌓이므로,
// 미열람 알림을 카드 하나로 합쳐 총 건수만 보여주고 상세 내역은 펼쳐서 본다.
export function AssignmentBanner({ notifications, href }: AssignmentBannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)

  if (notifications.length === 0) return null

  const sums = notifications.map(countOf)
  const total = sums.reduce((s, c) => s + c.total, 0)
  const reassigned = sums.reduce((s, c) => s + c.reassigned, 0)
  const fresh = total - reassigned

  function readAll() {
    startTransition(async () => {
      await markNotificationsRead(notifications.map(n => n.id))
      router.refresh()
    })
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-xl">
          📬
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-gray-500">새로 배정된 거래처</p>
          <p className="text-xl font-bold tracking-tight text-gray-900">
            {total.toLocaleString('ko-KR')}곳
            {reassigned > 0 && (
              <span className="ml-2 align-middle text-[13px] font-medium text-gray-400">
                {fresh > 0 && `신규 ${fresh} · `}재배분 {reassigned}
              </span>
            )}
          </p>
        </div>
        <Link
          href={href}
          onClick={readAll}
          className="shrink-0 rounded-xl bg-[#3182f6] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b64da] active:scale-[0.98]"
        >
          확인하기
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-[13px]">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="font-medium text-gray-500 transition-colors hover:text-gray-800"
          aria-expanded={expanded}
        >
          배정 내역 {notifications.length}개 {expanded ? '접기 ▴' : '보기 ▾'}
        </button>
        <button
          type="button"
          onClick={readAll}
          disabled={isPending}
          className="font-medium text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-50"
        >
          모두 읽음
        </button>
      </div>

      {expanded && (
        <ul className="mt-2 max-h-64 divide-y divide-gray-50 overflow-y-auto">
          {notifications.map(n => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-800">{n.title}</p>
                {n.body && <p className="mt-0.5 truncate text-xs text-gray-400">{n.body}</p>}
              </div>
              <span className="shrink-0 text-xs text-gray-400">{fmtDateTimeKST(n.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
