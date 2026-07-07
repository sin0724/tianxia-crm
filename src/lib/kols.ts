import { createClient } from '@/lib/supabase/server'

export interface Kol {
  id: string
  name: string
  instagram_handle: string | null
  followers: number | null
  categories: string[]
  rate: string | null
  visit_note: string | null
  visit_date: string | null
  history: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface KolListFilters {
  q?: string
  category?: string
  followers_min?: string // 만 단위 (예: "8" = 8만)
  followers_max?: string
  sort?: string          // 'updated'(기본) | 'followers' | 'visit' | 'name'
  page?: number
}

export const KOL_PAGE_SIZE = 50

export interface KolListResult {
  kols: Kol[]
  total: number
  page: number
  pageCount: number
  /** 조회 시각(ms) — "n일 미갱신" 계산용 (렌더 중 Date.now() 호출 회피) */
  now: number
}

// 만 단위 입력 → 실제 팔로워 수 ("8" → 80000, "0.5" → 5000)
function manToCount(v?: string): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) : null
}

export async function getKols(filters: KolListFilters = {}): Promise<KolListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase
    .from('kols')
    .select('*', { count: 'exact' })
    .range((page - 1) * KOL_PAGE_SIZE, page * KOL_PAGE_SIZE - 1)

  switch (filters.sort) {
    case 'followers':
      query = query.order('followers', { ascending: false, nullsFirst: false })
      break
    case 'visit':
      // 방문 예정일이 가까운 순 — 날짜 없는 건 뒤로
      query = query.order('visit_date', { ascending: true, nullsFirst: false })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    default:
      // 기본: 최신화(수정) 최근 순
      query = query.order('updated_at', { ascending: false })
  }

  if (filters.category) query = query.contains('categories', [filters.category])

  const min = manToCount(filters.followers_min)
  const max = manToCount(filters.followers_max)
  if (min !== null) query = query.gte('followers', min)
  if (max !== null) query = query.lte('followers', max)

  if (filters.q) {
    // PostgREST or() 구문 보호: 와일드카드 이스케이프 후 값 전체를 따옴표로 감쌈
    const safe = filters.q.replace(/[%_\\]/g, '\\$&').replace(/"/g, '\\"')
    query = query.or(
      `name.ilike."%${safe}%",instagram_handle.ilike."%${safe}%",history.ilike."%${safe}%",rate.ilike."%${safe}%",visit_note.ilike."%${safe}%"`,
    )
  }

  const { data, count } = await query
  const total = count ?? 0
  return {
    kols: (data as Kol[]) ?? [],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / KOL_PAGE_SIZE)),
    now: Date.now(),
  }
}
