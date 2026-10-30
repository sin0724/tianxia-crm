import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { FINANCE_ALIAS_ACTIVITY, normalizeAssigneeCompanyName } from '@/lib/finance-alias'

// POST /api/integrations/project-assignee
// Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
// Body: { client_name: string, company_id?: string }
//
// 재무 고객명을 기존 CRM 거래처의 별칭으로 저장한다.
// activities.activity_type = finance_alias, memo = 정규화된 고객명.
// 같은 이름의 최신 별칭이 이미 그 거래처면 다시 쓰지 않는다.
// GET 은 없다. 미매칭 고객 목록은 재무 피드에만 있다.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CompanyHit = {
  id: string
  company_name: string
  latest_note: string | null
  last_contacted_at: string | null
  assignee_name: string | null
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

async function matchCompanyByName(supabase: SupabaseClient, normalized: string): Promise<CompanyHit[]> {
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
      if (row.company_name && normalizeAssigneeCompanyName(row.company_name) === normalized) {
        matches.push(toCompany(row))
      }
    }
    if (rows.length < 1000) break
  }
  return matches
}

async function activityAuthor(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const profiles = (data ?? []) as { id: string; role: string }[]
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

function ok(company: CompanyHit, clientName: string, normalized: string, result: 'created' | 'unchanged') {
  return NextResponse.json({
    company_id: company.id,
    client_name: clientName,
    alias: normalized,
    assignee_name: company.assignee_name,
    result,
  })
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

  const companyId = asText(body.company_id)
  if (companyId && !UUID_RE.test(companyId)) {
    return NextResponse.json({ success: false, error: 'company_id is invalid' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    let company: CompanyHit | null = null
    if (companyId) {
      company = await loadCompany(supabase, companyId)
      if (!company) {
        return NextResponse.json({ success: false, error: 'company not found' }, { status: 404 })
      }
    } else {
      const matches = await matchCompanyByName(supabase, normalized)
      if (matches.length !== 1) {
        return NextResponse.json({ success: false, error: 'company_id is required' }, { status: 400 })
      }
      company = matches[0]
    }

    if (await latestAliasCompany(supabase, normalized) === company.id) {
      return ok(company, clientName, normalized, 'unchanged')
    }

    const authorId = await activityAuthor(supabase)
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

    return ok(company, clientName, normalized, 'created')
  } catch {
    return NextResponse.json({ success: false, error: '별칭을 저장하지 못했습니다.' }, { status: 500 })
  }
}
