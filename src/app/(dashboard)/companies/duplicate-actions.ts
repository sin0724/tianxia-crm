'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

// ── 타입 ──────────────────────────────────────────────────────

export interface DuplicateCandidate {
  id: string
  company_name: string
  profiles: { name: string } | null
  status: string
  phone: string | null
  source: string | null
  last_contacted_at: string | null
  latest_note: string | null
  matchReasons: string[]
}

// ── 상호명 정규화 ─────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\(\)\[\]（）【】·•\-_.,'"]/g, '')
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
  profiles: { name: string } | null
}

const SELECT = [
  'id', 'company_name', 'phone', 'naver_place_url', 'instagram_url',
  'website_url', 'status', 'source', 'last_contacted_at', 'latest_note',
  'profiles(name)',
].join(', ')

// ── 서버 액션 ─────────────────────────────────────────────────

export async function findDuplicateCandidates(data: {
  company_name: string
  phone?: string | null
  naver_place_url?: string | null
  instagram_url?: string | null
  website_url?: string | null
}): Promise<DuplicateCandidate[]> {
  await requireAuth()
  const supabase = await createClient()

  const found = new Map<string, DuplicateCandidate>()

  function addMatch(row: DbRow, reason: string) {
    if (found.has(row.id)) {
      found.get(row.id)!.matchReasons.push(reason)
    } else {
      found.set(row.id, {
        id:               row.id,
        company_name:     row.company_name,
        profiles:         row.profiles,
        status:           row.status,
        phone:            row.phone,
        source:           row.source,
        last_contacted_at: row.last_contacted_at,
        latest_note:      row.latest_note,
        matchReasons:     [reason],
      })
    }
  }

  // 정확 일치 체크 (URL 특수문자 안전을 위해 개별 쿼리)
  const exactChecks: [keyof DbRow, string | null | undefined, string][] = [
    ['phone',           data.phone,           '전화번호 일치'],
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
