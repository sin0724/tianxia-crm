import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  duplicateCompanyGroups,
  FINANCE_ALIAS_ACTIVITY,
  FINANCE_ASSIGNEE_OVERRIDE_TYPE,
  normalizeAssigneeCompanyName,
  sharedAssigneeName,
  type DuplicateCompanyRef,
} from '@/lib/finance-alias'

// POST /api/integrations/project-assignee
// Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
// Body: { client_name: string, company_id?: string, assignee?: string }
//
// assignee 가 있으면 거래처 없이 그 담당자로 직접 연결한다.
// notification_logs.notification_type = finance_assignee_override,
// message = 정규화된 고객명, user_id = 프로필 id.
// 없으면 activities.activity_type = finance_alias, memo = 정규화된 고객명.
// 이름이 여러 거래처와 같고 담당자가 모두 같으면 그 중 id 가 앞선 거래처에 별칭을 남긴다.
// GET 은 정규화 이름이 겹치는 거래처 묶음만 돌려준다.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CompanyHit = {
  id: string
  company_name: string
  latest_note: string | null
  last_contacted_at: string | null
  assignee_name: string | null
}

type StaffProfile = {
  id: string
  name: string
  role: string
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
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

function profileName(profiles: unknown): string | null {
  const row = Array.isArray(profiles) ? profiles[0] : profiles
  if (!row || typeof row !== 'object' || !('name' in row)) return null
  const name = (row as { name: unknown }).name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function toCompany(row: {
  id: string
  company_name: string
  latest_note: string | null
  last_contacted_at: string | null
  profiles: unknown
}): CompanyHit {
  return {
    id: row.id,
    company_name: row.company_name,
    latest_note: row.latest_note,
    last_contacted_at: row.last_contacted_at,
    assignee_name: profileName(row.profiles),
  }
}

async function loadCompanies(supabase: SupabaseClient): Promise<CompanyHit[]> {
  const matches: CompanyHit[] = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, company_name, latest_note, last_contacted_at, profiles(name)')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      id: string
      company_name: string
      latest_note: string | null
      last_contacted_at: string | null
      profiles: unknown
    }[]
    for (const row of rows) {
      if (row.id && row.company_name) matches.push(toCompany(row))
    }
    if (rows.length < 1000) break
  }
  return matches
}

async function loadCompany(supabase: SupabaseClient, companyId: string): Promise<CompanyHit | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, company_name, latest_note, last_contacted_at, profiles(name)')
    .eq('id', companyId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.id || !data.company_name) return null
  return toCompany(data as {
    id: string
    company_name: string
    latest_note: string | null
    last_contacted_at: string | null
    profiles: unknown
  })
}

async function loadActiveProfiles(supabase: SupabaseClient): Promise<StaffProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; name: unknown; role: string }[])
    .filter(profile => profile.id)
    .map(profile => ({
      id: profile.id,
      name: typeof profile.name === 'string' ? profile.name.trim() : '',
      role: profile.role,
    }))
}

function activityAuthor(profiles: StaffProfile[]): string | null {
  return profiles.find(profile => profile.role === 'admin')?.id
    ?? profiles.find(profile => profile.role === 'manager')?.id
    ?? profiles[0]?.id
    ?? null
}

