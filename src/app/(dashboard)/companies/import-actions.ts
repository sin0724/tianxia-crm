'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { parseDate } from '@/lib/csv'

// ── 타입 ──────────────────────────────────────────────────────

export interface DuplicateCheckRow {
  idx: number
  company_name: string
  phone?: string
  naver_place_url?: string
  instagram_url?: string
  website_url?: string
}

export interface DuplicateMatch {
  idx: number
  matchedField: string
  existingName: string
  existingId: string
}

export interface ImportRow {
  company_name: string
  category?: string
  source?: string
  assigned_to_name?: string
  assigned_to_email?: string
  region?: string
  phone?: string
  email?: string
  kakao_id?: string
  instagram_url?: string
  naver_place_url?: string
  website_url?: string
  status?: string
  meeting_at?: string
  last_contacted_at?: string
  next_action_at?: string
  latest_note?: string
}

export interface ImportResult {
  inserted: number
  errors: { idx: number; company_name: string; reason: string }[]
}

// ── 중복 체크 ─────────────────────────────────────────────────

export async function checkDuplicates(
  candidates: DuplicateCheckRow[],
): Promise<DuplicateMatch[]> {
  await requireAuth()
  const supabase = await createClient()
  const matchMap = new Map<number, DuplicateMatch>()

  async function queryField(
    field: 'company_name' | 'phone' | 'naver_place_url' | 'instagram_url' | 'website_url',
    label: string,
    values: string[],
  ) {
    if (values.length === 0) return
    const { data } = await supabase
      .from('companies')
      .select(`id, company_name, ${field}`)
      .in(field, values)
    if (!data) return

    const existing = new Map(data.map(d => [(d as Record<string, string>)[field], d]))
    for (const c of candidates) {
      if (matchMap.has(c.idx)) continue
      const val = field === 'company_name' ? c.company_name : c[field as keyof DuplicateCheckRow] as string | undefined
      if (val && existing.has(val)) {
        const ex = existing.get(val)!
        matchMap.set(c.idx, {
          idx: c.idx,
          matchedField: label,
          existingName: ex.company_name,
          existingId: ex.id,
        })
      }
    }
  }

  const phones  = [...new Set(candidates.map(c => c.phone).filter(Boolean))] as string[]
  const navs    = [...new Set(candidates.map(c => c.naver_place_url).filter(Boolean))] as string[]
  const instas  = [...new Set(candidates.map(c => c.instagram_url).filter(Boolean))] as string[]
  const webs    = [...new Set(candidates.map(c => c.website_url).filter(Boolean))] as string[]

  await queryField('phone',            '연락처',          phones)
  await queryField('naver_place_url',  '네이버 플레이스',  navs)
  await queryField('instagram_url',    '인스타그램',       instas)
  await queryField('website_url',      '홈페이지',        webs)

  // 상호명 유사도 체크
  function normalizeName(name: string) {
    return name.toLowerCase().replace(/[\s\(\)\[\]（）【】·•\-_.,'"]/g, '')
  }

  const { data: allNames } = await supabase
    .from('companies')
    .select('id, company_name')
    .limit(2000)

  for (const c of candidates) {
    if (matchMap.has(c.idx) || !c.company_name) continue
    const na = normalizeName(c.company_name)
    if (na.length < 2) continue

    for (const ex of (allNames ?? [])) {
      const nb = normalizeName(ex.company_name)
      if (nb.length < 2) continue
      if (na === nb || na.includes(nb) || nb.includes(na)) {
        matchMap.set(c.idx, {
          idx: c.idx,
          matchedField: '상호명 유사',
          existingName: ex.company_name,
          existingId:   ex.id,
        })
        break
      }
    }
  }

  return [...matchMap.values()].sort((a, b) => a.idx - b.idx)
}

// ── 가져오기 ──────────────────────────────────────────────────

export async function importCompanies(rows: ImportRow[]): Promise<ImportResult> {
  await requireAuth()
  const supabase = await createClient()

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('is_active', true)

  const profiles = profilesData ?? []
  const byName  = new Map(profiles.map(p => [p.name.toLowerCase(),  p.id as string]))
  const byEmail = new Map(profiles.map(p => [p.email.toLowerCase(), p.id as string]))

  const result: ImportResult = { inserted: 0, errors: [] }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (!row.company_name?.trim()) {
      result.errors.push({ idx: i + 1, company_name: '(빈 값)', reason: '상호명 누락' })
      continue
    }

    let assigned_to: string | null = null
    if (row.assigned_to_name)
      assigned_to = byName.get(row.assigned_to_name.toLowerCase()) ?? null
    if (!assigned_to && row.assigned_to_email)
      assigned_to = byEmail.get(row.assigned_to_email.toLowerCase()) ?? null

    const { error } = await supabase.from('companies').insert({
      company_name:      row.company_name.trim(),
      category:          row.category?.trim()          || null,
      source:            row.source?.trim()             || null,
      region:            row.region?.trim()             || null,
      phone:             row.phone?.trim()              || null,
      email:             row.email?.trim()              || null,
      kakao_id:          row.kakao_id?.trim()           || null,
      instagram_url:     row.instagram_url?.trim()      || null,
      naver_place_url:   row.naver_place_url?.trim()    || null,
      website_url:       row.website_url?.trim()        || null,
      status:            row.status?.trim()             || '미연락',
      latest_note:       row.latest_note?.trim()        || null,
      meeting_at:        parseDate(row.meeting_at),
      last_contacted_at: parseDate(row.last_contacted_at),
      next_action_at:    parseDate(row.next_action_at),
      assigned_to,
    })

    if (error) result.errors.push({ idx: i + 1, company_name: row.company_name, reason: error.message })
    else result.inserted++
  }

  return result
}
