import { createClient } from '@/lib/supabase/server'
import { sendSlackNotification, sendSlackDM, type SlackPayload, type SlackHeaderBlock, type SlackSectionBlock } from '@/lib/slack'
import { fmtFullDateTimeKST } from '@/lib/datetime'

type NotificationType = 'new_company' | 'meeting_scheduled' | 'contract_complete' | 'data_request' | 'assignment'

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function header(text: string): SlackHeaderBlock {
  return { type: 'header', text: { type: 'plain_text', text } }
}

function section(text: string): SlackSectionBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } }
}

function fmtAmount(n: number | null) {
  if (!n) return '—'
  return n.toLocaleString('ko-KR') + '원'
}

async function saveLog(params: {
  notification_type: NotificationType
  company_id: string | null
  user_id: string
  message: string
  status: 'sent' | 'failed'
  error_message?: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('notification_logs').insert({
      notification_type: params.notification_type,
      company_id:        params.company_id,
      user_id:           params.user_id,
      message:           params.message,
      status:            params.status,
      error_message:     params.error_message ?? null,
      sent_at:           params.status === 'sent' ? new Date().toISOString() : null,
    })
  } catch {
    // log 저장 실패는 무시 — CRM 기능에 영향 없음
  }
}

async function dispatch(
  type: NotificationType,
  payload: SlackPayload,
  companyId: string | null,
  userId: string,
  summary: string,
): Promise<void> {
  const result = await sendSlackNotification(payload)
  await saveLog({
    notification_type: type,
    company_id:        companyId,
    user_id:           userId,
    message:           summary,
    status:            result.ok ? 'sent' : 'failed',
    error_message:     result.ok ? undefined : result.error,
  })
}

// ── 이벤트별 알림 함수 ───────────────────────────────────────

export async function notifyNewCompany(
  company: {
    id: string
    company_name: string
    category: string | null
    source: string | null
    status: string
    profiles: { name: string } | null
  },
  userId: string,
): Promise<void> {
  const text = [
    `*상호명:* ${company.company_name}`,
    `*구분:* ${company.category ?? '—'}`,
    `*DB 경로:* ${company.source ?? '—'}`,
    `*담당자:* ${company.profiles?.name ?? '—'}`,
    `*상태:* ${company.status}`,
  ].join('\n')

  const payload: SlackPayload = {
    text: `[신규 DB 등록] ${company.company_name}`,
    blocks: [header('🆕 신규 DB 등록'), section(text)],
  }

  await dispatch('new_company', payload, company.id, userId, `[신규 DB 등록] ${company.company_name}`)
}

export async function notifyMeetingScheduled(
  company: {
    id: string
    company_name: string
    meeting_at: string | null
    latest_note: string | null
    profiles: { name: string } | null
  },
  userId: string,
): Promise<void> {
  const text = [
    `*상호명:* ${company.company_name}`,
    `*담당자:* ${company.profiles?.name ?? '—'}`,
    `*미팅일:* ${fmtFullDateTimeKST(company.meeting_at)}`,
    `*최근 메모:* ${company.latest_note ?? '—'}`,
  ].join('\n')

  const payload: SlackPayload = {
    text: `[미팅 예정 등록] ${company.company_name}`,
    blocks: [header('📅 미팅 예정 등록'), section(text)],
  }

  await dispatch('meeting_scheduled', payload, company.id, userId, `[미팅 예정 등록] ${company.company_name}`)
}

export async function notifyContractComplete(
  company: {
    id: string
    company_name: string
    contract_amount: number | null
    latest_note: string | null
    profiles: { name: string } | null
  },
  userId: string,
): Promise<void> {
  const text = [
    `*상호명:* ${company.company_name}`,
    `*담당자:* ${company.profiles?.name ?? '—'}`,
    `*계약금액:* ${fmtAmount(company.contract_amount)}`,
    `*관심 상품:* ${company.latest_note ?? '—'}`,
  ].join('\n')

  const payload: SlackPayload = {
    text: `[계약 완료] ${company.company_name}`,
    blocks: [header('🎉 계약 완료'), section(text)],
  }

  await dispatch('contract_complete', payload, company.id, userId, `[계약 완료] ${company.company_name}`)
}

