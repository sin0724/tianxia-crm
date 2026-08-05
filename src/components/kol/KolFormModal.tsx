'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createKol, updateKol, findSimilarKols, type KolInput, type SimilarKol } from '@/app/(dashboard)/kol/actions'
import {
  CURRENCIES, CURRENCY_LABEL, DELIVERABLE_PRESETS, GONGGU_CATEGORY, GONGGU_CATEGORY_COLOR, fmtFollowers,
} from '@/lib/constants'
import { normalizeHandle } from '@/lib/kol-fields'
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
  // 제공 항목 입력창에 남아 있는 미확정 텍스트 — 저장 시 함께 반영한다
  const [deliverableDraft, setDeliverableDraft] = useState('')
  // 이름이 비슷한 기존 KOL — 경고만 하고 등록은 막지 않는다 (동명이인이 실제로 있다)
  const [similar, setSimilar] = useState<SimilarKol[]>([])
  // 경고를 띄운 이름. 같은 이름으로 다시 누르면 "확인했다"로 보고 그대로 등록한다
  const warnedFor = useRef<string | null>(null)

  const [form, setForm] = useState<KolInput>({
    name:         kol?.name ?? '',
    instagram:    kol?.instagram_handle ?? '',
    email:        kol?.email ?? '',
    followers:    kol?.followers != null ? String(kol.followers) : '',
    categories:   kol?.categories ?? [],
    fee_amount:   kol?.fee_amount != null ? String(kol.fee_amount) : '',
    fee_currency: kol?.fee_currency === 'KRW' ? 'KRW' : 'TWD',
    deliverables: kol?.deliverables ?? [],
    rs_rate:      kol?.rs_rate != null ? String(kol.rs_rate) : '',
    gonggu_categories: kol?.gonggu_categories ?? [],
    visit_note:   kol?.visit_note ?? '',
    visit_date:   kol?.visit_date ?? '',
    history:      kol?.history ?? '',
  })

  function set<K extends keyof KolInput>(key: K, value: KolInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleIn(key: 'categories' | 'gonggu_categories', c: string) {
    set(key, form[key].includes(c) ? form[key].filter(v => v !== c) : [...form[key], c])
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSimilar([])
    // 한글 IME 조합 중("2.3만"의 "만" 등) 바로 저장하면 state에 마지막 글자가 빠질 수 있어
    // 제출 시점의 DOM 값을 읽는다. 칩·카테고리는 버튼 토글이라 state 그대로 사용.
    const fd = new FormData(e.currentTarget)
    const text = (key: keyof KolInput, fallback: string) => {
      const v = fd.get(key)
      return typeof v === 'string' ? v : fallback
    }
    const draft = deliverableDraft.trim()
    const payload: KolInput = {
      ...form,
      name:         text('name', form.name),
      instagram:    text('instagram', form.instagram),
      email:        text('email', form.email),
      followers:    text('followers', form.followers),
      fee_amount:   text('fee_amount', form.fee_amount),
      fee_currency: text('fee_currency', form.fee_currency),
      rs_rate:      text('rs_rate', form.rs_rate),
      deliverables: draft ? [...form.deliverables, draft] : form.deliverables,
      visit_note:   text('visit_note', form.visit_note),
      visit_date:   text('visit_date', form.visit_date),
      history:      text('history', form.history),
    }
    // 폼과 서버가 같은 규칙: 이름이 비면 IG 핸들이 이름이 된다
    const resolvedName = payload.name.trim() || normalizeHandle(payload.instagram) || ''

    startTransition(async () => {
      // 신규 등록만 검사한다. 같은 이름으로 두 번째 누르면 담당자가 확인한 것으로 보고 통과.
      if (!kol && warnedFor.current !== resolvedName) {
        const matches = await findSimilarKols(payload.name, payload.instagram)
        if (matches.length > 0) {
          setSimilar(matches)
          warnedFor.current = resolvedName
          return
        }
      }

      const result = kol ? await updateKol(kol.id, payload) : await createKol(payload)
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
              type="text" name="name" required={!form.instagram.trim()} value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="활동명 또는 본명"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="인스타그램">
              <input
                type="text" name="instagram" value={form.instagram}
                onChange={e => set('instagram', e.target.value)}
                placeholder="@핸들 또는 프로필 URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="팔로워 수">
              <input
                type="text" name="followers" value={form.followers}
                onChange={e => set('followers', e.target.value)}
                placeholder="예: 95000 또는 1.2만"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>

          <Field label="이메일 (선택)">
            <input
              type="email" name="email" value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="contact@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="카테고리 — 콘텐츠 장르 (복수 선택)">
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => {
                const active = form.categories.includes(c.name)
                return (
                  <button
                    key={c.name} type="button" onClick={() => toggleIn('categories', c.name)}
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

          {/* ── 진행 조건 ─────────────────────────────────────── */}
          <fieldset className="border border-gray-200 rounded-lg p-3.5 space-y-3">
            <legend className="px-1 text-xs font-semibold text-gray-700">진행 조건</legend>

            <div className="grid grid-cols-2 gap-3">
              <Field label="고정비 (판매량과 무관한 정액)">
                <div className="flex gap-1.5">
                  <input
                    type="text" name="fee_amount" value={form.fee_amount} inputMode="numeric"
                    onChange={e => set('fee_amount', e.target.value)}
                    placeholder="예: 13,300"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    name="fee_currency" value={form.fee_currency} aria-label="고정비 통화"
                    onChange={e => set('fee_currency', e.target.value)}
                    className="px-2 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="RS 요율 (판매액 대비 KOL 몫)">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" name="rs_rate" value={form.rs_rate} min="0" max="100" step="0.1"
                    onChange={e => set('rs_rate', e.target.value)}
                    placeholder="예: 15"
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </Field>
            </div>
            <p className="text-[11px] text-gray-400">
              고정비만 받는 KOL, RS만 받는 KOL, 둘 다 받는 KOL이 모두 있습니다 — 하나만 채워도 됩니다.
            </p>

            <Field label="제공 항목">
              <ChipInput
                values={form.deliverables}
                onChange={v => set('deliverables', v)}
                draft={deliverableDraft}
                onDraftChange={setDeliverableDraft}
                presets={DELIVERABLE_PRESETS}
                placeholder="직접 입력 (예: 릴스 1개)"
              />
            </Field>

            <Field label="공구 카테고리 — 이 KOL로 돌릴 수 있는 품목">
              <div className="flex flex-wrap gap-1.5">
                {GONGGU_CATEGORY.map(c => {
                  const active = form.gonggu_categories.includes(c)
                  return (
                    <button
                      key={c} type="button" onClick={() => toggleIn('gonggu_categories', c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? `${GONGGU_CATEGORY_COLOR[c]} border-transparent ring-1 ring-blue-400`
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* 레거시 원문 — 새 필드로 옮겨 적을 때 참고용. 수정 없이 보존한다 */}
            {kol?.rate && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-800">
                  기존 단가 원문{kol.rate_needs_review && ' — 위 항목으로 정리해 주세요'}
                </p>
                <p className="mt-0.5 text-xs text-amber-900 whitespace-pre-wrap">{kol.rate}</p>
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field label="방문 예정 (표시용)">
              <input
                type="text" name="visit_note" value={form.visit_note}
                onChange={e => set('visit_note', e.target.value)}
                placeholder="예: 7/12~7/15 방문, 7월중 예정"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label="대표 날짜 (정렬용, 선택)">
              <input
                type="date" name="visit_date" value={form.visit_date}
                onChange={e => set('visit_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>

          <Field label="히스토리 (진행 이력 · 협업 브랜드)">
            <textarea
              name="history" value={form.history} rows={4}
              onChange={e => set('history', e.target.value)}
              placeholder={'예)\n25.05 A브랜드 릴스 진행 (반응 좋음)\n25.03 B클리닉 방문 시술 후기'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          {similar.length > 0 && <SimilarWarning matches={similar} />}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              취소
            </button>
            <button type="submit" disabled={isPending}
              className={`px-4 py-2 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors ${
                similar.length > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}>
              {isPending      ? '저장 중...'
                : kol         ? '수정 저장'
                : similar.length > 0 ? '그래도 등록'
                : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// 칩(태그) 입력 — 프리셋을 누르면 "릴스 "까지 채워지고 커서가 뒤에 놓여
// 수량만 타이핑하면 된다 ("릴스 1개"). 프리셋에 없는 항목도 자유 입력 가능.
function ChipInput({
  values, onChange, draft, onDraftChange, presets, placeholder,
}: {
  values: string[]
  onChange: (v: string[]) => void
  draft: string
  onDraftChange: (v: string) => void
  presets: readonly string[]
  placeholder: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function add(raw: string) {
    const t = raw.trim().replace(/\s+/g, ' ')
    onDraftChange('')
    if (!t || values.includes(t)) return
    onChange([...values, t])
  }

  function quickAdd(preset: string) {
    const next = `${preset} `
    onDraftChange(next)
    const el = inputRef.current
    if (el) {
      // state 반영을 기다리지 않고 바로 커서를 끝에 둔다
      el.value = next
      el.focus()
      el.setSelectionRange(next.length, next.length)
    }
  }

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {v}
              <button
                type="button" onClick={() => onChange(values.filter(x => x !== v))}
                aria-label={`${v} 삭제`}
                className="text-blue-400 hover:text-blue-700 leading-none"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-gray-400 mr-0.5">빠른 추가</span>
        {presets.map(p => (
          <button
            key={p} type="button" onClick={() => quickAdd(p)}
            className="px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
          >
            +{p}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          ref={inputRef} type="text" value={draft} placeholder={placeholder}
          onChange={e => onDraftChange(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return
            // IME 조합 확정용 Enter는 그대로 넘긴다
            if (e.nativeEvent.isComposing) return
            e.preventDefault()  // 폼 제출 방지
            add(draft)
          }}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button" onClick={() => add(draft)}
          className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          추가
        </button>
      </div>
    </div>
  )
}

// 이름 유사 경고 — 동명이인일 수도 있어 막지 않고, 기존 KOL을 새 탭에서 확인만 하게 한다
// (같은 탭에서 이동하면 입력 중인 폼이 통째로 날아간다)
const SIMILAR_SHOWN = 5

function SimilarWarning({ matches }: { matches: SimilarKol[] }) {
  return (
    <div className="rounded-md bg-amber-50 border border-amber-300 px-3 py-2.5 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        ⚠ 이름이 비슷한 KOL이 이미 {matches.length}명 있습니다 — 같은 사람인지 확인해 주세요.
      </p>
      <ul className="space-y-1">
        {matches.slice(0, SIMILAR_SHOWN).map(m => (
          <li key={m.id} className="text-xs text-amber-900">
            <a
              href={`/kol?q=${encodeURIComponent(m.name)}`} target="_blank" rel="noopener noreferrer"
              className="font-medium underline decoration-amber-400 underline-offset-2 hover:text-amber-700"
            >
              {m.name}
            </a>
            {m.instagram_handle && <span className="text-amber-700"> · @{m.instagram_handle}</span>}
            {m.followers != null && <span className="text-amber-700"> · {fmtFollowers(Number(m.followers))}</span>}
          </li>
        ))}
      </ul>
      {matches.length > SIMILAR_SHOWN && (
        <p className="text-[11px] text-amber-700">외 {matches.length - SIMILAR_SHOWN}명</p>
      )}
      <p className="text-[11px] text-amber-700">
        다른 사람이 맞다면 <strong>그래도 등록</strong>을 다시 누르세요.
      </p>
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
