import Link from 'next/link'
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
}

export function TaskSection({ title, companies, dateLabel, dateKey, emptyMessage }: TaskSectionProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {companies.length > 0 && (
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {companies.length}
          </span>
        )}
      </div>

      {companies.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {companies.map(c => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.company_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.category ?? '—'} · {c.profiles?.name ?? '—'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-gray-500">{dateLabel}</p>
                <p className="text-xs font-medium text-gray-700 mt-0.5">
                  {fmtDate(c[dateKey] as string | null)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