async function latestAliasCompany(supabase: SupabaseClient, normalized: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('activities')
    .select('company_id, created_at')
    .eq('activity_type', FINANCE_ALIAS_ACTIVITY)
    .eq('memo', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as { company_id: string | null } | undefined
  return row?.company_id ?? null
}

async function latestOverrideUser(supabase: SupabaseClient, normalized: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('user_id, created_at')
    .eq('notification_type', FINANCE_ASSIGNEE_OVERRIDE_TYPE)
    .eq('message', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as { user_id: string | null } | undefined
  return row?.user_id ?? null
}

function aliasResponse(company: CompanyHit, clientName: string, normalized: string, result: 'created' | 'unchanged') {
  return NextResponse.json({
    company_id: company.id,
    client_name: clientName,
    alias: normalized,
    assignee_name: company.assignee_name,
    result,
  })
}

function overrideResponse(staff: StaffProfile, clientName: string, normalized: string, result: 'created' | 'unchanged') {
  return NextResponse.json({
    company_id: null,
    client_name: clientName,
    alias: normalized,
    assignee_name: staff.name,
    result,
  })
}

async function storeCompanyAlias(
  supabase: SupabaseClient,
  company: CompanyHit,
  clientName: string,
  normalized: string,
  profiles: StaffProfile[],
) {
  if (await latestAliasCompany(supabase, normalized) === company.id) {
    return aliasResponse(company, clientName, normalized, 'unchanged')
  }

  const authorId = activityAuthor(profiles)
  if (!authorId) {
    return NextResponse.json({ success: false, error: 'no active profile to store the alias' }, { status: 500 })
  }

  const { error: insertError } = await supabase.from('activities').insert({
    company_id: company.id,
    user_id: authorId,
    activity_type: FINANCE_ALIAS_ACTIVITY,
    activity_result: null,
    memo: normalized,
    next_action_at: null,
  })
  if (insertError) throw new Error(insertError.message)

  // 활동 트리거가 latest_note 와 last_contacted_at 을 덮어쓰므로 되돌린다.
  const { error: restoreError } = await supabase
    .from('companies')
    .update({
      latest_note: company.latest_note,
      last_contacted_at: company.last_contacted_at,
    })
    .eq('id', company.id)
  if (restoreError) throw new Error(restoreError.message)

  return aliasResponse(company, clientName, normalized, 'created')
}

async function storeAssigneeOverride(
  supabase: SupabaseClient,
  staff: StaffProfile,
  clientName: string,
  normalized: string,
) {
  if (await latestOverrideUser(supabase, normalized) === staff.id) {
    return overrideResponse(staff, clientName, normalized, 'unchanged')
  }

  const { error } = await supabase.from('notification_logs').insert({
    notification_type: FINANCE_ASSIGNEE_OVERRIDE_TYPE,
    company_id: null,
    user_id: staff.id,
    message: normalized,
    status: 'sent',
  })
  if (error) throw new Error(error.message)
  return overrideResponse(staff, clientName, normalized, 'created')
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const companies = await loadCompanies(supabase)
    const duplicates = duplicateCompanyGroups(companies.map((company): DuplicateCompanyRef => ({
      id: company.id,
      company_name: company.company_name,
      assignee_name: company.assignee_name,
    })))
    return NextResponse.json({ duplicates })
  } catch {
    return NextResponse.json({ success: false, error: '중복 거래처를 불러오지 못했습니다.' }, { status: 500 })
  }
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
  const clientName = asText(body.client_name)?.slice(0, 200) ?? null
  if (!clientName) {
    return NextResponse.json({ success: false, error: 'client_name is required' }, { status: 400 })
  }
  const normalized = normalizeAssigneeCompanyName(clientName)
  if (!normalized) {
    return NextResponse.json({ success: false, error: 'client_name is required' }, { status: 400 })
  }

  const assigneeName = asText(body.assignee)?.slice(0, 100) ?? null
  const companyId = assigneeName ? null : asText(body.company_id)
  if (companyId && !UUID_RE.test(companyId)) {
    return NextResponse.json({ success: false, error: 'company_id is invalid' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const profiles = await loadActiveProfiles(supabase)

    if (assigneeName) {
      const staff = profiles.filter(profile => profile.name === assigneeName)
      if (staff.length === 0) {
        return NextResponse.json({ success: false, error: 'assignee was not found' }, { status: 400 })
      }
      if (staff.length > 1) {
        return NextResponse.json({ success: false, error: 'assignee is ambiguous' }, { status: 400 })
      }
      return storeAssigneeOverride(supabase, staff[0], clientName, normalized)
    }

    let company: CompanyHit | null = null
    if (companyId) {
      company = await loadCompany(supabase, companyId)
      if (!company) {
        return NextResponse.json({ success: false, error: 'company not found' }, { status: 404 })
      }
    } else {
      const matches = (await loadCompanies(supabase))
        .filter(row => normalizeAssigneeCompanyName(row.company_name) === normalized)
      const shared = sharedAssigneeName(matches.map(row => row.assignee_name))
      if (matches.length === 1) {
        company = matches[0]
      } else if (matches.length > 1 && shared) {
        company = [...matches].sort((a, b) => a.id.localeCompare(b.id))[0]
      } else {
        return NextResponse.json({ success: false, error: 'company_id or assignee is required' }, { status: 400 })
      }
    }

    return storeCompanyAlias(supabase, company, clientName, normalized, profiles)
  } catch {
    return NextResponse.json({ success: false, error: '별칭을 저장하지 못했습니다.' }, { status: 500 })
  }
}
