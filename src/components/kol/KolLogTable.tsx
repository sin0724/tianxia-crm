'use client'

import { Fragment, useState } from 'react'
import {
  KOL_LOG_ACTION_COLOR, KOL_LOG_ACTION_LABEL, KOL_LOG_TARGET_LABEL,
  type KolLogAction, type KolLogTarget,
} from '@/lib/constants'
import { fmtFullDateTimeKST } from '@/lib/datetime'
import type { KolAuditLog } from '@/lib/kol-audit'

interface FieldChange {
  label: string
  from: string
  to: string
}

export function KolLogTable({ logs }: { logs: KolAuditLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (logs.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">
        조건에 맞는 기록이 없습니다.
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400">
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">시각</th>
              <th className="px-3 py-2.5 font-medium">작업자</th>
              <th className="px-3 py-2.5 font-medium">작업</th>
              <th className="px-3 py-2.5 font-medium">대상</th>
              <th className="px-3 py-2.5 font-medium">내용</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">건수</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const expanded = expandedId === log.id
              const changes = asChanges(log.details)
              return (
                <Fragment key={log.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      expanded ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {fmtFullDateTimeKST(log.created_at)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{log.actor_name}</div>
                      {log.actor_email && <div className="text-[11px] text-gray-400">{log.actor_email}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                        KOL_LOG_ACTION_COLOR[log.action as KolLogAction] ?? 'bg-gray-100 text-gray-600'
                      }`}>
                        {KOL_LOG_ACTION_LABEL[log.action as KolLogAction] ?? log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-gray-900">{log.target_name ?? '—'}</div>
                      <div className="text-[11px] text-gray-400">
                        {KOL_LOG_TARGET_LABEL[log.target_type as KolLogTarget] ?? log.target_type}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[420px] truncate" title={log.summary ?? undefined}>
                      {log.summary ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                      {log.item_count != null ? `${log.item_count.toLocaleString('ko-KR')}건` : '—'}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="border-b border-gray-100 bg-blue-50/30">
                      <td colSpan={6} className="px-4 py-3">
                        {changes && changes.length > 0 ? (
                          <table className="text-xs">
                            <tbody>
                              {changes.map((c, i) => (
                                <tr key={i}>
                                  <td className="pr-4 py-0.5 text-gray-400 whitespace-nowrap align-top">{c.label}</td>
                                  <td className="pr-2 py-0.5 text-gray-500 line-through">{c.from}</td>
                                  <td className="pr-2 py-0.5 text-gray-400">→</td>
                                  <td className="py-0.5 font-medium text-gray-900">{c.to}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : log.details ? (
                          <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-all max-h-72 overflow-y-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-xs text-gray-400">추가로 기록된 상세 내용이 없습니다.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// details.changes(수정 로그)만 표 형태로 예쁘게 보여주고, 나머지는 원본 JSON으로 떨어뜨린다
function asChanges(details: Record<string, unknown> | null): FieldChange[] | null {
  const raw = details?.changes
  if (!Array.isArray(raw)) return null
  return raw.filter((c): c is FieldChange =>
    !!c && typeof c === 'object' && 'label' in c && 'from' in c && 'to' in c)
}
