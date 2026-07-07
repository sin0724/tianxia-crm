import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSlackNotification } from '@/lib/slack'
import type { SlackBlock } from '@/lib/slack'
import { CLOSED_STATUSES } from '@/lib/constants'
import {
  kstTodayRange, kstStartOfDay, kstDaysAgoEnd, kstDateString,
  todayLabelKST, fmtDateKST, fmtDateTimeKST,
} from '@/lib/datetime'
import { parseVisitNote } from '@/lib/visit-note'

// ── Admin client (RLS 우회, cron job에는 user session이 없음) ──

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── 쿼리 ───────────────────────────────────────────────────────

type Supabase = ReturnType<typeof createAdminClient>

type ReminderCompany = {
  id: string
  company_name: string
  status: string
  next_action_at: string | null
  meeting_at: string | null
  last_contacted_at: string | null
  latest_note: string | null
  profiles: { name: string } | null
}

const SELECT = 'id, company_name, status, next_action_at, meeting_at, last_contacted_at, latest_note, profiles(name)'
const EXCLUDED = CLOSED_STATUSES

function cast(data: unknown): ReminderCompany[] {
  return (data as unknown as ReminderCompany[]) ?? []
}

async function fetchAll(supabase: Supabase) {
  const { start: todayS, end: todayE } = kstTodayRange()
  const overdueEnd = kstStartOfDay()

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
  const noContactCutoff = kstDaysAgoEnd(7)
  let noContactQ = supabase.from('companies').select(SELECT)
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${noContactCutoff}`)
  for (const s of EXCLUDED) noContactQ = noContactQ.neq('status', s)
  const { data: longNoContact } = await noContactQ

  // 제안서 발송 후 3일+ 미답변
  const proposalCutoff = kstDaysAgoEnd(3)
  const { data: proposalPending } = await supabase.from('companies').select(SELECT)
    .eq('status', '제안서발송')
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${proposalCutoff}`)

  return {
    todayActions:    cast(todayActions),
    overdue:         cast(overdue),
    todayMeetings:   cast(todayMeetings),
    longNoContact:   cast(longNoContact),
    proposalPending: cast(proposalPending),
  }
}

// ── 지난 미팅 자동 기록 ────────────────────────────────────────
// 어제(KST) 미팅이 예정돼 있던 거래처에 '미팅' 활동을 자동 기록한다.
// → 미팅 KPI(월 12건)가 meeting_at만 등록해도 자동 집계됨.
// 같은 기간에 수동으로 '미팅' 활동을 남긴 거래처는 건너뛴다 (중복 방지).
// 취소된 미팅은 meeting_at을 비우거나 날짜를 옮겨두면 기록되지 않는다.

const DAY_MS = 24 * 60 * 60 * 1000

async function autoLogCompletedMeetings(supabase: Supabase): Promise<number> {
  const todayStart = kstStartOfDay()
  const yStart = new Date(todayStart.getTime() - DAY_MS).toISOString()
  const yEnd   = new Date(todayStart.getTime() - 1).toISOString()

  const { data: met } = await supabase
    .from('companies')
    .select('id, assigned_to')
    .gte('meeting_at', yStart)
    .lte('meeting_at', yEnd)
    .not('assigned_to', 'is', null)

  const companies = met ?? []
  if (companies.length === 0) return 0

  // 최근 7일 내 '미팅' 활동이 있으면 건너뜀 — 수동 기록뿐 아니라
  // 상태를 '미팅진행'으로 바꿀 때의 자동 기록과도 중복되지 않게 한다.
  const dedupeSince = new Date(todayStart.getTime() - 7 * DAY_MS).toISOString()
  const { data: logged } = await supabase
    .from('activities')
    .select('company_id')
    .eq('activity_type', '미팅')
    .gte('created_at', dedupeSince)
    .in('company_id', companies.map(c => c.id))
  const loggedSet = new Set((logged ?? []).map(a => a.company_id))

  const inserts = companies
    .filter(c => !loggedSet.has(c.id))
    .map(c => ({
      company_id:      c.id,
      user_id:         c.assigned_to,
      activity_type:   '미팅',
      activity_result: null,
      memo:            null, // latest_note를 덮어쓰지 않도록 비워둠
      next_action_at:  null,
    }))
  if (inserts.length === 0) return 0

  const { error } = await supabase.from('activities').insert(inserts)
  return error ? 0 : inserts.length
}

