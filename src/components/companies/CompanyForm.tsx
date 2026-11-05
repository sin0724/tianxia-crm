'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { COMPANY_STATUS, COMPANY_CATEGORY, COMPANY_SOURCE, COMPANY_TEAMS, memberLabel } from '@/lib/constants'
import { claimCompanyForMyTeam, createCompany, updateCompany } from '@/app/(dashboard)/companies/actions'
import { findDuplicateCandidates } from '@/app/(dashboard)/companies/duplicate-actions'
import { DuplicateModal } from './DuplicateModal'
import type { Company, ProfileOption } from '@/lib/companies'
import type { KpiMetric } from '@/lib/kpi'
import type { DuplicateCandidate } from '@/app/(dashboard)/companies/duplicate-actions'

interface CompanyFormProps {
  profiles: ProfileOption[]
  defaultValues?: Partial<Company>
  companyId?: string
  onCancel?: () => void
  /** DB에 존재하는 값 + 기본 목록 (자유 입력 자동완성용) */
  categoryOptions?: string[]
  sourceOptions?: string[]
  /** 미팅 KPI 항목 — 상태를 '미팅진행'으로 바꿀 때 어떤 미팅인지 함께 받는다 */
  meetingMetrics?: KpiMetric[]
  /** 신규 등록 시 소속 팀 기본값 (등록자 팀, 없으면 0팀) */
  defaultTeam?: string
  /** 수정 모드에서 소속 팀 변경 가능 여부 (관리자/매니저) — 신규 등록은 항상 선택 가능 */
  canEditTeam?: boolean
}

function toDate(v: string | null | undefined) {
  if (!v) return ''
  return v.slice(0, 10)
}

// ISO → KST 기준 "YYYY-MM-DDTHH:mm" (datetime-local defaultValue용)
function toDateTimeLocal(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 16)
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3182f6]/30 focus:border-transparent'

export function CompanyForm({
  profiles, defaultValues: d = {}, companyId, onCancel,
  categoryOptions, sourceOptions, meetingMetrics = [],
  defaultTeam, canEditTeam = false,
}: CompanyFormProps) {
  // 신규 등록은 누구나 팀을 고르고, 등록 후에는 매출 귀속 기준이라 관리자/매니저만 바꾼다
  const teamEditable = !companyId || canEditTeam
  const categories = categoryOptions ?? [...COMPANY_CATEGORY]
  const sources = sourceOptions ?? [...COMPANY_SOURCE]
  const [status, setStatus] = useState(d.status ?? '신규문의')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [pendingTeam, setPendingTeam] = useState<string | null>(null)
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
        setPendingTeam(fd.get('team') as string | null)
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

  // 기존 0팀 건을 내 팀으로 가져오고, 폼에 적은 내용은 비어 있는 칸에만 채운다
  function handleClaim(id: string) {
    const fd = pendingFd.current ?? undefined
    setDuplicates([])
    startTransition(async () => {
      const result = await claimCompanyForMyTeam(id, fd)
      if (result?.error) setError(result.error)
    })
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
          newTeam={pendingTeam}
          onConfirm={handleConfirmAnyway}
          onClaim={handleClaim}
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
            <input name="category" type="text" list="category-options"
              defaultValue={d.category ?? ''} className={inputCls}
              placeholder="병의원, 대행사, F&B 등 자유 입력" />
            <datalist id="category-options">
              {categories.map(v => <option key={v} value={v} />)}
            </datalist>
          </Field>
          <Field label="지역">
            <input name="region" type="text" defaultValue={d.region ?? ''} className={inputCls} placeholder="서울 강남구" />
          </Field>
          <Field label="DB 경로">
            <input name="source" type="text" list="source-options"
              defaultValue={d.source ?? ''} className={inputCls}
              placeholder="네이버, 스레드, 메타 등 자유 입력" />
            <datalist id="source-options">
              {sources.map(v => <option key={v} value={v} />)}
            </datalist>
          </Field>
          <Field label="담당자">
            <select name="assigned_to" defaultValue={d.assigned_to ?? ''} className={inputCls}>
              <option value="">선택</option>
              <option value="none">미배정 (배분 대기)</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{memberLabel(p.name, p.team)}</option>)}
            </select>
          </Field>
          <Field label="소속 팀 (DB 출처)">
            {teamEditable ? (
              <select
                name="team"
                defaultValue={companyId ? (d.team ?? 'none') : (defaultTeam ?? '0팀')}
                className={inputCls}
              >
                {COMPANY_TEAMS.map(t => (
                  <option key={t} value={t}>{t === '0팀' ? '0팀 (회사 DB)' : t}</option>
                ))}
                {companyId && <option value="none">미지정</option>}
              </select>
            ) : (
              <p className="px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-xl">
                {d.team ?? '미지정'}
                <span className="ml-1.5 text-xs text-gray-400">· 관리자/매니저만 변경</span>
              </p>
            )}
            <p className="mt-1 text-[11px] text-gray-400">담당자가 다른 팀이어도 유지되며, 계약 매출은 이 팀으로 집계됩니다.</p>
          </Field>
          <Field label="유입일 (DB 유입 시점)">
            <input name="inflow_date" type="date"
              defaultValue={toDate(d.inflow_date) || (companyId ? '' : new Date().toLocaleDateString('en-CA'))}
              className={inputCls} />
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
            <select
              name="status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              className={inputCls}
            >
              {COMPANY_STATUS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>

          {/* '미팅진행'으로 새로 바뀌면 미팅 활동이 자동 기록된다 — 어떤 미팅이었는지 여기서 고른다 */}
          {status === '미팅진행' && d.status !== '미팅진행' && meetingMetrics.length > 0 && (
            <Field label="미팅 종류">
              <select
                name="meeting_kpi_type"
                className={inputCls}
                defaultValue={(meetingMetrics.find(m => m.is_default) ?? meetingMetrics[0]).key}
              >
                {meetingMetrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Field>
          )}
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
          <Field label="계약 금액 (원)">
            <input name="contract_amount" type="number" min="0" step="10000"
              defaultValue={d.contract_amount?.toString() ?? ''} className={inputCls} placeholder="계약 완료 시 입력" />
          </Field>
          <Field label="실패/보류 사유">
            <input name="lost_reason" type="text" defaultValue={d.lost_reason ?? ''}
              className={inputCls} placeholder="실패·보류 시 사유 입력" />
          </Field>
          <Field label="마지막 연락일">
            <input name="last_contacted_at" type="date" defaultValue={toDate(d.last_contacted_at)} className={inputCls} />
          </Field>
          <Field label="미팅 예정 일시">
            <input name="meeting_at" type="datetime-local" defaultValue={toDateTimeLocal(d.meeting_at)} className={inputCls} />
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
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isPending}
            className="px-6 py-2 bg-[#3182f6] text-white text-sm font-medium rounded-xl hover:bg-[#1b64da] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {isPending ? (companyId ? '저장 중...' : '확인 중...') : companyId ? '수정 완료' : '등록'}
          </button>
          <button type="button" onClick={handleCancel} disabled={isPending}
            className="px-6 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
            취소
          </button>
        </div>
      </form>
    </>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500   mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