/** 거래처 배분 알림 — 담당자에게 DM (봇 토큰 없으면 채널 폴백) */
export async function notifyAssignment(params: {
  assignee: { id: string; name: string; slack_user_id: string | null }
  companies: { id: string; company_name: string }[]
  assignedBy: string // 배분한 사람 이름
  userId: string     // 배분 실행자 ID (로그용)
}): Promise<void> {
  const { assignee, companies } = params
  if (companies.length === 0) return

  const mention = assignee.slack_user_id ? `<@${assignee.slack_user_id}>` : `*${assignee.name}*`
  const listed = companies.slice(0, 10)
    .map(c => `• <${appUrl()}/companies/${c.id}|${c.company_name}>`)
    .join('\n')
  const more = companies.length > 10 ? `\n…외 ${companies.length - 10}건` : ''

  const text = [
    `${mention} 신규 거래처 *${companies.length}건*이 배정되었습니다. (배분: ${params.assignedBy})`,
    listed + more,
    `내일 액션일로 등록되어 *오늘 할 일*에 표시됩니다.`,
  ].join('\n\n')

  const payload: SlackPayload = {
    text: `[거래처 배분] ${assignee.name}님에게 ${companies.length}건`,
    blocks: [header('📬 거래처 배분'), section(text)],
  }

  const result = await sendSlackDM(assignee.slack_user_id, payload)
  await saveLog({
    notification_type: 'assignment',
    company_id:        companies.length === 1 ? companies[0].id : null,
    user_id:           assignee.id,
    message:           `[배분] ${assignee.name} ← ${companies.length}건 (by ${params.assignedBy})`,
    status:            result.ok ? 'sent' : 'failed',
    error_message:     result.ok ? undefined : result.error,
  })
}

// ── 앱 내(in-app) 알림 ───────────────────────────────────────
// notifications 테이블에 수신자별 알림을 남겨 대시보드 배너로 노출한다.
// Slack DM(notifyAssignment)과 보완 관계이며, 실패해도 CRM 기능엔 영향 없음.

export interface InAppNotification {
  id: string
  title: string
  body: string | null
  link: string | null
  created_at: string
}

/** 거래처 배분 시 수신자에게 앱 내 알림 1건 생성 */
export async function createAssignmentNotification(params: {
  assignee: { id: string; name: string }
  count: number
  assignedBy: string
}): Promise<void> {
  if (params.count <= 0) return
  try {
    const supabase = await createClient()
    await supabase.from('notifications').insert({
      user_id: params.assignee.id,
      type:    'assignment',
      title:   `신규 거래처 ${params.count}건 배정`,
      body:    `${params.assignedBy}님이 거래처 ${params.count}건을 배정했습니다. 내일 할 일로 등록되었습니다.`,
      link:    '/companies',
    })
  } catch {
    // 알림 저장 실패는 무시 — 배분 자체엔 영향 없음
  }
}

/** 수신자의 미열람 알림 목록 (대시보드 배너용) */
export async function getUnreadNotifications(userId: string): Promise<InAppNotification[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, created_at')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)
    return (data as InAppNotification[]) ?? []
  } catch {
    return []
  }
}

export async function notifyDataRequest(params: {
  company: { id: string; company_name: string; profiles: { name: string } | null }
  activityType: string
  memo: string | null
  userId: string
}): Promise<void> {
  const text = [
    `*상호명:* ${params.company.company_name}`,
    `*담당자:* ${params.company.profiles?.name ?? '—'}`,
    `*활동 유형:* ${params.activityType}`,
    `*메모:* ${params.memo ?? '—'}`,
  ].join('\n')

  const payload: SlackPayload = {
    text: `[자료 요청] ${params.company.company_name}`,
    blocks: [header('📋 자료 요청'), section(text)],
  }

  await dispatch('data_request', payload, params.company.id, params.userId, `[자료 요청] ${params.company.company_name}`)
}
