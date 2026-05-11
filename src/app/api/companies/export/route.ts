import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { generateCSV } from '@/lib/csv'
import { redirect } from 'next/navigation'

const CSV_HEADERS = [
  '상호명', '구분', '지역', 'DB 경로', '담당자',
  '상태', '연락처', '이메일', '카카오ID',
  '인스타그램 URL', '네이버 플레이스 URL', '홈페이지 URL',
  '예상 금액', '계약 금액', '미팅 예정일', '다음 액션일',
  '마지막 연락일', '최근 특이사항', '등록일',
]

type ExportRow = {
  company_name: string
  category: string | null
  region: string | null
  source: string | null
  profiles: { name: string } | null
  status: string
  phone: string | null
  email: string | null
  kakao_id: string | null
  instagram_url: string | null
  naver_place_url: string | null
  website_url: string | null
  expected_amount: number | null
  contract_amount: number | null
  meeting_at: string | null
  next_action_at: string | null
  last_contacted_at: string | null
  latest_note: string | null
  created_at: string
}

function fmtDate(s: string | null) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

function toRow(c: ExportRow): (string | null)[] {
  return [
    c.company_name,
    c.category,
    c.region,
    c.source,
    c.profiles?.name ?? null,
    c.status,
    c.phone,
    c.email,
    c.kakao_id,
    c.instagram_url,
    c.naver_place_url,
    c.website_url,
    c.expected_amount?.toLocaleString('ko-KR') ?? null,
    c.contract_amount?.toLocaleString('ko-KR') ?? null,
    fmtDate(c.meeting_at)    || null,
    fmtDate(c.next_action_at) || null,
    fmtDate(c.last_contacted_at) || null,
    c.latest_note,
    fmtDate(c.created_at)   || null,
  ]
}

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return redirect('/login')

  const sp = request.nextUrl.searchParams
  const statusFilter    = sp.get('status')    || null
  const assigneeFilter  = sp.get('assigned_to') || null
  const categoryFilter  = sp.get('category')  || null
  const sourceFilter    = sp.get('source')    || null

  const supabase = await createClient()
  const SELECT = [
    'company_name', 'category', 'region', 'source',
    'status', 'phone', 'email', 'kakao_id',
    'instagram_url', 'naver_place_url', 'website_url',
    'expected_amount', 'contract_amount',
    'meeting_at', 'next_action_at', 'last_contacted_at',
    'latest_note', 'created_at', 'assigned_to',
    'profiles(name)',
  ].join(', ')

  let q = supabase.from('companies').select(SELECT).order('created_at', { ascending: false })

  // 역할별 필터 (sales는 RLS가 자동 처리, 추가 명시)
  if (profile.role === 'sales') q = q.eq('assigned_to', profile.id)

  if (statusFilter)   q = q.eq('status', statusFilter)
  if (categoryFilter) q = q.eq('category', categoryFilter)
  if (sourceFilter)   q = q.eq('source', sourceFilter)
  if (assigneeFilter && profile.role !== 'sales') q = q.eq('assigned_to', assigneeFilter)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as unknown as ExportRow[]) ?? []
  const csv  = generateCSV(CSV_HEADERS, rows.map(toRow))

  const filename = `거래처_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '').replace(/\.$/, '')}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
