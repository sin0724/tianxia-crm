// KOL 카테고리 — kol_categories 테이블에서 조회 (서버 전용)

import { createClient } from '@/lib/supabase/server'
import { KOL_CATEGORY, KOL_CATEGORY_COLOR } from '@/lib/constants'

export interface KolCategoryRow {
  id: string
  name: string
  color: string
  sort_order: number
}

// 마이그레이션 전(테이블 없음/비어 있음)에도 앱이 돌아가도록 기존 하드코딩 목록으로 폴백
export async function getKolCategories(): Promise<KolCategoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kol_categories')
    .select('id, name, color, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error || !data || data.length === 0) {
    return KOL_CATEGORY.map((name, i) => ({
      id: `fallback-${i}`,
      name,
      color: KOL_CATEGORY_COLOR[name] ?? 'bg-gray-100 text-gray-600',
      sort_order: i,
    }))
  }
  return data as KolCategoryRow[]
}

export async function getKolCategoryNames(): Promise<string[]> {
  return (await getKolCategories()).map(c => c.name)
}
