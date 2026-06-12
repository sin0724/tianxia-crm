'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAuth, isAdminOrManager } from '@/lib/auth'
import { kstDateString } from '@/lib/datetime'
import { COMPANY_STATUS } from '@/lib/constants'
import {
  notifyNewCompany,
  notifyMeetingScheduled,
  notifyContractComplete,
  notifyAssignment,
} from '@/lib/notifications'

interface ActionResult {
  error: string
}

const NOTIF_SELECT = 'id, company_name, category, source, status, meeting_at, latest_note, contract_amount, profiles(name)' as const

// datetime-local("YYYY-MM-DDTHH:mm") 값은 KST로 입력된 것이므로 +09:00을 명시.
// date-only("YYYY-MM-DD")는 기존 데이터와의 일관성을 위해 그대로 둠(UTC 자정 저장).
function kstDateTimeToISO(v: string | null): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return `${v}:00+09:00`
  return v
}

function extractData(fd: FormData) {
  const str = (k: string) => { const v = fd.get(k); return v && v !== '' ? (v as string) : null }
  const num = (k: string) => { const v = fd.get(k); return v && v !== '' ? Number(v) : null }

  return {
    company_name:    str('company_name')!,
    category:        str('category'),
    region:          str('region'),
    source:          str('source'),
    contact_name:    str('contact_name'),
    phone:           str('phone'),
    email:           str('email'),
    kakao_id:        str('kakao_id'),
    instagram_url:   str('instagram_url'),
    naver_place_url: str('naver_place_url'),
    website_url:     str('website_url'),
    assigned_to:     str('assigned_to'),
    status:          str('status') ?? '미연락',
    inflow_date:     str('inflow_date'),
    interest_level:  num('interest_level'),
    expected_amount: num('expected_amount'),
    contract_amount: num('contract_amount'),
    lost_reason:     str('lost_reason'),
    meeting_at:        kstDateTimeToISO(str('meeting_at')),
    last_contacted_at: str('last_contacted_at'),
    next_action_at:    str('next_action_at'),
    latest_note:       str('latest_note'),
  }
}

// date input은 날짜만 받으므로, 날짜가 바뀌지 않았다면 기존 타임스탬프(시각 포함)를
// 유지해 활동 로그 트리거가 기록한 정확한 시각이 잘려나가지 않게 한다.
function preserveTimeIfSameDate(formVal: string | null, prevVal: string | null): string | null {
  if (!formVal || !prevVal) return formVal
  return formVal === kstDateString(new Date(prevVal)) ? prevVal : formVal
}

type NotifCompany = {
  id: string
  company_name: string
  category: string | null
  source: string | null
  status: string
  meeting_at: string | null
  latest_note: string | null
  contract_amount: number | null
  profiles: { name: string } | null
}

export async function createCompany(formData: FormData): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const data = extractData(formData)
  if (!data.company_name) return { error: '상호명은 필수입니다.' }

  // sales 유저가 담당자를 지정하지 않으면 본인으로 자동 배정
  const assigned_to = data.assigned_to ?? (profile.role === 'sales' ? profile.id : null)

  // INSERT 후 SELECT RLS 충돌 방지: UUID를 미리 생성해 select() 없이 삽입
  const id = randomUUID()
  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .insert({ id, ...data, assigned_to, inflow_date: data.inflow_date ?? kstDateString() })

  if (error) return { error: error.message }

  // 알림: 신규 등록
  const { data: co } = await supabase
    .from('companies')
    .select(NOTIF_SELECT)
    .eq('id', id)
    .single()

  if (co) {
    await notifyNewCompany(co as unknown as NotifCompany, profile.id).catch(() => {})
  }

  revalidatePath('/companies')
  redirect('/companies')
}

