'use server'

import { requireAuth } from '@/lib/auth'
import { getKolsForCopy, type KolCopyRow, type KolListFilters } from '@/lib/kols'

// 텍스트 복사용 — 현재 필터에 걸린 전체 리스트 (전직원 열람 가능이므로 인증만 확인)
export async function fetchKolCopyRows(filters: KolListFilters): Promise<KolCopyRow[]> {
  await requireAuth()
  return getKolsForCopy(filters)
}