// ── KOL 방문 예정 정리 ────────────────────────────────────────
// 1) 메모("7월중 방문")만 있고 날짜가 비어 있는 KOL은 해석해 시작/종료일 백필
//    → 방문 예정일 필터에 잡히게 된다.
// 2) 방문 종료일이 지난 KOL은 방문 예정(메모·날짜)을 자동 삭제한다.

async function cleanupKolVisits(supabase: Supabase): Promise<{ backfilled: number; cleared: number }> {
  const today = kstDateString()
  const { data } = await supabase
    .from('kols')
    .select('id, visit_note, visit_date, visit_end_date')
    .or('visit_note.not.is.null,visit_date.not.is.null')

  let backfilled = 0
  let cleared = 0
  for (const row of data ?? []) {
    const parsed = parseVisitNote(row.visit_note, today)
    const start = row.visit_date ?? parsed?.start ?? null
    const end = row.visit_end_date ?? parsed?.end ?? row.visit_date ?? null

    if (end && end < today) {
      // 지난 방문 — 방문 예정 필드 자동 삭제
      const { error } = await supabase
        .from('kols')
        .update({ visit_note: null, visit_date: null, visit_end_date: null })
        .eq('id', row.id)
      if (!error) cleared++
      continue
    }

    // 해석 가능한데 날짜가 비어 있으면 백필
    const nextStart = row.visit_date ?? start
    const nextEnd = row.visit_end_date ?? end
    if (nextStart !== row.visit_date || nextEnd !== row.visit_end_date) {
      const { error } = await supabase
        .from('kols')
        .update({ visit_date: nextStart, visit_end_date: nextEnd })
        .eq('id', row.id)
      if (!error) backfilled++
    }
  }
  return { backfilled, cleared }
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
    sec(`📅 *${todayLabelKST()}*`),
    divider(),
    sec(`*📊 오늘의 요약*\n${summary}`),
    ...listBlocks('📞 오늘 연락해야 할 고객', todayActions, '액션일', c => fmtDateKST(c.next_action_at)),
    ...listBlocks('🤝 오늘 미팅 예정', todayMeetings, '미팅', c => fmtDateTimeKST(c.meeting_at)),
    ...listBlocks('⚠️ 다음 액션일 지난 고객', overdue, '액션일', c => fmtDateKST(c.next_action_at)),
    ...listBlocks('🕐 7일 이상 미연락 고객', longNoContact, '마지막 연락', c => fmtDateKST(c.last_contacted_at)),
    ...listBlocks('📨 제안서 발송 후 3일+ 미답변', proposalPending, '마지막 연락', c => fmtDateKST(c.last_contacted_at)),
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

    // 어제 미팅 자동 기록 → 리마인드 집계에 반영되도록 fetchAll보다 먼저 실행
    const autoLogged = await autoLogCompletedMeetings(supabase)
    const kolVisits = await cleanupKolVisits(supabase)

    const data = await fetchAll(supabase)
    const blocks = buildBlocks(data)

    const result = await sendSlackNotification({
      text: '[티엔샤 오늘의 영업 리마인드]',
      blocks,
    })

    const summary =
      `[일일 리마인드] 오늘 액션 ${data.todayActions.length}건 · 미팅 ${data.todayMeetings.length}건 · 연체 ${data.overdue.length}건 · 미연락 ${data.longNoContact.length}건 · 제안 미답변 ${data.proposalPending.length}건 · 미팅 자동기록 ${autoLogged}건 · KOL 방문 백필 ${kolVisits.backfilled}·정리 ${kolVisits.cleared}건`

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
