'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickLogActivity } from '@/app/(dashboard)/companies/activity-actions'
import type { TaskCompany } from '@/lib/tasks'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

interface TaskSectionProps {
  title: string
  companies: TaskCompany[]
  dateLabel: string
  dateKey: keyof Pick<TaskCompany, 'next_action_at' | 'last_contacted_at' | 'meeting_at'>
  emptyMessage: string
  accent?: 'red'
}

export function TaskSection({ title, companies, dateLabel, dateKey, emptyMessage, accent }: TaskSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set())

  // 퀵 활동 기록: 부재(내일 재시도) / 통화 완료(3일 뒤 팔로업)
  function quickLog(companyId: string, result: '부재' | null, nextDays: number) {
    setError(null)
    startTransition(async () => {
      const res = await quickLogActivity(companyId, '전화', result, nextDays)
      if (res?.error) {
        setError(res.error)
        return
      }
      setLoggedIds(prev => new Set(prev).add(companyId))
      router.refresh()
    })
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
                    {c.category ?? '—'} · {c.profiles?.name ?? '—'} · {c.status}
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
                      onClick={() => quickLog(c.id, '부재', 1)}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      title="전화/부재로 기록하고 다음 액션일을 내일로 설정"
                    >
                      부재 (내일 재시도)
                    </button>
                    <button
                      onClick={() => quickLog(c.id, null, 3)}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      title="통화로 기록하고 다음 액션일을 3일 뒤로 설정"
                    >
                      통화함 (+3일)
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
