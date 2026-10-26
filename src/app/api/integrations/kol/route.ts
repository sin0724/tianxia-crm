import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeHandle, sanitizeDeliverables } from '@/lib/kol-fields'

// ── KOL 회신 등록 웹훅 (KOC 에고라이트 실행기) ─────────────────
// 실행기가 팔로워 1만+ 계정에 유료 협업 문의 DM을 보내고, KOL이 답하면(단가표·협업 문의 등)
// 이 엔드포인트로 KOL 리스트에 등록한다. 이미 있는 KOL이면 히스토리에 회신을 덧붙이고
// 비어 있는 값(팔로워·단가)만 채운다 — 담당자가 입력한 값은 덮어쓰지 않는다.
//
// POST /api/integrations/kol
// Authorization: Bearer <KOC_CRM_SECRET>
// Body(JSON): {
//   instagram:     string     // 핸들 또는 프로필 URL
//   name?:         string     // 표시 이름 (없으면 핸들)
//   followers?:    number
//   kind?:         'offer' | 'reply' | 'inbound'  // offer = 유료협업 제안 DM을 보냄(회신 전 등록), 기본 reply
//                             // inbound = 공식계정(@tianxia_tw)으로 들어온 KOL 문의 — 담당자가 슬랙에 올린 링크
//   reply?:        string     // KOL이 보낸 회신 원문 (kind=reply일 때 필수) / inbound: 담당자 메모 (선택)
//   at?:           string     // 회신 시각 (ISO, 기본 지금)
//   sender?:       string     // 보낸 인스타 계정 (예: tianxia_koc_ego2) / inbound: 올린 담당자 이름
//   rate?:         string     // 단가 요약 ("릴스 1개 NT$15,000") — 담당자 확인 필요로 표시
//   fee_amount?:   number
//   fee_currency?: 'TWD' | 'KRW'
//   deliverables?: string[]
// }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

const ACTOR_NAME = 'KOC 에고라이트 (자동)'

// "2026-10-21T09:00:00Z" → "10/21" (KST)
function kstDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export async function POST(request: NextRequest) {
  const secret = process.env.KOC_CRM_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    kind?: string; instagram?: string; name?: string; followers?: number; reply?: string; at?: string; sender?: string
    rate?: string; fee_amount?: number; fee_currency?: string; deliverables?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const handle = normalizeHandle(body.instagram)
  const offer = body.kind === 'offer'
  const inbound = body.kind === 'inbound'
  const reply = body.reply?.trim() ?? ''
  if (!handle || (!offer && !inbound && !reply)) {
    return NextResponse.json({ success: false, error: 'instagram and reply are required' }, { status: 400 })
  }
  const at = body.at && !isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString()
  const followers = Number.isFinite(body.followers) && body.followers! > 0 ? Math.round(body.followers!) : null
  const rate = body.rate?.trim() || null
  const feeAmount = Number.isFinite(body.fee_amount) && body.fee_amount! >= 0 ? body.fee_amount! : null
  const feeCurrency = body.fee_currency === 'KRW' || body.fee_currency === 'TWD' ? body.fee_currency : null
  const deliverables = sanitizeDeliverables(Array.isArray(body.deliverables) ? body.deliverables.map(String) : [])
  // 히스토리 한 줄: "[10/21 에고라이트 @tianxia_koc_ego2] KOL 회신: …" / "… 유료협업 제안 DM 발송 (회신 대기)"
  // 공식계정 인입: "[10/26 공식계정 인입 · 이지아] 메모"
  const OFFER_TEXT = '유료협업 제안 DM 발송 (회신 대기)'
  const INBOUND_TEXT = '공식계정 인입'
  const memo = reply.replace(/\s+/g, ' ').slice(0, 500)
  const line = inbound
    ? `[${kstDay(at)} ${INBOUND_TEXT}${body.sender ? ` · ${body.sender}` : ''}]${memo ? ` ${memo}` : ''}`
    : `[${kstDay(at)} 에고라이트${body.sender ? ` @${body.sender}` : ''}] ${offer ? OFFER_TEXT : `KOL 회신: ${memo}`}`

  try {
    const supabase = createAdminClient()
    const { data: existing } = await supabase.from('kols').select('*').eq('instagram_handle', handle).maybeSingle()

    if (existing) {
      // 같은 회신을 두 번 받으면(재전송·백필) 히스토리에 다시 붙이지 않는다
      const history: string = existing.history ?? ''
      const dup = inbound ? history.includes(`${kstDay(at)} ${INBOUND_TEXT}`) : history.includes(offer ? OFFER_TEXT : reply.replace(/\s+/g, ' ').slice(0, 80))
      const update: Record<string, unknown> = {}
      if (!dup) update.history = history ? `${history}\n${line}` : line
      if (followers && !existing.followers) update.followers = followers
      if (rate && !existing.rate && existing.fee_amount == null) { update.rate = rate; update.rate_needs_review = true }
      if (feeAmount != null && existing.fee_amount == null) {
        update.fee_amount = feeAmount
        if (feeCurrency) update.fee_currency = feeCurrency
      }
      if (deliverables.length && !(existing.deliverables ?? []).length) update.deliverables = deliverables
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ success: true, created: false, unchanged: true, kol_id: existing.id })
      }
      const { error } = await supabase.from('kols').update(update).eq('id', existing.id)
      if (error) throw new Error(error.message)
      await supabase.from('kol_audit_logs').insert({
        actor_name: ACTOR_NAME, action: 'update', target_type: 'kol', target_id: existing.id, target_name: existing.name,
        summary: inbound ? '공식계정 인입 기록' : offer ? '에고라이트 유료협업 제안 기록' : `KOL 회신 추가${update.rate ? ' · 단가' : ''}`, details: { changes: update },
      })
      return NextResponse.json({ success: true, created: false, kol_id: existing.id })
    }

    const row = {
      name: body.name?.trim() || handle,
      instagram_handle: handle,
      followers,
      history: line,
      rate,
      rate_needs_review: !!rate,
      fee_amount: feeAmount,
      ...(feeCurrency ? { fee_currency: feeCurrency } : {}),
      deliverables,
    }
    const { data: created, error } = await supabase.from('kols').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    await supabase.from('kol_audit_logs').insert({
      actor_name: ACTOR_NAME, action: 'create', target_type: 'kol', target_id: created.id, target_name: row.name,
      summary: inbound ? `공식계정 인입 KOL 자동 등록 (@${handle})` : `에고라이트 KOL ${offer ? '제안' : '회신'} 자동 등록 (@${handle})`, details: { after: row },
    })
    return NextResponse.json({ success: true, created: true, kol_id: created.id })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
