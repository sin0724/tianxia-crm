'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createKolCategory, renameKolCategory, deleteKolCategory, moveKolCategory,
} from '@/app/(dashboard)/kol/category-actions'

export interface CategoryItem {
  id: string
  name: string
  color: string
}

// 마이그레이션 전 폴백 목록(id가 fallback-*)이면 수정 불가 — 안내만 표시
function isFallback(categories: CategoryItem[]): boolean {
  return categories.some(c => c.id.startsWith('fallback-'))
}

export function KolCategoryManager({ categories }: { categories: CategoryItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const readOnly = isFallback(categories)

  function run(action: () => Promise<{ error: string } | undefined>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      setEditingId(null)
      setNewName('')
      router.refresh()
    })
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault()
    run(() => createKolCategory(newName))
  }

  function onDelete(c: CategoryItem) {
    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?\n이 카테고리를 쓰는 KOL 태그에서도 함께 제거됩니다.`)) return
    run(() => deleteKolCategory(c.id))
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        🏷 카테고리 관리
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">KOL 카테고리 관리</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <p className="text-xs text-gray-500">
              이름을 바꾸면 기존 KOL에 붙은 태그도 함께 바뀌고, 삭제하면 KOL에서도 제거됩니다. 순서는 필터 탭·등록 화면에 그대로 반영됩니다.
            </p>

            {readOnly && (
              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
                아직 기본 카테고리로 동작 중입니다. Supabase SQL 편집기에서 schema.sql의 &quot;11. KOL 카테고리 관리&quot; 섹션을 실행하면 여기서 자유롭게 수정할 수 있습니다.
              </p>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

            <form onSubmit={onAdd} className="flex gap-2">
              <input
                type="text" value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="새 카테고리 이름"
                disabled={readOnly || isPending}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
              <button
                type="submit" disabled={readOnly || isPending || !newName.trim()}
                className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                추가
              </button>
            </form>

            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {categories.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                  {editingId === c.id ? (
                    <form
                      onSubmit={e => { e.preventDefault(); run(() => renameKolCategory(c.id, editName)) }}
                      className="flex flex-1 items-center gap-1.5"
                    >
                      <input
                        type="text" value={editName} autoFocus
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="submit" disabled={isPending || !editName.trim()}
                        className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">
                        저장
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={isPending}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">
                        취소
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>{c.name}</span>
                      <span className="flex-1" />
                      <button
                        onClick={() => run(() => moveKolCategory(c.id, 'up'))}
                        disabled={readOnly || isPending || i === 0}
                        title="위로" className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      >↑</button>
                      <button
                        onClick={() => run(() => moveKolCategory(c.id, 'down'))}
                        disabled={readOnly || isPending || i === categories.length - 1}
                        title="아래로" className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      >↓</button>
                      <button
                        onClick={() => { setEditingId(c.id); setEditName(c.name) }}
                        disabled={readOnly || isPending}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 disabled:opacity-30 transition-colors"
                      >
                        이름 변경
                      </button>
                      <button
                        onClick={() => onDelete(c)}
                        disabled={readOnly || isPending}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
