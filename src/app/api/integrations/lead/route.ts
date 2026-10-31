import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { COMPANY_CATEGORY, COMPANY_SOURCE } from '@/lib/constants'
import { kstDateString } from '@/lib/datetime'
import { sendSlackNotification } from '@/lib/slack'

// ── 슬랙 리드 등록 웹훅 ────────────────────────────────────────
// Slack /리드 가 올린 신규 문의를 거래처관리의 신규등록과 같은 companies 행으로 넣는다.
// 별도 리드 테이블은 없다. 담당자는 작성자 프로필(assigned_to)이다.
//
// POST /api/integrations/lead
// Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
// Body(JSON): {
//   company_name:     string   // 필수. 별칭: 상호, 상호명
//   phone?:           string   // 별칭: 연락처. 숫자만 저장. 이메일이 들어 있으면 email 컬럼으로
//   contact_name?:    string   // 별칭: 업체담당자, 담당자명 (고객사 담당. 내부 담당자와 다름)
//   source?:          string   // 별칭: 퍼널. COMPANY_SOURCE, 아니면 '기타및소개'
//   special_note?:    string   // 별칭: 특이사항. 신규 거래처의 latest_note
//   category?:        string   // 별칭: 구분. COMPANY_CATEGORY, 아니면 '미분류'
//   interest_level?:  number   // 1–5, 생략 가능
//   poster_name?:     string   // 프로필 이름과 대조 (assigned_to). 공백은 무시
//   poster_email?:    string   // 프로필 이메일과 대조 (이름·슬랙 ID보다 우선)
//   poster_slack_id?: string   // 이메일·이름이 없으면 profiles.slack_user_id 와 대조
//   slack_permalink?: string
//   raw_text?:        string
//   dedupe_key?:      string   // Slack ts. 이미 처리됐으면 처음 결과를 그대로 반환
// }
//
// 성공: { id, result: 'created' | 'merged', url }
// url 은 항상 http(s) 절대 경로. 슬랙 알림이 <url|열기> 로 쓰려면 스킴이 필요하다.

const SOURCE_FALLBACK = '기타및소개'
const CATEGORY_FALLBACK = '미분류'
const MIN_PHONE_DIGITS = 8
const COMPANY_COLUMNS =
  'id, company_name, phone, email, contact_name, source, category, interest_level, latest_note, status, assigned_to, last_contacted_at, updated_at'

type LeadResult = 'created' | 'merged'

type CompanyRow = {
  id: string
  company_name: string
  phone: string | null
  email: string | null
  contact_name: string | null
  source: string | null
  category: string | null
  interest_level: number | null
  latest_note: string | null
  status: string
  assigned_to: string | null
  last_contacted_at: string | null
  updated_at: string
}

type ProfileRow = {
  id: string
  name: string
  email: string
  role: string
  slack_user_id: string | null
}

type LeadInput = {
  companyName: string
  phone: string | null
  email: string | null
  contactName: string | null
  source: { provided: boolean; value: string }
  category: { provided: boolean; value: string }
  interestLevel: number | null
  specialNote: string | null
  posterName: string | null
  posterEmail: string | null
  posterSlackId: string | null
  slackPermalink: string | null
  rawText: string | null
  dedupeKey: string | null
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function appUrl() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').trim()
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withScheme.replace(/\/$/, '')
}

function companyUrl(id: string) {
  return `${appUrl()}/companies/${id}`
}

function acceptedSecrets(): string[] {
  return [process.env.INTEGRATION_SECRET, process.env.CRON_SECRET].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false
  const token = header.slice('Bearer '.length)
  const secrets = acceptedSecrets()
  return token.length > 0 && secrets.includes(token)
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

// 영문 키를 먼저 본다. /리드 모달 라벨(상호·연락처·업체담당자·퍼널·특이사항)도 받는다.
function firstText(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const text = asText(body[key])
    if (text) return text
  }
  return null
}

function compactName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

// 전화번호 칸에 이메일이 같이 오는 슬랙 폼을 받는다.
// 이메일 로컬파트의 숫자는 전화번호로 세지 않는다.
function parsePhoneField(raw: string | null): { phone: string | null; email: string | null } {
  if (!raw) return { phone: null, email: null }
  const email = raw.match(EMAIL_RE)?.[0].toLowerCase() ?? null
  const phoneSource = email ? raw.replace(EMAIL_RE, '') : raw
  const phoneDigits = digitsOnly(phoneSource)
  return { phone: phoneDigits || null, email }
}

