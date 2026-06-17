'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markNotificationsRead } from '@/app/(dashboard)/dashboard/actions'
import type { InAppNotification } from '@/lib/notifications'

interface AssignmentBannerProps {
  notifications: InAppNotification[]
}

export function AssignmentBanner({ notifications }: AssignmentBannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (notifications.length === 0) return null

  function dismissAll() {
    startTransition(async () => {
      await markNotificationsRead(notifications.map(n => n.id))
      router.refresh()
    })
  }

  function dismissOne(id: string) {
    startTransition(async () => {
      await markNotificationsRead([id])
      router.refresh()
    })
  }

  return (
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">📬</span>
          <h3 className="text-sm font-semibold text-blue-900">새로 배정된 거래처가 있습니다</h3>
        </div>
        <button
          onClick={dismissAll}
          disabled={isPending}
          className="shrink-0 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50 transition-colors"
        >
          모두 확인
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {notifications.map(n => (
          <li
            key={n.id}
            className="flex items-start justify-between gap-3 rounded-lg bg-white border border-blue-100 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
              {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {n.link && (
                <Link
                  href={n.link}
                  onClick={() => dismissOne(n.id)}
                  className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  확인하러 가기
                </Link>
              )}
              <button
                onClick={() => dismissOne(n.id)}
                disabled={isPending}
                className="text-gray-300 hover:text-gray-500 disabled:opacity-50 transition-colors"
                title="확인"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
