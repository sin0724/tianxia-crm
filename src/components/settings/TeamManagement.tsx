'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMemberAccess } from '@/app/(dashboard)/settings/actions'

export interface Member {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'sales'
  team: string | null
  is_active: boolean
}

const ROLE_LABEL = { admin: '관리자', manager: '매니저', sales: '영업' } as const

export function TeamManagement({ members, myId }: { members: Member[]; myId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function apply(targetId: string, changes: Parameters<typeof updateMemberAccess>[1]) {
    setError(null)
    startTransition(async () => {
      const result = await updateMemberAccess(targetId, changes)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  function startEditName(m: Member) {
    setEditingId(m.id)
    setEditName(m.name)
  }

  function saveName(targetId: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateMemberAccess(targetId, { name: editName })
      if (result?.error) {
        setError(result.error)
        return
      }
      setEditingId(null)
      router.refresh()
    })
  }

  const pending = members.filter(m => !m.is_active)
  const active  = members.filter(m => m.is_active)

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}

      {pending.length > 0 && (
        <div>
          <p className="text-xs font-medium text-orange-600 mb-2">승인 대기 ({pending.length})</p>
          <div className="space-y-2">
            {pending.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  {editingId === m.id ? (
                    <form
                      onSubmit={e => { e.preventDefault(); saveName(m.id) }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        className="w-32 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="submit" disabled={isPending}
                        className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
                        저장
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={isPending}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                        취소
                      </button>
                    </form>
                  ) : (
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.name}
                      <button
                        onClick={() => startEditName(m)}
                        disabled={isPending}
                        className="ml-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                        title="이름 수정"
                      >
                        ✏️
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                </div>
                <button
                  onClick={() => apply(m.id, { is_active: true })}
                  disabled={isPending}
                  className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  승인
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.map(m => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
            <div className="min-w-0 flex-1">
              {editingId === m.id ? (
                <form
                  onSubmit={e => { e.preventDefault(); saveName(m.id) }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                    className="w-32 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="submit" disabled={isPending}
                    className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
                    저장
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} disabled={isPending}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                    취소
                  </button>
                </form>
              ) : (
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.name}
                  {m.id === myId && <span className="ml-1 text-xs text-gray-400">(나)</span>}
                  <button
                    onClick={() => startEditName(m)}
                    disabled={isPending}
                    className="ml-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                    title="이름 수정"
                  >
                    ✏️
                  </button>
                </p>
              )}
              <p className="text-xs text-gray-500 truncate">{m.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={m.role}
                onChange={e => apply(m.id, { role: e.target.value as Member['role'] })}
                disabled={isPending || m.id === myId}
                className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white disabled:opacity-50"
              >
                {(Object.keys(ROLE_LABEL) as Member['role'][]).map(r => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              {m.id !== myId && (
                <button
                  onClick={() => apply(m.id, { is_active: false })}
                  disabled={isPending}
                  className="px-2 py-1 border border-gray-300 text-gray-500 text-xs rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  비활성화
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
