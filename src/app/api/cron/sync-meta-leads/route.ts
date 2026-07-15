import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSlackNotification } from '@/lib/slack'

// ── 메타 리드 동기화 크론 ──────────────────────────────────────
// 메타 인스턴트 폼(리드 광고)의 신규 리드를 주기적으로 가져와
// companies에 '신규문의'로 등록하고 Slack 알림을 보낸다.
//
// POST /api/cron/sync-meta-leads
// Authorization: Bearer <CRON_SECRET>
//
// 필요 환경변수:
//   META_PAGE_ACCESS_TOKEN  leads_retrieval 권한이 있는 페이지 액세스 토큰
//   META_LEAD_FORM_IDS      (선택) 동기화할 폼 ID CSV — 기본값은 현재 운영 중인 3개 폼
//   META_LEAD_ASSIGNEE      (선택) 자동 배정 담당자 이름 또는 이메일 — 회사 DB처럼
//                           이 사람 앞으로 등록해두고 수동 배분하는 흐름을 지원한다
//
// 중복 방지: companies.meta_lead_id(unique)로 이미 등록된 리드는 건너뜀.
// 삭제된 거래처의 리드는 deleted_meta_leads(삭제 트리거가 기록)에 남아
// 재등록되지 않는다.
// 메타는 리드를 90일까지만 제공하므로 크론이 며칠 멈춰도 유실 없이 따라잡는다.

const DEFAULT_FORM_IDS = [
  '1673337870590256', // F&B 무제한 체험단
  '995635199922325',  // 뷰티 무제한 체험단
  '1415220923622365', // 티엔샤 (대만 마케팅 종합)
]

const GRAPH = 'https://graph.facebook.com/v23.0'

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

// ── 메타 응답 타입 ─────────────────────────────────────────────

interface MetaField {
  name: string
  values: string[]
}

interface MetaLead {
  id: string
  created_time: string
  ad_name?: string
  campaign_name?: string
  field_data?: MetaField[]
}

// ── 필드 매핑 ──────────────────────────────────────────────────
// 폼마다 질문 키가 달라서 후보 이름 목록으로 찾는다.

function field(lead: MetaLead, ...names: string[]): string | null {
  for (const n of names) {
    const f = lead.field_data?.find(f => f.name === n)
    const v = f?.values?.filter(Boolean).join(', ').trim()
    if (v) return v
  }
  return null
}

// '+8210…' → '010…' (CRM 표기 통일)
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  return v.startsWith('+82') ? '0' + v.slice(3).replace(/^0/, '') : v
}

function mapCategory(raw: string | null): string {
  if (!raw) return '미분류'
  const v = raw.toLowerCase()
  if (v.includes('f&b') || v.includes('음식점') || v.includes('카페') || v.includes('디저트') || v.includes('주점')) return 'F&B'
  if (v.includes('피부과') || v.includes('시술')) return '뷰티'
  if (v.includes('뷰티') || v.includes('화장품') || v.includes('스킨케어') || v.includes('메이크업') || v.includes('헤어') || v.includes('이너뷰티')) return '뷰티'
  if (v.includes('패션') || v.includes('의류')) return '커머스'
  return '미분류'
}

interface MappedLead {
  meta_lead_id: string
  company_name: string
  category: string
  region: string | null
  source: string
  contact_name: string | null
  phone: string | null
  email: string | null
  kakao_id: string | null
  status: string
  latest_note: string
}

function mapLead(lead: MetaLead): MappedLead {
  const contactName = field(lead, 'full_name', '담당자_성함')
  const companyName =
    field(lead, '업체명_또는_브랜드명을_입력해주세요.', '업체명/브랜드명', '회사/브랜드명') ??
    (contactName ? `${contactName} (메타리드)` : '메타광고 리드')

  const kakao = field(lead, '카카오톡_id_or_이메일')
  let email = field(lead, 'email')
  if (!email && kakao?.includes('@')) email = kakao

  const noteParts = [
    `[메타광고 리드] ${lead.campaign_name ?? ''} / ${lead.ad_name ?? ''}`.trim(),
    field(lead, '매장_위치를_선택해주세요.') && `위치: ${field(lead, '매장_위치를_선택해주세요.')}`,
    field(lead, '제품_카테고리를_선택해주세요.') && `제품: ${field(lead, '제품_카테고리를_선택해주세요.')}`,
    field(lead, '체험단_진행_희망_수량을_선택해주세요.') && `희망 수량: ${field(lead, '체험단_진행_희망_수량을_선택해주세요.')}`,
    field(lead, '진행_희망_시기를_선택해주세요.') && `희망 시기: ${field(lead, '진행_희망_시기를_선택해주세요.')}`,
    field(lead, '관심_서비스') && `관심 서비스: ${field(lead, '관심_서비스')}`,
    kakao && `카카오톡: ${kakao}`,
  ].filter(Boolean)

  return {
    meta_lead_id: lead.id,
    company_name: companyName,
    category: mapCategory(field(lead, '업종을_선택해주세요.', '업종')),
    region: field(lead, '매장_위치를_선택해주세요.'),
    source: '메타광고',
    contact_name: contactName,
    phone: normalizePhone(field(lead, 'phone', 'phone_number')),
    email,
    kakao_id: kakao,
    status: '신규문의',
    latest_note: noteParts.join(' · '),
  }
}

