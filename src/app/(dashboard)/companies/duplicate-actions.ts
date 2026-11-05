'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth, isAdminOrManager } from '@/lib/auth'
import { claimTeamFor } from '@/lib/constants'

// ── 타입 ──────────────────────────────────────────────────────

export interface DuplicateCandidate {
  id: string
  company_name: string
  profiles: { name: string; team?: string | null } | null
  team: string | null
  status: string
  phone: string | null
  source: string | null
  last_contacted_at: string | null
  latest_note: string | null
  matchReasons: string[]
  /** 상세를 열어볼 수 있는 건인지 (영업은 본인 담당만) — false면 연락처·메모를 비워서 준다 */
  canView: boolean
  /** 이 건을 가져갈 수 있는 내 팀 — 0팀 건이고 미배정/내 담당일 때만 */
  claimTeam: string | null
}

// ── 상호명 정규화 ─────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\(\)\[\]（）【】·•\-_.,'"]/g, '')
}

// 입력 형식이 달라도(010-1234-5678, 01012345678, +82 10…) 같은 번호로 본다
function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.startsWith('82') ? `0${digits.slice(2)}` : digits
}

function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb || na.length < 2 || nb.length < 2) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

// ── DB 타입 ───────────────────────────────────────────────────

type DbRow = {
  id: string
  company_name: string
  phone: string | null
  naver_place_url: string | null
  instagram_url: string | null
  website_url: string | null
  status: string
  source: string | null
  last_contacted_at: string | null
  latest_note: string | null
  team: string | null
  assigned_to: string | null
  profiles: { name: string; team?: string | null } | null
}

const SELECT = [
  'id', 'company_name', 'phone', 'naver_place_url', 'instagram_url',
  'website_url', 'status', 'source', 'last_contacted_at', 'latest_note',
  'team', 'assigned_to', 'profiles(name, team)',
].join(', ')

// ── 서버 액션 ─────────────────────────────────────────────────

export async function findDuplicateCandidates(data: {
  company_name: string
  phone?: string | null
  naver_place_url?: string | null
  instagram_url?: string | null
  website_url?: string | null
}): Promise<DuplicateCandidate[]> {
  const profile = await requireAuth()
  // 영업은 RLS로 본인 담당 건만 보여서, 미배정·타 담당 0팀 건을 찾으려면 전체를 봐야 한다.
  // 대신 열람 권한이 없는 건은 아래에서 연락처·메모를 빼고 돌려준다.
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient()

  const found = new Map<string, DuplicateCandidate>()

  function addMatch(row: DbRow, reason: string) {
    if (found.has(row.id)) {
      found.get(row.id)!.matchReasons.push(reason)
    } else {
      const canView = isAdminOrManager(profile.role) || row.assigned_to === profile.id
      found.set(row.id, {
        id:               row.id,
        company_name:     row.company_name,
        profiles:         row.profiles,
        team:             row.team,
        status:           row.status,
        phone:            canView ? row.phone : null,
        source:           row.source,
        last_contacted_at: canView ? row.last_contacted_at : null,
        latest_note:      canView ? row.latest_note : null,
        matchReasons:     [reason],
        canView,
        claimTeam:        claimTeamFor(row, profile),
      })
    }
  }

  // 정확 일치 체크 (URL 특수문자 안전을 위해 개별 쿼리)
  const exactChecks: [keyof DbRow, string | null | undefined, string][] = [
    ['naver_place_url', data.naver_place_url, '네이버 플레이스 일치'],
    ['instagram_url',   data.instagram_url,   '인스타그램 일치'],
    ['website_url',     data.website_url,     '홈페이지 일치'],
  ]

  for (const [field, value, reason] of exactChecks) {
    if (!value?.trim()) continue
    const { data: rows } = await supabase
      .from('companies')
      .select(SELECT)
      .eq(field as string, value.trim())
    for (const row of (rows as unknown as DbRow[]) ?? []) {
      addMatch(row, reason)
    }
  }

  // 전화번호는 저장 형식이 경로마다 달라(봇은 숫자만, 폼은 하이픈 포함) 숫자로 비교한다
  const phone = phoneKey(data.phone)
  if (phone.length >= 8) {
    const { data: rows } = await supabase
      .from('companies')
      .select(SELECT)
      .ilike('phone', `%${phone.slice(-4)}%`)
      .limit(500)
    for (const row of (rows as unknown as DbRow[]) ?? []) {
      if (phoneKey(row.phone) === phone) addMatch(row, '전화번호 일치')
    }
  }

  // 상호명 유사도 체크
  const name = data.company_name?.trim()
  if (name) {
    const prefix = name.substring(0, Math.min(4, name.length))
    const { data: nameCandidates } = await supabase
      .from('companies')
      .select(SELECT)
      .ilike('company_name', `%${prefix}%`)
      .limit(100)

    for (const row of (nameCandidates as unknown as DbRow[]) ?? []) {
      if (isSimilarName(name, row.company_name)) {
        addMatch(row, '상호명 유사')
      }
    }
  }

  return [...found.values()]
}
