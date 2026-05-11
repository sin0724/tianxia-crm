import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSlackNotification } from '@/lib/slack'
import type { SlackBlock } from '@/lib/slack'

// ── Admin client (RLS 우회, cron job에는 user session이 없음) ──

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── 날짜 헬퍼 ──────────────────────────────────────────────────

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function todayLabel() {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

function fmtDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// ── 쿼리 ───────────────────────────────────────────────────────

type Supabase = ReturnType<typeof createAdminClient>

type ReminderCompany = {
  id: string
  company_name: string
  status: string
  next_action_at: string | null
  meeting_at: string | null
  latest_note: string | null
  profiles: { name: string } | null
}

const SELECT = 'id, company_name, status, next_action_at, meeting_at, latest_note, profiles(name)'
const EXCLUDED = ['계약 완료', '실패', '제외']

function cast(data: unknown): ReminderCompany[] {
  return (data as unknown as ReminderCompany[]) ?? []
}

async function fetchAll(supabase: Supabase) {
  const { start: todayS, end: todayE } = todayRange()
  const overdueEnd = new Date(); overdueEnd.setHours(0, 0, 0, 0)

  // 오늘 액션 (next_action_at = 오늘)
  let todayQ = supabase.from('companies').select(SELECT)
    .gte('next_action_at', todayS).lte('next_action_at', todayE)
  for (const s of EXCLUDED) todayQ = todayQ.neq('status', s)
  const { data: todayActions } = await todayQ.order('next_action_at')

  // 연체 (next_action_at < 오늘)
  let overdueQ = supabase.from('companies').select(SELECT)
    .lt('next_action_at', overdueEnd.toISOString())
  for (const s of EXCLUDED) overdueQ = overdueQ.neq('status', s)
  const { data: overdue } = await overdueQ.order('next_action_at')

  // 오늘 미팅
  const { data: todayMeetings } = await supabase.from('companies').select(SELECT)
    .gte('meeting_at', todayS).lte('meeting_at', todayE)
    .order('meeting_at')

  // 7일 이상 미연락
  const noContactCutoff = daysAgo(7)
  let noContactQ = supabase.from('companies').select(SELECT)
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${noContactCutoff}`)
  for (const s of EXCLUDED) noContactQ = noContactQ.neq('status', s)
  const { data: longNoContact } = await noContactQ

  // 제안서 발송 후 3일+ 미답변
  const proposalCutoff = daysAgo(3)
  const { data: proposalPending } = await supabase.from('companies').select(SELECT)
    .eq('status', '제안서 발송')
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${proposalCutoff}`)

  return {
    todayActions:    cast(todayActions),
    overdue:         cast(overdue),
    todayMeetings:   cast(todayMeetings),
    longNoContact:   cast(longNoContact),
    proposalPending: cast(proposalPending),
  }
}

// ── Block Kit 빌더 ─────────────────────────────────────────────

function sec(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } }
}

function divider(): SlackBlock {
  return { type: 'divider' }
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function companyLine(c: ReminderCompany, dateLabel: string, dateStr: string): string {
  const link = `<${appUrl()}/companies/${c.id}|${c.company_name}>`
  const memo = c.latest_note
    ? `\n> ${c.latest_note.slice(0, 80)}${c.latest_note.length > 80 ? '…' : ''}`
    : ''
  return `*${link}* — ${c.profiles?.name ?? '—'} | ${c.status} | ${dateLabel}: ${dateStr}${memo}`
}

function listBlocks(
  title: string,
  items: ReminderCompany[],
  dateLabel: string,
  dateGetter: (c: ReminderCompany) => string,
): SlackBlock[] {
  if (items.length === 0) return []
  const blocks: SlackBlock[] = [
    divider(),
    sec(`*${title}* (${items.length}명)`),
  ]
  items.slice(0, 10).forEach(c => {
    blocks.push(sec(companyLine(c, dateLabel, dateGetter(c))))
  })
  return blocks
}

function buildBlocks(data: Awaited<ReturnType<typeof fetchAll>>): SlackBlock[] {
  const { todayActions, overdue, todayMeetings, longNoContact, proposalPending } = data

  const summary = [
    `• 오늘 연락해야 할 고객: *${todayActions.length}명*`,
    `• 오늘 미팅 예정: *${todayMeetings.length}명*`,
    `• 다음 액션일 지난 고객: *${overdue.length}명*`,
    `• 7일 이상 미연락 고객: *${longNoContact.length}명*`,
    `• 제안서 발송 후 3일+ 미답변: *${proposalPending.length}명*`,
  ].join('\n')

  return [
    { type: 'header', text: { type: 'plain_text', text: '📋 티엔샤 오늘의 영업 리마인드' } },
    sec(`📅 *${todayLabel()}*`),
    divider(),
    sec(`*📊 오늘의 요약*\n${summary}`),
    ...listBlocks('📞 오늘 연락해야 할 고객', todayActions, '액션일', c => fmtDate(c.next_action_at)),
    ...listBlocks('🤝 오늘 미팅 예정', todayMeetings, '미팅', c => fmtDateTime(c.meeting_at)),
    ...listBlocks('⚠️ 다음 액션일 지난 고객', overdue, '액션일', c => fmtDate(c.next_action_at)),
  ]
}

// ── Route Handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let supabase: ReturnType<typeof createAdminClient> | null = null

  try {
    supabase = createAdminClient()
    const data = await fetchAll(supabase)
    const blocks = buildBlocks(data)

    const result = await sendSlackNotification({
      text: '[티엔샤 오늘의 영업 리마인드]',
      blocks,
    })

    const summary =
      `[일일 리마인드] 오늘 액션 ${data.todayActions.length}건 · 미팅 ${data.todayMeetings.length}건 · 연체 ${data.overdue.length}건 · 미연락 ${data.longNoContact.length}건 · 제안 미답변 ${data.proposalPending.length}건`

    await supabase.from('notification_logs').insert({
      notification_type: 'daily_reminder',
      company_id:        null,
      user_id:           null,
      message:           summary,
      status:            result.ok ? 'sent' : 'failed',
      error_message:     result.ok ? null : result.error,
      sent_at:           result.ok ? new Date().toISOString() : null,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    // 가능하면 실패 로그 저장
    if (supabase) {
      try {
        await supabase.from('notification_logs').insert({
          notification_type: 'daily_reminder',
          company_id:        null,
          user_id:           null,
          message:           '[일일 리마인드] 실행 중 오류 발생',
          status:            'failed',
          error_message:     message,
          sent_at:           null,
        })
      } catch { /* log 저장 실패는 무시 */ }
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
