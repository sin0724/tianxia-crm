'use server'

import { requireAuth } from '@/lib/auth'
import { logKolAudit, describeKolFilters, summarizeNames } from '@/lib/kol-audit'
import { getKolsForCopy, type KolCopyRow, type KolListFilters } from '@/lib/kols'

// 텍스트 복사용 — 현재 필터에 걸린 전체 리스트 (전직원 열람 가능이므로 인증만 확인)
// 리스트를 밖으로 빼내는 행위이므로 "내보내기"로 로그를 남긴다.
export async function fetchKolCopyRows(filters: KolListFilters): Promise<KolCopyRow[]> {
  const profile = await requireAuth()
  const rows = await getKolsForCopy(filters)

  await logKolAudit({
    actor:     profile,
    action:    'export',
    summary:   `전체 복사 ${rows.length}명 — ${describeKolFilters(filters as Record<string, unknown>)}`,
    itemCount: rows.length,
    details:   { scope: 'all', filters },
  })

  return rows
}

// 표에서 체크한 행만 복사하는 경우 — 복사 자체는 클라이언트에서 끝나므로
// 기록을 남기기 위해 이 액션을 따로 호출한다.
export async function logKolSelectionCopy(names: string[]): Promise<void> {
  const profile = await requireAuth()
  if (names.length === 0) return

  await logKolAudit({
    actor:     profile,
    action:    'export',
    summary:   `선택 복사 ${names.length}명 — ${summarizeNames(names)}`,
    itemCount: names.length,
    details:   { scope: 'selected', names: names.slice(0, 100) },
  })
}