// ── Slack 알림 ─────────────────────────────────────────────────

async function notifyLead(companyId: string, m: MappedLead): Promise<boolean> {
  const text = [
    `*상호명:* <${appUrl()}/companies/${companyId}|${m.company_name}>`,
    `*구분:* ${m.category}`,
    `*담당자(고객):* ${m.contact_name ?? '—'}`,
    `*연락처:* ${m.phone ?? '—'}`,
    `*이메일:* ${m.email ?? '—'}`,
    `*내용:* ${m.latest_note}`,
  ].join('\n')

  const result = await sendSlackNotification({
    text: `[신규 DB 등록] ${m.company_name} (메타광고)`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🆕 신규 DB 등록 — 메타광고' } },
      { type: 'section', text: { type: 'mrkdwn', text } },
    ],
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

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_PAGE_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const formIds = (process.env.META_LEAD_FORM_IDS ?? DEFAULT_FORM_IDS.join(','))
    .split(',').map(s => s.trim()).filter(Boolean)

  const errors: string[] = []
  const leads: MetaLead[] = []

  // 폼별 최근 리드 조회 (최근 50건 — 중복은 meta_lead_id로 걸러짐)
  for (const formId of formIds) {
    try {
      const url = `${GRAPH}/${formId}/leads?fields=id,created_time,ad_name,campaign_name,field_data&limit=50&access_token=${token}`
      const res = await fetch(url, { cache: 'no-store' })
      const body = (await res.json()) as { data?: MetaLead[]; error?: { message: string } }
      if (body.error) throw new Error(body.error.message)
      leads.push(...(body.data ?? []))
    } catch (err) {
      errors.push(`form ${formId}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  try {
    const supabase = createAdminClient()

    // 자동 배정 담당자 조회 (이름 또는 이메일, 미설정/미일치 시 미배정)
    let assignedTo: string | null = null
    const assigneeKey = process.env.META_LEAD_ASSIGNEE?.trim().toLowerCase()
    if (assigneeKey) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('is_active', true)
      assignedTo = (profiles ?? []).find(
        p => p.name.toLowerCase() === assigneeKey || p.email.toLowerCase() === assigneeKey,
      )?.id ?? null
      if (!assignedTo) errors.push(`assignee not found: ${process.env.META_LEAD_ASSIGNEE}`)
    }

    // 이미 등록됐거나 사용자가 삭제한 리드 제외
    const ids = leads.map(l => l.id)
    const [{ data: existing }, { data: removed }] = ids.length
      ? await Promise.all([
          supabase.from('companies').select('meta_lead_id').in('meta_lead_id', ids),
          supabase.from('deleted_meta_leads').select('meta_lead_id').in('meta_lead_id', ids),
        ])
      : [{ data: [] }, { data: [] }]
    const known = new Set([...(existing ?? []), ...(removed ?? [])].map(r => r.meta_lead_id))
    const fresh = leads
      .filter(l => !known.has(l.id))
      .sort((a, b) => a.created_time.localeCompare(b.created_time))

    let inserted = 0
    let notified = 0

    for (const lead of fresh) {
      const mapped = mapLead(lead)
      const { data: created, error } = await supabase
        .from('companies')
        .insert({ ...mapped, assigned_to: assignedTo })
        .select('id')
        .single()
      if (error) {
        // unique 충돌(동시 실행 등)은 조용히 건너뜀
        if (!error.message.includes('duplicate')) errors.push(`insert ${lead.id}: ${error.message}`)
        continue
      }
      inserted++

      const ok = await notifyLead(created.id, mapped)
      if (ok) notified++
      await supabase.from('notification_logs').insert({
        notification_type: 'new_company',
        company_id: created.id,
        message: `[메타광고 리드] ${mapped.company_name}`,
        status: ok ? 'sent' : 'failed',
        sent_at: ok ? new Date().toISOString() : null,
      })
    }

    return NextResponse.json({
      success: true,
      checked: leads.length,
      inserted,
      notified,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message, errors }, { status: 500 })
  }
}
