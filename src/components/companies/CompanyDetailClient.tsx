'use client'

import { useState, useTransition } from 'react'
import { StatusBadge } from './StatusBadge'
import { CompanyForm } from './CompanyForm'
import { ActivityForm } from '@/components/activities/ActivityForm'
import { ActivityList } from '@/components/activities/ActivityList'
import { deleteCompany } from '@/app/(dashboard)/companies/actions'
import type { Company, ProfileOption } from '@/lib/companies'
import type { Activity } from '@/lib/activities'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtAmount(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('ko-KR') + '원'
}

function isOverdue(s: string | null) {
  return !!s && new Date(s) < new Date()
}

interface CompanyDetailClientProps {
  company: Company
  profiles: ProfileOption[]
  activities: Activity[]
}

export function CompanyDetailClient({ company, profiles, activities }: CompanyDetailClientProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  function handleDelete() {
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deleteCompany(company.id)
      if (result?.error) {
        setDeleteError(result.error)
        setConfirmDelete(false)
      }
    })
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">정보 수정</h2>
        <CompanyForm
          profiles={profiles}
          defaultValues={company}
          companyId={company.id}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{company.company_name}</h2>
          <StatusBadge status={company.status} />
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-sm text-gray-500">정말 삭제하시겠습니까?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제 확인'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                수정
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-sm font-medium border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              >
                삭제
              </button>
            </>
          )}
        </div>
      </div>

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-md">{deleteError}</p>
      )}

      {/* 기본 정보 */}
      <Card title="기본 정보">
        <Grid>
          <Row label="구분"    value={company.category} />
          <Row label="지역"    value={company.region} />
          <Row label="DB 경로" value={company.source} />
          <Row label="담당자"  value={company.profiles?.name} />
        </Grid>
      </Card>

      {/* 영업 현황 */}
      <Card title="영업 현황">
        <Grid>
          <Row label="상태" value={<StatusBadge status={company.status} />} />
          <Row label="관심도" value={
            company.interest_level
              ? '★'.repeat(company.interest_level) + '☆'.repeat(5 - company.interest_level)
              : null
          } />
          <Row label="예상 계약금액" value={fmtAmount(company.expected_amount)} />
          <Row label="계약 금액"    value={fmtAmount(company.contract_amount)} />
          <Row label="미팅 예정일"  value={fmtDate(company.meeting_at)} />
          <Row label="다음 액션일" value={
            <span className={isOverdue(company.next_action_at) ? 'text-red-600 font-semibold' : ''}>
              {fmtDate(company.next_action_at)}
            </span>
          } />
          <Row label="마지막 연락일" value={fmtDate(company.last_contacted_at)} />
          {company.lost_reason && (
            <div className="col-span-2">
              <Row label="실패 사유" value={company.lost_reason} />
            </div>
          )}
        </Grid>
      </Card>

      {/* 연락처 정보 */}
      <Card title="연락처 정보">
        <Grid>
          <Row label="담당자명"  value={company.contact_name} />
          <Row label="연락처"   value={company.phone} />
          <Row label="이메일"   value={company.email} />
          <Row label="카카오 ID" value={company.kakao_id} />
        </Grid>
        {(company.instagram_url || company.naver_place_url || company.website_url) && (
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            {company.instagram_url  && <LinkRow label="인스타그램"    url={company.instagram_url} />}
            {company.naver_place_url && <LinkRow label="네이버 플레이스" url={company.naver_place_url} />}
            {company.website_url    && <LinkRow label="홈페이지"      url={company.website_url} />}
          </div>
        )}
      </Card>

      {/* 최근 특이사항 */}
      <Card title="최근 특이사항">
        {company.latest_note
          ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.latest_note}</p>
          : <p className="text-sm text-gray-400">없음</p>
        }
      </Card>

      {/* 활동 로그 */}
      <Card title={`활동 로그 (${activities.length})`}>
        <div className="space-y-3">
          <ActivityForm companyId={company.id} />
          <ActivityList activities={activities} />
        </div>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-4">{children}</div>
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="text-sm text-gray-900">
        {value ?? <span className="text-gray-400">—</span>}
      </div>
    </div>
  )
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400 w-28 shrink-0 text-xs">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-blue-600 hover:underline truncate text-xs">
        {url}
      </a>
    </div>
  )
}