export async function updateCompany(id: string, formData: FormData): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const data = extractData(formData)
  if (!data.company_name) return { error: '상호명은 필수입니다.' }

  const supabase = await createClient()

  // 변경 감지용 기존 데이터 조회
  const { data: prev } = await supabase
    .from('companies')
    .select('status, meeting_at, last_contacted_at, next_action_at, inflow_date')
    .eq('id', id)
    .single()

  if (prev) {
    data.last_contacted_at = preserveTimeIfSameDate(data.last_contacted_at, prev.last_contacted_at)
    data.next_action_at    = preserveTimeIfSameDate(data.next_action_at,    prev.next_action_at)
    // 유입일을 비워서 저장해도 기존 값이 지워지지 않게 보존
    data.inflow_date       = data.inflow_date ?? prev.inflow_date
  }

  const { error } = await supabase.from('companies').update(data).eq('id', id)
  if (error) return { error: error.message }

  // 알림 조건 판별 후 발송
  if (prev) {
    const oldStatus = prev.status as string
    const oldMeetingMs = prev.meeting_at ? new Date(prev.meeting_at).getTime() : null
    const newMeetingMs = data.meeting_at ? new Date(data.meeting_at).getTime() : null

    const meetingChanged = newMeetingMs !== null && newMeetingMs !== oldMeetingMs
    const contractJustDone = oldStatus !== '계약 완료' && data.status === '계약 완료'

    if (meetingChanged || contractJustDone) {
      const { data: co } = await supabase
        .from('companies')
        .select(NOTIF_SELECT)
        .eq('id', id)
        .single()

      if (co) {
        const company = co as unknown as NotifCompany
        if (meetingChanged) {
          await notifyMeetingScheduled(company, profile.id).catch(() => {})
        }
        if (contractJustDone) {
          await notifyContractComplete(company, profile.id).catch(() => {})
        }
      }
    }
  }

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}`)
}

export async function deleteCompany(id: string): Promise<ActionResult | undefined> {
  await requireAuth()
  const supabase = await createClient()

  // RLS로 0행이 지워져도 에러가 없으므로 실제 삭제된 행을 확인한다
  const { data: deleted, error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!deleted || deleted.length === 0) {
    return { error: '삭제되지 않았습니다. 거래처 삭제는 관리자만 가능합니다.' }
  }

  revalidatePath('/companies')
  redirect('/companies')
}

export async function deleteCompanies(ids: string[]): Promise<ActionResult | undefined> {
  await requireAuth()
  if (ids.length === 0) return
  const supabase = await createClient()

  const { data: deleted, error } = await supabase
    .from('companies')
    .delete()
    .in('id', ids)
    .select('id')
  if (error) return { error: error.message }

  const count = deleted?.length ?? 0
  revalidatePath('/companies')
  if (count === 0) {
    return { error: '삭제되지 않았습니다. 거래처 삭제는 관리자만 가능합니다.' }
  }
  if (count < ids.length) {
    return { error: `${ids.length}개 중 ${count}개만 삭제되었습니다. (권한 없는 항목 제외)` }
  }
}

/**
 * 거래처 일괄 배분 (admin/manager 전용).
 * assigneeId가 'auto'면 활성 영업사원에게 라운드로빈으로 균등 배분.
 * 배분 시 next_action_at이 비어 있으면 내일로 설정해 담당자의 할 일에 바로 노출되고,
 * 담당자에게 Slack DM(봇 토큰 없으면 채널)으로 알림을 보낸다.
 */
export async function assignCompanies(
  ids: string[],
  assigneeId: string | 'auto',
): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  if (!isAdminOrManager(profile.role)) {
    return { error: '거래처 배분은 관리자/매니저만 가능합니다.' }
  }
  if (ids.length === 0) return

  const supabase = await createClient()

  // 배분 대상 담당자 목록 결정
  let assignees: { id: string; name: string; slack_user_id: string | null }[]
  if (assigneeId === 'auto') {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, slack_user_id')
      .eq('role', 'sales')
      .eq('is_active', true)
      .order('name')
    assignees = data ?? []
    if (assignees.length === 0) return { error: '배분할 활성 영업사원이 없습니다.' }
  } else {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, slack_user_id')
      .eq('id', assigneeId)
      .eq('is_active', true)
      .single()
    if (!data) return { error: '담당자를 찾을 수 없습니다.' }
    assignees = [data]
  }

  // 라운드로빈 분배
  const byAssignee = new Map<string, string[]>(assignees.map(a => [a.id, []]))
  ids.forEach((id, i) => {
    byAssignee.get(assignees[i % assignees.length].id)!.push(id)
  })

  // 내일 (KST) — 배분받은 담당자의 할 일에 바로 표시되도록
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextActionDate = kstDateString(tomorrow)

  let assignedTotal = 0
  for (const assignee of assignees) {
    const companyIds = byAssignee.get(assignee.id)!
    if (companyIds.length === 0) continue

    const { data: updated, error } = await supabase
      .from('companies')
      .update({ assigned_to: assignee.id })
      .in('id', companyIds)
      .select('id, company_name')
    if (error) return { error: error.message }

    const assigned = updated ?? []
    assignedTotal += assigned.length
    if (assigned.length === 0) continue

    // 다음 액션일이 비어 있는 건만 내일로 설정 (기존 일정은 보존)
    await supabase
      .from('companies')
      .update({ next_action_at: nextActionDate })
      .in('id', assigned.map(c => c.id))
      .is('next_action_at', null)

    await notifyAssignment({
      assignee,
      companies: assigned,
      assignedBy: profile.name,
      userId: profile.id,
    }).catch(() => {})
  }

  revalidatePath('/companies')
  revalidatePath('/tasks')
  revalidatePath('/dashboard')

  if (assignedTotal === 0) return { error: '배분된 거래처가 없습니다.' }
  if (assignedTotal < ids.length) {
    return { error: `${ids.length}건 중 ${assignedTotal}건만 배분되었습니다.` }
  }
}

/**
 * 선택한 거래처 일괄 수정 (상태/구분/DB경로).
 * 비어 있는 필드는 변경하지 않는다. RLS가 적용되므로 sales는 본인 담당 건만 수정된다.
 */
export async function bulkUpdateCompanies(
  ids: string[],
  changes: { status?: string; category?: string; source?: string; inflow_month?: string },
): Promise<ActionResult | undefined> {
  await requireAuth()
  if (ids.length === 0) return

  const update: Record<string, string> = {}
  if (changes.status) {
    if (!(COMPANY_STATUS as readonly string[]).includes(changes.status)) {
      return { error: '유효하지 않은 상태입니다.' }
    }
    update.status = changes.status
  }
  if (changes.category?.trim()) update.category = changes.category.trim()
  if (changes.source?.trim())   update.source = changes.source.trim()
  if (changes.inflow_month) {
    if (!/^\d{4}-\d{2}$/.test(changes.inflow_month)) {
      return { error: '유입월 형식이 올바르지 않습니다. (예: 2026-06)' }
    }
    update.inflow_date = `${changes.inflow_month}-01`
  }
  if (Object.keys(update).length === 0) return { error: '변경할 항목을 선택해주세요.' }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('companies')
    .update(update)
    .in('id', ids)
    .select('id')
  if (error) return { error: error.message }

  const count = updated?.length ?? 0
  revalidatePath('/companies')
  revalidatePath('/companies/board')
  revalidatePath('/dashboard')
  revalidatePath('/tasks')

  if (count === 0) return { error: '수정된 거래처가 없습니다. (권한 확인 필요)' }
  if (count < ids.length) {
    return { error: `${ids.length}건 중 ${count}건만 수정되었습니다. (권한 없는 항목 제외)` }
  }
}

// 칸반 보드: 상태만 변경
export async function updateCompanyStatus(id: string, status: string): Promise<ActionResult | undefined> {
  await requireAuth()
  if (!(COMPANY_STATUS as readonly string[]).includes(status)) {
    return { error: '유효하지 않은 상태입니다.' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('companies')
    .update({ status })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: '변경 권한이 없습니다.' }

  revalidatePath('/companies')
  revalidatePath('/companies/board')
  revalidatePath(`/companies/${id}`)
}
