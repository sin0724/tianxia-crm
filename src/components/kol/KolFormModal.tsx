'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createKol, updateKol, type KolInput } from '@/app/(dashboard)/kol/actions'
import type { Kol } from '@/lib/kols'

interface KolFormModalProps {
  kol?: Kol          // 있으면 수정, 없으면 신규 등록
  categories: { name: string; color: string }[]
  onClose: () => void
}

export function KolFormModal({ kol, categories, onClose }: KolFormModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<KolInput>({
    name:       kol?.name ?? '',
    instagram:  kol?.instagram_handle ?? '',
    email:      kol?.email ?? '',
    followers:  kol?.followers != null ? String(kol.followers) : '',
    categories: kol?.categories ?? [],
    rate:       kol?.rate ?? '',
    visit_note: kol?.visit_note ?? '',
    visit_date: kol?.visit_date ?? '',
    history:    kol?.history ?? '',
  })

  function set<K extends keyof KolInput>(key: K, value: KolInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleCategory(c: string) {
    set('categories', form.categories.includes(c)
      ? form.categories.filter(v => v !== c)
      : [...form.categories, c])
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = kol ? await updateKol(kol.id, form) : await createKol(form)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {kol ? 'KOL 수정' : 'KOL 등록'}
            </h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>

          <Field label="이름 (비우면 IG 핸들 사용)">
            <input
              type="text" required={!form.instagram.trim()} value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="활동명 또는 본명"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="인스타그램">
              <input
                type="text" value={form.instagram}
                onChange={e => set('instagram', e.target.value)}
                placeholder="@핸들 또는 프로필 URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="팔로워 수">
              <input
                type="text" value={form.followers}
                onChange={e => set('followers', e.target.value)}
                placeholder="예: 95000 또는 1.2만"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>

          <Field label="이메일 (선택)">
            <input
              type="email" value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="contact@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="카테고리 (복수 선택)">
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => {
                const active = form.categories.includes(c.name)
                return (
                  <button
                    key={c.name} type="button" onClick={() => toggleCategory(c.name)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? `${c.color} border-transparent ring-1 ring-blue-400`
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="진행 단가">
            <input
              type="text" value={form.rate}
              onChange={e => set('rate', e.target.value)}
              placeholder="예: 피드 50 / 릴스 80"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="방문 예정 (표시용)">
              <input
                type="text" value={form.visit_note}
                onChange={e => set('visit_note', e.target.value)}
                placeholder="예: 7/12~7/15 방문, 7월중 예정"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="대표 날짜 (정렬용, 선택)">
              <input
                type="date" value={form.visit_date}
                onChange={e => set('visit_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>

          <Field label="히스토리 (진행 이력 · 협업 브랜드)">
            <textarea
              value={form.history} rows={4}
              onChange={e => set('history', e.target.value)}
              placeholder={'예)\n25.05 A브랜드 릴스 진행 (반응 좋음)\n25.03 B클리닉 방문 시술 후기'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              취소
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isPending ? '저장 중...' : kol ? '수정 저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}
