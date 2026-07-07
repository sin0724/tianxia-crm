'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { parseDate } from '@/lib/csv'
import { normalizeHandle, parseFollowers, parseCategories } from '@/lib/kol-fields'

// ── 타입 ──────────────────────────────────────────────────────

export interface KolDuplicateCheckRow {
  idx: number
  name: string
  instagram?: string
}

export interface KolDuplicateMatch {
  idx: number
  matchedField: string
  existingName: string
}

export interface KolImportRow {
  name: string
  instagram?: string
  followers?: string
  categories?: string
  rate?: string
  visit_note?: string
  visit_date?: string
  history?: string
}

export interface KolImportResult {
  inserted: number
  errors: { idx: number; name: string; reason: string }[]
}

// ── 중복 체크 ─────────────────────────────────────────────────

export async function checkKolDuplicates(
  candidates: KolDuplicateCheckRow[],
): Promise<KolDuplicateMatch[]> {
  await requireAuth()
  const supabase = await createClient()
  const matchMap = new Map<number, KolDuplicateMatch>()

  // 1) IG 핸들 정확 일치
  const handleByIdx = new Map<number, string>()
  for (const c of candidates) {
    const h = normalizeHandle(c.instagram)
    if (h) handleByIdx.set(c.idx, h)
  }
  const handles = [...new Set(handleByIdx.values())]
  if (handles.length > 0) {
    const { data } = await supabase
      .from('kols')
      .select('name, instagram_handle')
      .in('instagram_handle', handles)
    const existing = new Map((data ?? []).map(d => [d.instagram_handle as string, d.name as string]))
    for (const [idx, h] of handleByIdx) {
      const name = existing.get(h)
      if (name) matchMap.set(idx, { idx, matchedField: 'IG 핸들', existingName: name })
    }
  }

  // 2) 이름 유사 (공백·기호 제거 후 포함 관계)
  function normalizeName(name: string) {
    return name.toLowerCase().replace(/[\s\(\)\[\]（）【】·•\-_.,'"@]/g, '')
  }

  const { data: allNames } = await supabase
    .from('kols')
    .select('name')
    .limit(2000)

  for (const c of candidates) {
    if (matchMap.has(c.idx) || !c.name) continue
    const na = normalizeName(c.name)
    if (na.length < 2) continue

    for (const ex of (allNames ?? [])) {
      const nb = normalizeName(ex.name)
      if (nb.length < 2) continue
      if (na === nb || na.includes(nb) || nb.includes(na)) {
        matchMap.set(c.idx, { idx: c.idx, matchedField: '이름 유사', existingName: ex.name })
        break
      }
    }
  }

  return [...matchMap.values()].sort((a, b) => a.idx - b.idx)
}

// ── 가져오기 ──────────────────────────────────────────────────

export async function importKols(rows: KolImportRow[]): Promise<KolImportResult> {
  const profile = await requireAuth()
  if (profile.role !== 'admin') {
    return { inserted: 0, errors: [{ idx: 0, name: '—', reason: 'KOL 등록은 관리자만 가능합니다.' }] }
  }

  const supabase = await createClient()
  const result: KolImportResult = { inserted: 0, errors: [] }
  // 파일 안에서 같은 핸들이 두 번 나오는 경우도 잡는다
  const seenHandles = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    const handle = normalizeHandle(row.instagram)
    // 이름이 비어 있으면 IG 핸들을 이름으로 사용
    const name = row.name?.trim() || handle
    if (!name) {
      result.errors.push({ idx: i + 1, name: '(빈 값)', reason: '이름·인스타그램 모두 누락' })
      continue
    }
    if (handle && seenHandles.has(handle)) {
      result.errors.push({ idx: i + 1, name, reason: `파일 내 IG 핸들 중복 (@${handle})` })
      continue
    }

    const { error } = await supabase.from('kols').insert({
      name,
      instagram_handle: handle,
      followers:        parseFollowers(row.followers),
      categories:       parseCategories(row.categories),
      rate:             row.rate?.trim()       || null,
      visit_note:       row.visit_note?.trim() || null,
      visit_date:       parseDate(row.visit_date),
      history:          row.history?.trim()    || null,
      created_by:       profile.id,
    })

    if (error) {
      const reason = error.code === '23505'
        ? `이미 등록된 IG 핸들 (@${handle})`
        : error.message
      result.errors.push({ idx: i + 1, name, reason })
    } else {
      result.inserted++
      if (handle) seenHandles.add(handle)
    }
  }

  return result
}
