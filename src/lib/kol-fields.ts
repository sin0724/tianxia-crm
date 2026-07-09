// KOL 가져오기/등록에서 공유하는 필드 정의와 파서 (클라이언트에서도 사용 가능)

import type { CrmField } from '@/lib/csv'
import { KOL_CATEGORY } from '@/lib/constants'

export const KOL_FIELDS: CrmField[] = [
  // 이름 또는 인스타그램 중 하나만 있으면 됨 (이름이 비면 IG 핸들로 대체)
  { key: 'name',       label: '이름',           required: false, aliases: ['활동명', 'KOL명', 'kol', '이름(활동명)', '계정명', '이름/활동명'] },
  { key: 'instagram',  label: '인스타그램',     required: false, aliases: ['ig', 'ig링크', 'ig 링크', '인스타', '인스타링크', '인스타 링크', '인스타그램 링크', 'instagram', '핸들', '계정', 'url', '링크'] },
  { key: 'email',      label: '이메일',         required: false, aliases: ['email', 'e-mail', '메일', '이메일 주소', '연락 이메일'] },
  { key: 'followers',  label: '팔로워',         required: false, aliases: ['팔로워수', '팔로워 수', 'followers', '팔로워(명)'] },
  { key: 'categories', label: '카테고리',       required: false, aliases: ['분류', '장르', '카테고리(복수)', '주제'] },
  { key: 'rate',       label: '진행 단가',      required: false, aliases: ['단가', '진행단가', '비용', '고료', '원고료', '가격'] },
  { key: 'visit_note', label: '방문 예정',      required: false, aliases: ['방문예정', '방문 예정일', '방문예정일', '방문일정', '방문 일정', '방문'] },
  { key: 'visit_date', label: '방문 대표 날짜', required: false, aliases: ['방문날짜', '방문 날짜', '대표날짜', '대표 날짜'] },
  { key: 'history',    label: '히스토리',       required: false, aliases: ['진행이력', '진행 이력', '협업브랜드', '협업 브랜드', '이력', '메모', '비고', '특이사항'] },
]

// "@handle" / "https://instagram.com/handle/" / "www.instagram.com/handle?igsh=…" / "handle" → "handle" (소문자)
export function normalizeHandle(v: string | undefined | null): string | null {
  if (!v) return null
  const handle = v
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
  return handle || null
}

// "95,000" / "95000명" / "9.5만" / "1.2만명" / "9.5천" → 95000. 해석 불가 시 null (행 자체는 살림)
// 단위 없는 소수("2.3")는 "2.3만"에서 단위가 잘린 입력이므로 거부한다 — 팔로워 수는 소수가 될 수 없다
export function parseFollowers(v: string | undefined | null): number | null {
  if (!v) return null
  const s = v.trim().replace(/[,\s]/g, '').replace(/명$/, '')
  if (!s) return null
  const unit = s.match(/^(\d+(?:\.\d+)?)(만|천|[kK])$/)
  if (unit) {
    const mult = unit[2] === '만' ? 10000 : 1000
    return Math.round(parseFloat(unit[1]) * mult)
  }
  if (!/^\d+(?:\.0*)?$/.test(s)) return null
  const n = Math.round(parseFloat(s))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// "뷰티, 라이프스타일" / "뷰티/패션" → 유효 카테고리 목록에 있는 값만 추출
// valid 미지정 시 기본 목록 사용 (DB 카테고리는 호출부에서 넘긴다)
export function parseCategories(v: string | undefined | null, valid: readonly string[] = KOL_CATEGORY): string[] {
  if (!v) return []
  const out = new Set<string>()
  for (const raw of v.split(/[,|;·\n]+/)) {
    const t = raw.trim()
    if (!t) continue
    // '의료/시술', '맛집/F&B'처럼 슬래시가 카테고리명 자체인 경우를 먼저 매칭
    const exact = valid.find(c => c === t)
    if (exact) { out.add(exact); continue }
    // "뷰티/패션"처럼 슬래시를 구분자로 쓴 경우 분해 시도
    for (const part of t.split('/')) {
      const p = part.trim()
      const m = valid.find(c => c === p)
      if (m) out.add(m)
    }
  }
  return [...out]
}
