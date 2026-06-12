'use client'

import Link from 'next/link'
import { useOptimistic, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COMPANY_STATUS, STATUS_COLOR, STAGES, STAGE_STATUS, type CompanyStatus } from '@/lib/constants'
import { updateCompanyStatus } from '@/app/(dashboard)/companies/actions'

export interface BoardCompany {
  id: string
  company_name: string
  category: string | null
  status: string
  next_action_at: string | null
  profiles: { name: string } | null
}

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

export function KanbanBoard({ companies }: { companies: BoardCompany[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const [optimistic, applyOptimistic] = useOptimistic(
    companies,
    (state, { id, status }: { id: string; status: string }) =>
      state.map(c => (c.id === id ? { ...c, status } : c)),
  )

  function handleDrop(e: React.DragEvent, status: CompanyStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/company-id')
    if (!id) return
    const company = companies.find(c => c.id === id)
    if (!company || company.status === status) return

    setError(null)
    startTransition(async () => {
      applyOptimistic({ id, status })
      const result = await updateCompanyStatus(id, status)
      if (result?.error) setError(result.error)
      router.refresh()
    })
  }

  const byStatus = new Map<string, BoardCompany[]>()
  for (const s of COMPANY_STATUS) byStatus.set(s, [])
  for (const c of optimistic) byStatus.get(c.status)?.push(c)

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max">
          {STAGES.map(stage => (
            <div key={stage}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{stage}</p>
              <div className="flex gap-3">
                {STAGE_STATUS[stage].map(status => (
                  <div
                    key={status}
                    onDragOver={e => { e.preventDefault(); setDragOver(status) }}
                    onDragLeave={() => setDragOver(prev => (prev === status ? null : prev))}
                    onDrop={e => handleDrop(e, status)}
                    className={`w-56 shrink-0 rounded-xl border p-2 transition-colors ${
                      dragOver === status ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between px-1.5 py-1 mb-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status]}`}>
                        {status}
                      </span>
                      <span className="text-xs text-gray-400">{byStatus.get(status)?.length ?? 0}</span>
                    </div>

                    <div className="space-y-1.5 min-h-16">
                      {(byStatus.get(status) ?? []).map(c => (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={e => e.dataTransfer.setData('text/company-id', c.id)}
                          className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors"
                        >
                          <Link href={`/companies/${c.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 block truncate">
                            {c.company_name}
                          </Link>
                          <p className="mt-1 text-xs text-gray-400 truncate">
                            {[c.category, c.profiles?.name].filter(Boolean).join(' · ') || '—'}
                          </p>
                          {c.next_action_at && (
                            <p className="mt-0.5 text-xs text-gray-500">액션 {fmtDate(c.next_action_at)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