function pickAllowed(
  allowed: readonly string[],
  raw: string | null,
  fallback: string,
): { provided: boolean; value: string } {
  if (!raw) return { provided: false, value: fallback }
  return { provided: true, value: allowed.includes(raw) ? raw : fallback }
}

function parseInterest(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) return { ok: false }
  return { ok: true, value: numeric }
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// 같은 상호. 대소문자는 유지하고, 공백·(주)·주식회사·㈜ 만 뺀다.
function normalizeCompanyName(name: string): string {
  return name
    .replace(/주식회사/g, '')
    .replace(/\(주\)|（주）|㈜/g, '')
    .replace(/[\s()[\]（）【】·•\-_.,'"]/g, '')
}

function dedupeToken(dedupeKey: string): string {
  return `[[lead-dedupe:${encodeURIComponent(dedupeKey)}]]`
}

function readResult(memo: string | null, dedupeKey: string): LeadResult | null {
  if (!memo) return null
  const token = dedupeToken(dedupeKey)
  const at = memo.indexOf(token)
  if (at < 0) return null
  const match = memo.slice(at + token.length).match(/^ result:(created|merged)/)
  return match ? (match[1] as LeadResult) : 'merged'
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === ''
}

function buildMemo(input: LeadInput, result: LeadResult, unmatchedPoster: string | null): string | null {
  const lines: string[] = []
  if (input.specialNote) lines.push(input.specialNote)
  if (input.slackPermalink) lines.push(input.slackPermalink)
  if (unmatchedPoster) lines.push(`슬랙 작성자: ${unmatchedPoster}`)
  if (input.rawText && input.rawText !== input.specialNote) lines.push(input.rawText)
  const marker = input.dedupeKey ? `${dedupeToken(input.dedupeKey)} result:${result}` : null
  const body = lines.join('\n').trim()
  if (!body && !marker) return null
  if (!marker) return body.slice(0, 15000)
  if (!body) return marker
  const room = Math.max(0, 15000 - marker.length - 1)
  return `${body.slice(0, room)}\n${marker}`
}

function slackLabel(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '·')
    .replace(/[\r\n]+/g, ' ')
}

function matchPoster(profiles: ProfileRow[], input: LeadInput): ProfileRow | null {
  const email = input.posterEmail?.toLowerCase()
  if (email) {
    const byEmail = profiles.find(profile => profile.email.toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const name = input.posterName ? compactName(input.posterName) : ''
  if (name) {
    const byName = profiles.find(profile => compactName(profile.name) === name)
    if (byName) return byName
  }
  const slackId = input.posterSlackId
  if (slackId) {
    const bySlack = profiles.find(profile => profile.slack_user_id === slackId)
    if (bySlack) return bySlack
  }
  return null
}

// activities.user_id 는 NOT NULL 이다. 작성자 프로필이 없으면 활성 관리자에게 남긴다.
function activityAuthor(profiles: ProfileRow[], posterId: string | null): string | null {
  if (posterId) return posterId
  return (
    profiles.find(profile => profile.role === 'admin')?.id ??
    profiles.find(profile => profile.role === 'manager')?.id ??
    profiles[0]?.id ??
    null
  )
}

async function findEarlier(
  supabase: SupabaseClient,
  dedupeKey: string,
): Promise<{ id: string; result: LeadResult } | null> {
  const pattern = `%${escapeIlike(dedupeToken(dedupeKey))}%`
  const { data: activities, error: activityError } = await supabase
    .from('activities')
    .select('company_id, memo')
    .ilike('memo', pattern)
    .order('created_at', { ascending: true })
    .limit(5)
  if (activityError) throw new Error(activityError.message)

  for (const row of activities ?? []) {
    const result = readResult(row.memo, dedupeKey)
    if (result && row.company_id) return { id: row.company_id, result }
  }

  const { data: logs, error: logError } = await supabase
    .from('notification_logs')
    .select('company_id, message')
    .ilike('message', pattern)
    .order('created_at', { ascending: true })
    .limit(5)
  if (logError) throw new Error(logError.message)

  for (const row of logs ?? []) {
    const result = readResult(row.message, dedupeKey)
    if (result && row.company_id) return { id: row.company_id, result }
  }
  return null
}

async function findByPhone(supabase: SupabaseClient, digits: string): Promise<CompanyRow | null> {
  if (digits.length < MIN_PHONE_DIGITS) return null
  const last4 = digits.slice(-4)
  for (let page = 0; page < 10; page++) {
    const from = page * 200
    const { data, error } = await supabase
      .from('companies')
      .select(COMPANY_COLUMNS)
      .not('phone', 'is', null)
      .ilike('phone', `%${last4}%`)
      .order('updated_at', { ascending: false })
      .range(from, from + 199)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as CompanyRow[]
    const hit = rows.find(row => digitsOnly(row.phone) === digits)
    if (hit) return hit
    if (rows.length < 200) return null
  }
  return null
}

async function findByEmail(supabase: SupabaseClient, email: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_COLUMNS)
    .ilike('email', escapeIlike(email))
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return ((data ?? []) as CompanyRow[])[0] ?? null
}

async function findByName(supabase: SupabaseClient, companyName: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_COLUMNS)
    .eq('company_name', companyName)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  return ((data ?? []) as CompanyRow[])[0] ?? null
}

async function findByNormalizedName(supabase: SupabaseClient, companyName: string): Promise<CompanyRow | null> {
  const normalized = normalizeCompanyName(companyName)
  if (normalized.length < 2) return null
  const pattern = `%${Array.from(normalized).map(ch => escapeIlike(ch)).join('%')}%`
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_COLUMNS)
    .ilike('company_name', pattern)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as CompanyRow[]).find(row => normalizeCompanyName(row.company_name) === normalized) ?? null
}

