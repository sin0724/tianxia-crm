'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ACTIVITY_TYPE, ACTIVITY_RESULT } from '@/lib/constants'
import { createActivity } from '@/app/(dashboard)/companies/activity-actions'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export function ActivityForm({ companyId }: { companyId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createActivity(companyId, fd)
      if (result?.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        + 활동 추가
      </button>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            활동 유형 <span className="text-red-500">*</span>
          </label>
          <select name="activity_type" required className={inputCls}>
            <option value="">선택</option>
            {ACTIVITY_TYPE.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            활동 결과
          </label>
          <select name="activity_result" className={inputCls}>
            <option value="">선택</option>
            {ACTIVITY_RESULT.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            다음 액션일
          </label>
          <input name="next_action_at" type="date" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          메모
        </label>
        <textarea
          name="memo"
          rows={3}
          className={`${inputCls} resize-none`}
          placeholder="통화 내용, 특이사항 등..."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '저장 중...' : '저장'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={isPending}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          취소
        </button>
      </div>
    </form>
  )
}
