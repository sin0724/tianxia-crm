import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSlackNotification, type SlackPayload, type SlackSectionBlock } from '@/lib/slack'

// ── Admin client ───────────────────────────────────────────────

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

type Supabase = ReturnType<typeof createAdminClient>

// ── 타입 ───────────────────────────────────────────────────────

type PersonalCompany = {
  id: string
  company_name: string
  status: string
  next_action_at: string | null
  meeting_at: string | null
  latest_note: string | null
  profiles: {
    id: string
    name: string
    slack_user_id: string | null
  } | null
}

type NotifType = 'action_day' | 'meeting_soon' | 'proposal_pending'

// ── 헬퍼 ───────────────────────────────────────────────────────

const SELECT = 'id, company_name, status, next_action_at, meeting_at, latest_note, profiles(id, name, slack_user_id)'
const EXCLUDED = ['계약 완료', '실패', '제외']

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function cast(data: unknown): PersonalCompany[] {
  return (data as unknown as PersonalCompany[]) ?? []
}

function mention(profiles: PersonalCompany['profiles']): string {
  if (profiles?.slack_user_id) return `<@${profiles.slack_user_id}>`
  return profiles?.name ?? '담당자'
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── 쿼리 ───────────────────────────────────────────────────────

async function getTodayActions(supabase: Supabase): Promise<PersonalCompany[]> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date();   end.setHours(23, 59, 59, 999)

  let q = supabase.from('companies').select(SELECT)
    .gte('next_action_at', start.toISOString())
    .lte('next_action_at', end.toISOString())
    .not('assigned_to', 'is', null)
  for (const s of EXCLUDED) q = q.neq('status', s)
  const { data } = await q.order('next_action_at')
  return cast(data)
}

async function getMeetingSoon(supabase: Supabase): Promise<PersonalCompany[]> {
  const now   = new Date()
  const in60  = new Date(now.getTime() + 60 * 60 * 1000)

  const { data } = await supabase.from('companies').select(SELECT)
    .gte('meeting_at', now.toISOString())
    .lte('meeting_at', in60.toISOString())
    .not('assigned_to', 'is', null)
    .order('meeting_at')
  return cast(data)
}

async function getProposalPending(supabase: Supabase): Promise<PersonalCompany[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 3)
  cutoff.setHours(23, 59, 59, 999)

  const { data } = await supabase.from('companies').select(SELECT)
    .eq('status', '제안서 발송')
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${cutoff.toISOString()}`)
    .not('assigned_to', 'is', null)
  return cast(data)
}

// ── Slack 메시지 빌더 ──────────────────────────────────────────

function block(text: string): SlackSectionBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } }
}

function buildActionDayPayload(c: PersonalCompany): SlackPayload {
  const m   = mention(c.profiles)
  const url = `${appUrl()}/companies/${c.id}`
  return {
    text: `${m} 오늘 재연락해야 할 고객입니다.`,
    blocks: [block([
      `${m} 오늘 재연락해야 할 고객입니다.`,
      `*상호명:* ${c.company_name}`,
      `*상태:* ${c.status}`,
      `*최근 메모:* ${c.latest_note ?? '—'}`,
      `*CRM 링크:* <${url}|바로가기>`,
    ].join('\n'))],
  }
}

function buildMeetingSoonPayload(c: PersonalCompany): SlackPayload {
  const m   = mention(c.profiles)
  const url = `${appUrl()}/companies/${c.id}`
  return {
    text: `${m} 1시간 뒤 미팅 예정입니다.`,
    blocks: [block([
      `${m} 1시간 뒤 미팅 예정입니다.`,
      `*상호명:* ${c.company_name}`,
      `*미팅일:* ${fmtDateTime(c.meeting_at)}`,
      `*최근 메모:* ${c.latest_note ?? '—'}`,
      `*CRM 링크:* <${url}|바로가기>`,
    ].join('\n'))],
  }
}

function buildProposalPendingPayload(c: PersonalCompany): SlackPayload {
  const m   = mention(c.profiles)
  const url = `${appUrl()}/companies/${c.id}`
  return {
    text: `${m} 제안서 발송 후 3일 이상 답변이 없습니다.`,
    blocks: [block([
      `${m} 제안서 발송 후 3일 이상 답변이 없습니다.`,
      `*상호명:* ${c.company_name}`,
      `*최근 메모:* ${c.latest_note ?? '—'}`,
      `*CRM 링크:* <${url}|바로가기>`,
    ].join('\n'))],
  }
}

// ── 전송 + 로그 ────────────────────────────────────────────────

async function sendAndLog(
  supabase: Supabase,
  company: PersonalCompany,
  notifType: NotifType,
  payload: SlackPayload,
  summary: string,
): Promise<boolean> {
  const result = await sendSlackNotification(payload)
  await supabase.from('notification_logs').insert({
    notification_type: notifType,
    company_id:        company.id,
    user_id:           company.profiles?.id ?? null,
    message:           summary,
    status:            result.ok ? 'sent' : 'failed',
    error_message:     result.ok ? null : result.error,
    sent_at:           result.ok ? new Date().toISOString() : null,
  })
  return result.ok
}

// ── Route Handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const [todayActions, meetingSoon, proposalPending] = await Promise.all([
      getTodayActions(supabase),
      getMeetingSoon(supabase),
      getProposalPending(supabase),
    ])

    const results = { sent: 0, failed: 0 }

    for (const c of todayActions) {
      const ok = await sendAndLog(
        supabase, c, 'action_day',
        buildActionDayPayload(c),
        `[오늘 액션] ${c.company_name} → ${c.profiles?.name ?? '—'}`,
      )
      ok ? results.sent++ : results.failed++
    }

    for (const c of meetingSoon) {
      const ok = await sendAndLog(
        supabase, c, 'meeting_soon',
        buildMeetingSoonPayload(c),
        `[미팅 1시간 전] ${c.company_name} → ${c.profiles?.name ?? '—'}`,
      )
      ok ? results.sent++ : results.failed++
    }

    for (const c of proposalPending) {
      const ok = await sendAndLog(
        supabase, c, 'proposal_pending',
        buildProposalPendingPayload(c),
        `[제안서 미답변] ${c.company_name} → ${c.profiles?.name ?? '—'}`,
      )
      ok ? results.sent++ : results.failed++
    }

    return NextResponse.json({
      success: true,
      summary: {
        todayActions:    todayActions.length,
        meetingSoon:     meetingSoon.length,
        proposalPending: proposalPending.length,
        sent:            results.sent,
        failed:          results.failed,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
