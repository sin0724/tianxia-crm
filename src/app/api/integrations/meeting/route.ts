import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── 미팅 등록 웹훅 ─────────────────────────────────────────────
// Slack 워크플로우 / Zapier / Make 등 기존 미팅 등록 자동화에서
// HTTP 단계 하나를 추가해 CRM에도 미팅을 등록할 수 있는 엔드포인트.
//
// POST /api/integrations/meeting
// Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
// Body(JSON): {
//   company_name: string          // 상호명 (기존 거래처 매칭, 없으면 신규 생성)
//   meeting_at:   string          // "2026-06-15 14:00" (KST로 해석) 또는 ISO
//   assignee?:    string          // 담당자 이름 또는 이메일
//   memo?:        string          // 특이사항
// }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// "YYYY-MM-DD HH:mm" / "YYYY-MM-DDTHH:mm" → KST(+09:00)로 해석, 그 외 ISO는 그대로
function parseMeetingAt(s: string): string | null {
  const v = s.trim()
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/)
  if (m) return `${m[1]}T${m[2]}:00+09:00`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\(\)\[\]（）【】·•\-_.,'"]/g, '')
}

// 미팅 등록 시 자동으로 '미팅 예정'으로 올릴 수 있는 이전 단계 상태들
const PROMOTABLE_STATUSES = ['미연락', '1차 연락 완료', '부재', '답변 대기', '관심 있음']

export async function POST(request: NextRequest) {
  const secret = process.env.INTEGRATION_SECRET ?? process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { company_name?: string; meeting_at?: string; assignee?: string; memo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const companyName = body.company_name?.trim()
  if (!companyName) {
    return NextResponse.json({ success: false, error: 'company_name is required' }, { status: 400 })
  }
  const meetingAt = body.meeting_at ? parseMeetingAt(body.meeting_at) : null
  if (!meetingAt) {
    return NextResponse.json(
      { success: false, error: 'meeting_at is required (e.g. "2026-06-15 14:00")' },
      { status: 400 },
    )
  }

  try {
    const supabase = createAdminClient()

    // 담당자 매칭 (이름 또는 이메일)
    let assigneeId: string | null = null
    if (body.assignee?.trim()) {
      const key = body.assignee.trim().toLowerCase()
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('is_active', true)
      assigneeId = (profiles ?? []).find(
        p => p.name.toLowerCase() === key || p.email.toLowerCase() === key,
      )?.id ?? null
    }

    // 거래처 매칭: 정확 일치 → 정규화 유사 일치
    const { data: candidates } = await supabase
      .from('companies')
      .select('id, company_name, status, assigned_to, updated_at')
      .ilike('company_name', `%${companyName.replace(/[%_\\]/g, '\\$&')}%`)
      .order('updated_at', { ascending: false })
      .limit(20)

    const normalized = normalizeName(companyName)
    let matched = (candidates ?? []).filter(c => normalizeName(c.company_name) === normalized)
    if (matched.length === 0) {
      matched = (candidates ?? []).filter(c => {
        const n = normalizeName(c.company_name)
        return n.includes(normalized) || normalized.includes(n)
      })
    }
    // 담당자가 주어졌으면 그 담당자의 거래처 우선
    const company =
      matched.find(c => assigneeId && c.assigned_to === assigneeId) ?? matched[0] ?? null

    if (company) {
      const update: Record<string, string | null> = { meeting_at: meetingAt }
      if (assigneeId && !company.assigned_to) update.assigned_to = assigneeId
      if (PROMOTABLE_STATUSES.includes(company.status)) update.status = '미팅 예정'
      if (body.memo?.trim()) update.latest_note = body.memo.trim()

      const { error } = await supabase.from('companies').update(update).eq('id', company.id)
      if (error) throw new Error(error.message)

      return NextResponse.json({
        success: true,
        created: false,
        company_id: company.id,
        company_name: company.company_name,
        meeting_at: meetingAt,
      })
    }

    // 매칭 실패 → 신규 거래처로 생성 (미배정이면 목록에서 배분 가능)
    const { data: created, error } = await supabase
      .from('companies')
      .insert({
        company_name: companyName,
        status: '미팅 예정',
        meeting_at: meetingAt,
        assigned_to: assigneeId,
        latest_note: body.memo?.trim() || null,
      })
      .select('id, company_name')
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json({
      success: true,
      created: true,
      company_id: created.id,
      company_name: created.company_name,
      meeting_at: meetingAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