function mergePatch(row: CompanyRow, input: LeadInput): Record<string, string | number | null> {
  const patch: Record<string, string | number | null> = {}
  if (blank(row.phone) && input.phone) patch.phone = input.phone
  if (blank(row.email) && input.email) patch.email = input.email
  if (blank(row.contact_name) && input.contactName) patch.contact_name = input.contactName
  if (blank(row.source) && input.source.provided) patch.source = input.source.value
  if (blank(row.category) && input.category.provided) patch.category = input.category.value
  if (row.interest_level == null && input.interestLevel != null) patch.interest_level = input.interestLevel
  if (blank(row.latest_note) && input.specialNote) patch.latest_note = input.specialNote
  return patch
}

async function notifyNewLead(
  supabase: SupabaseClient,
  companyId: string,
  input: LeadInput,
  assigneeName: string | null,
  userId: string | null,
) {
  const url = companyUrl(companyId)
  const text = [
    `*상호명:* <${url}|${slackLabel(input.companyName)}>`,
    `*구분:* ${input.category.value}`,
    `*DB 경로:* ${input.source.value}`,
    `*담당자:* ${assigneeName ?? '—'}`,
    `*상태:* 신규문의`,
  ].join('\n')

  const result = await sendSlackNotification({
    text: `[신규 DB 등록] ${input.companyName}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🆕 신규 DB 등록' } },
      { type: 'section', text: { type: 'mrkdwn', text } },
    ],
  })

  await supabase.from('notification_logs').insert({
    notification_type: 'new_company',
    company_id: companyId,
    user_id: userId,
    message: `[신규 DB 등록] ${input.companyName}`,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  })
}

function ok(id: string, result: LeadResult) {
  return NextResponse.json({ id, result, url: companyUrl(id) })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const body = payload as Record<string, unknown>
  const companyName = firstText(body, 'company_name', '상호', '상호명')
  if (!companyName) {
    return NextResponse.json({ success: false, error: 'company_name is required' }, { status: 400 })
  }
  const interest = parseInterest(body.interest_level)
  if (!interest.ok) {
    return NextResponse.json(
      { success: false, error: 'interest_level must be an integer from 1 to 5' },
      { status: 400 },
    )
  }

  const contact = parsePhoneField(firstText(body, 'phone', '연락처'))
  const input: LeadInput = {
    companyName,
    phone: contact.phone,
    email: contact.email,
    contactName: firstText(body, 'contact_name', '업체담당자', '담당자명'),
    source: pickAllowed(COMPANY_SOURCE, firstText(body, 'source', '퍼널'), SOURCE_FALLBACK),
    category: pickAllowed(COMPANY_CATEGORY, firstText(body, 'category', '구분'), CATEGORY_FALLBACK),
    interestLevel: interest.value,
    specialNote: firstText(body, 'special_note', '특이사항'),
    posterName: asText(body.poster_name),
    posterEmail: asText(body.poster_email),
    posterSlackId: asText(body.poster_slack_id),
    slackPermalink: asText(body.slack_permalink),
    rawText: asText(body.raw_text),
    dedupeKey: asText(body.dedupe_key),
  }

  try {
    const supabase = createAdminClient()

    if (input.dedupeKey) {
      const earlier = await findEarlier(supabase, input.dedupeKey)
      if (earlier) return ok(earlier.id, earlier.result)
    }

    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, role, slack_user_id')
      .eq('is_active', true)
    if (profileError) throw new Error(profileError.message)
    const profiles = (profileRows ?? []) as ProfileRow[]
    const poster = matchPoster(profiles, input)
    const authorId = activityAuthor(profiles, poster?.id ?? null)
    const unmatchedPoster = poster
      ? null
      : [input.posterName, input.posterEmail, input.posterSlackId].filter(Boolean).join(' · ') || null

    const matched = input.phone && input.phone.length >= MIN_PHONE_DIGITS
      ? await findByPhone(supabase, input.phone)
      : null
    const company = matched
      ?? (input.email ? await findByEmail(supabase, input.email) : null)
      ?? await findByName(supabase, input.companyName)
      ?? await findByNormalizedName(supabase, input.companyName)

    if (company) {
      const patch = mergePatch(company, input)
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('companies').update(patch).eq('id', company.id)
        if (error) throw new Error(error.message)
      }
      const intendedNote = 'latest_note' in patch
        ? (patch.latest_note as string | null)
        : company.latest_note
      await writeActivity(supabase, company.id, authorId, input, 'merged', unmatchedPoster, {
        latest_note: intendedNote,
        last_contacted_at: company.last_contacted_at,
      })
      return ok(company.id, 'merged')
    }

    const { data: created, error: insertError } = await supabase
      .from('companies')
      .insert({
        company_name: input.companyName,
        category: input.category.value,
        source: input.source.value,
        contact_name: input.contactName,
        phone: input.phone,
        email: input.email,
        assigned_to: poster?.id ?? null,
        status: '신규문의',
        inflow_date: kstDateString(),
        interest_level: input.interestLevel,
        latest_note: input.specialNote,
      })
      .select('id')
      .single()
    if (insertError || !created) throw new Error(insertError?.message ?? 'failed to create company')

    await writeActivity(supabase, created.id, authorId, input, 'created', unmatchedPoster, {
      latest_note: input.specialNote,
      last_contacted_at: null,
    })
    await notifyNewLead(supabase, created.id, input, poster?.name ?? null, poster?.id ?? null)
    return ok(created.id, 'created')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// 활동 INSERT 트리거가 latest_note / last_contacted_at 을 덮어쓴다.
// 연동 메모는 활동에만 남기고, 거래처 필드는 생성·병합 규칙으로 되돌린다.
async function writeActivity(
  supabase: SupabaseClient,
  companyId: string,
  authorId: string | null,
  input: LeadInput,
  result: LeadResult,
  unmatchedPoster: string | null,
  restore: { latest_note: string | null; last_contacted_at: string | null },
) {
  const memo = buildMemo(input, result, unmatchedPoster)
  if (authorId) {
    const { error } = await supabase.from('activities').insert({
      company_id: companyId,
      user_id: authorId,
      activity_type: '기타',
      activity_result: null,
      memo,
      next_action_at: null,
    })
    if (error) throw new Error(error.message)
  } else if (memo) {
    // 프로필이 하나도 없으면 활동 행을 만들 수 없다. 멱등 키만 로그에 남긴다.
    const { error } = await supabase.from('notification_logs').insert({
      notification_type: 'integration_lead',
      company_id: companyId,
      message: memo,
      status: 'sent',
    })
    if (error) throw new Error(error.message)
  }

  const { error: restoreError } = await supabase
    .from('companies')
    .update({
      latest_note: restore.latest_note,
      last_contacted_at: restore.last_contacted_at,
    })
    .eq('id', companyId)
  if (restoreError) throw new Error(restoreError.message)
}
