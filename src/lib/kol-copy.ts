// KOL 리스트 → 공유용 텍스트 변환 헬퍼 (전체 복사 버튼·표의 선택 복사가 공유)

import { fmtFollowers } from '@/lib/constants'
import { fmtDateKST } from '@/lib/datetime'

export interface KolCopySource {
  name: string
  instagram_handle: string | null
  followers: number | null
  visit_note: string | null
  visit_date: string | null
}

// 방문 예정이 지났는지 — 대표 날짜(YYYY-MM-DD) 기준.
// 날짜 없이 메모만 있으면 지났는지 판단할 수 없으므로 유지한다.
export function isVisitExpired(visitDate: string | null, todayStr: string): boolean {
  return visitDate !== null && visitDate < todayStr
}

// 표시할 방문 예정 텍스트 — 지난 방문은 null (자동으로 지워진 것처럼 표시)
export function effectiveVisit(
  kol: Pick<KolCopySource, 'visit_note' | 'visit_date'>,
  todayStr: string,
): string | null {
  if (isVisitExpired(kol.visit_date, todayStr)) return null
  return kol.visit_note ?? (kol.visit_date ? fmtDateKST(kol.visit_date) : null)
}

// 1. https://instagram.com/handle · 3.2만
//    방문: 7/12~7/15 방문
export function buildKolCopyText(rows: KolCopySource[], header: string, todayStr: string): string {
  const items = rows.map((kol, i) => {
    const who = kol.instagram_handle
      ? `https://instagram.com/${kol.instagram_handle}`
      : kol.name
    const followers = kol.followers !== null ? ` · ${fmtFollowers(kol.followers)}` : ''
    const visit = effectiveVisit(kol, todayStr)

    const lines = [`${i + 1}. ${who}${followers}`]
    if (visit) lines.push(`   방문: ${visit}`)
    return lines.join('\n')
  })

  return [header, '', items.join('\n\n')].join('\n')
}

// 클립보드 쓰기 (navigator.clipboard 불가 환경 폴백 포함)
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}
