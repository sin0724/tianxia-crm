'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { COMPANY_STATUS, COMPANY_CATEGORY, COMPANY_SOURCE } from '@/lib/constants'
import { createCompany, updateCompany } from '@/app/(dashboard)/companies/actions'
import { findDuplicateCandidates } from '@/app/(dashboard)/companies/duplicate-actions'
import { DuplicateModal } from './DuplicateModal'
import type { Company, ProfileOption } from '@/lib/companies'
import type { DuplicateCandidate } from '@/app/(dashboard)/companies/duplicate-actions'

interface CompanyFormProps {
  profiles: ProfileOption[]
  defaultValues?: Partial<Company>
  companyId?: string
  onCancel?: () => void
}

function toDate(v: string | null | undefined) {
  if (!v) return ''
  return v.slice(0, 10)
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export function CompanyForm({ profiles, defaultValues: d = {}, companyId, onCancel }: CompanyFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const pendingFd = useRef<FormData | null>(null)

  function handleCancel() {
    onCancel ? onCancel() : router.push('/companies')
  }

  async function submitCreate(fd: FormData) {
    const result = await createCompany(fd)
    if (result?.error) setError(result.error)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    // 수정 모드는 중복 체크 불필요
    if (companyId) {
      startTransition(async () => {
        const result = await updateCompany(companyId, fd)
        if (result?.error) setError(result.error)
      })
      return
    }

    // 신규 등록: 중복 체크 먼저
    pendingFd.current = fd
    startTransition(async () => {
      const candidates = await findDuplicateCandidates({
        company_name:    fd.get('company_name') as string,
        phone:           fd.get('phone') as string,
        naver_place_url: fd.get('naver_place_url') as string,
        instagram_url:   fd.get('instagram_url') as string,
        website_url:     fd.get('website_url') as string,
      })

      if (candidates.length > 0) {
        setDuplicates(candidates)
      } else {
        await submitCreate(fd)
      }
    })
  }

  function handleConfirmAnyway() {
    if (!pendingFd.current) return
    const fd = pendingFd.current
    setDuplicates([])
    startTransition(() => submitCreate(fd))
  }

  function handleCancelModal() {
    setDuplicates([])
    pendingFd.current = null
  }

  return (
    <>
      {duplicates.length > 0 && (
        <DuplicateModal
          candidates={duplicates}
          onConfirm={handleConfirmAnyway}
          onCancel={handleCancelModal}
          isPending={isPending}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* 기본 정보 */}
        <Card title="기본 정보">
          <div className="col-span-2">
            <Field label="상호명" required>
              <input name="company_name" type="text" required defaultValue={d.company_name ?? ''}
                className={inputCls} placeholder="(주)티엔샤" />
            </Field>
          </div>
          <Field label="구분">
            <select name="category" defaultValue={d.category ?? ''} className={inputCls}>
              <option value="">선택</option>
              {COMPANY_CATEGORY.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="지역">
            <input name="region" type="text" defaultValue={d.region ?? ''} className={inputCls} placeholder="서울 강남구" />
          </Field>
          <Field label="DB 경로">
            <select name="source" defaultValue={d.source ?? ''} className={inputCls}>
              <option value="">선택</option>
              {COMPANY_SOURCE.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="담당자">
            <select name="assigned_to" defaultValue={d.assigned_to ?? ''} className={inputCls}>
              <option value="">선택</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </Card>

        {/* 연락처 정보 */}
        <Card title="연락처 정보">
          <Field label="담당자명">
            <input name="contact_name" type="text" defaultValue={d.contact_name ?? ''} className={inputCls} placeholder="홍길동" />
          </Field>
          <Field label="연락처">
            <input name="phone" type="tel" defaultValue={d.phone ?? ''} className={inputCls} placeholder="010-0000-0000" />
          </Field>
          <Field label="이메일">
            <input name="email" type="email" defaultValue={d.email ?? ''} className={inputCls} placeholder="contact@company.com" />
          </Field>
          <Field label="카카오 ID">
            <input name="kakao_id" type="text" defaultValue={d.kakao_id ?? ''} className={inputCls} />
          </Field>
          <Field label="인스타그램 URL">
            <input name="instagram_url" type="url" defaultValue={d.instagram_url ?? ''} className={inputCls} placeholder="https://instagram.com/..." />
          </Field>
          <Field label="네이버 플레이스 URL">
            <input name="naver_place_url" type="url" defaultValue={d.naver_place_url ?? ''} className={inputCls} placeholder="https://place.naver.com/..." />
          </Field>
          <div className="col-span-2">
            <Field label="홈페이지 URL">
              <input name="website_url" type="url" defaultValue={d.website_url ?? ''} className={inputCls} placeholder="https://..." />
            </Field>
          </div>
        </Card>

        {/* 영업 현황 */}
        <Card title="영업 현황">
          <Field label="현재 상태">
            <select name="status" defaultValue={d.status ?? '미연락'} className={inputCls}>
              {COMPANY_STATUS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="관심도">
            <select name="interest_level" defaultValue={d.interest_level?.toString() ?? ''} className={inputCls}>
              <option value="">선택</option>
              {[1,2,3,4,5].map(n => (
                <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5-n)} ({n})</option>
              ))}
            </select>
          </Field>
          <Field label="예상 계약금액 (원)">
            <input name="expected_amount" type="number" min="0" step="10000"
              defaultValue={d.expected_amount?.toString() ?? ''} className={inputCls} placeholder="0" />
          </Field>
          <Field label="미팅 예정일">
            <input name="meeting_at" type="date" defaultValue={toDate(d.meeting_at)} className={inputCls} />
          </Field>
          <Field label="다음 액션일">
            <input name="next_action_at" type="date" defaultValue={toDate(d.next_action_at)} className={inputCls} />
          </Field>
        </Card>

        {/* 최근 특이사항 */}
        <Card title="최근 특이사항">
          <div className="col-span-2">
            <textarea name="latest_note" rows={4} defaultValue={d.latest_note ?? ''}
              className={`${inputCls} resize-none`}
              placeholder="최근 통화 내용, 특이사항 등을 입력하세요"
            />
          </div>
        </Card>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-md">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isPending}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isPending ? (companyId ? '저장 중...' : '확인 중...') : companyId ? '수정 완료' : '등록'}
          </button>
          <button type="button" onClick={handleCancel} disabled={isPending}
            className="px-6 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
            취소
          </button>
        </div>
      </form>
    </>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
