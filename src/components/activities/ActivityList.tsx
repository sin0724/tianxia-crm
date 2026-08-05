import {
  ACTIVITY_TYPE_COLOR,
  ACTIVITY_RESULT_COLOR,
  type ActivityType,
  type ActivityResult,
} from '@/lib/constants'
import type { Activity } from '@/lib/activities'

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

function TypeBadge({ type }: { type: string }) {
  const color = ACTIVITY_TYPE_COLOR[type as ActivityType] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {type}
    </span>
  )
}

function ResultBadge({ result }: { result: string }) {
  const color = ACTIVITY_RESULT_COLOR[result as ActivityResult] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {result}
    </span>
  )
}

interface ActivityListProps {
  activities: Activity[]
  /** KPI 항목 key → 이름 (미팅 활동이 어떤 KPI로 잡혔는지 보여주기 위함) */
  meetingLabels?: Record<string, string>
}

export function ActivityList({ activities, meetingLabels = {} }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        아직 활동 내역이 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map(a => (
        <div key={a.id} className="border border-gray-100 rounded-lg p-4 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <TypeBadge type={a.activity_type} />
              {a.activity_type === '미팅' && a.meeting_type && (
                <span
                  className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"
                  title="이 미팅은 담당자의 월 KPI로 자동 집계되었습니다"
                >
                  {meetingLabels[a.meeting_type] ?? a.meeting_type} · KPI 반영
                </span>
              )}
              {a.activity_result && <ResultBadge result={a.activity_result} />}
              <span className="text-xs text-gray-400 font-medium">{a.profiles?.name ?? '—'}</span>
            </div>
            <time className="text-xs text-gray-400 whitespace-nowrap shrink-0">
              {fmtDateTime(a.created_at)}
            </time>
          </div>

          {a.memo && (
            <p className="mt-2.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {a.memo}
            </p>
          )}

          {a.next_action_at && (
            <p className="mt-2 text-xs text-gray-400">
              다음 액션일 <span className="text-gray-600 font-medium">{fmtDate(a.next_action_at)}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
