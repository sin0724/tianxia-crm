// 영업 단계(DB 상태) — 6단계로 간소화 (2026-06 담당자 건의 반영)
// 1.신규문의 → 2.제안서발송 → 3.미팅진행 → 4.계약검토 → 5.계약완료 / 6.이탈·보류
export const COMPANY_STATUS = [
  '신규문의', '제안서발송', '미팅진행', '계약검토', '계약완료', '이탈/보류',
] as const

export type CompanyStatus = typeof COMPANY_STATUS[number]

// 업종(구분) — 7개로 분류, 해당 없으면 '미분류'
export const COMPANY_CATEGORY = [
  '병의원', 'F&B', '뷰티', '코스메틱', '커머스', '숙박', '기타및대행사', '미분류',
] as const

export type CompanyCategory = typeof COMPANY_CATEGORY[number]

// DB 경로 — 7개로 간소화
export const COMPANY_SOURCE = [
  '메타광고', '스레드', '네이버블로그/폼', '아웃바운드', '회사DB', '인스타DM', '기타및소개',
] as const

export type CompanySource = typeof COMPANY_SOURCE[number]

// 계약완료/이탈·보류 = 종료된 건 — 할 일·리마인드·미연락 집계에서 제외
export const CLOSED_STATUSES = ['계약완료', '이탈/보류'] as const

export const ACTIVITY_TYPE = [
  '전화', '문자', '카톡', '이메일', 'DM', '미팅', 'KOL 제안', '제안서 발송', '계약서 발송', '기타',
] as const

export type ActivityType = typeof ACTIVITY_TYPE[number]

export const ACTIVITY_RESULT = [
  '부재', '응답 없음', '관심 있음', '자료 요청', '미팅 확정', '보류', '거절', '계약 완료',
] as const

export type ActivityResult = typeof ACTIVITY_RESULT[number]

export const ACTIVITY_TYPE_COLOR: Record<ActivityType, string> = {
  '전화':     'bg-blue-100 text-blue-700',
  '문자':     'bg-cyan-100 text-cyan-700',
  '카톡':     'bg-yellow-100 text-yellow-800',
  '이메일':   'bg-purple-100 text-purple-700',
  'DM':       'bg-pink-100 text-pink-700',
  '미팅':     'bg-green-100 text-green-700',
  'KOL 제안': 'bg-violet-100 text-violet-700',
  '제안서 발송': 'bg-orange-100 text-orange-700',
  '계약서 발송': 'bg-emerald-100 text-emerald-700',
  '기타':     'bg-gray-100 text-gray-600',
}

export const ACTIVITY_RESULT_COLOR: Record<ActivityResult, string> = {
  '부재':     'bg-gray-100 text-gray-500',
  '응답 없음': 'bg-gray-100 text-gray-500',
  '관심 있음': 'bg-green-100 text-green-700',
  '자료 요청': 'bg-blue-100 text-blue-700',
  '미팅 확정': 'bg-purple-100 text-purple-700',
  '보류':     'bg-yellow-100 text-yellow-700',
  '거절':     'bg-red-100 text-red-600',
  '계약 완료': 'bg-emerald-100 text-emerald-800',
}

// ── 영업 단계(스테이지) — status를 4단계로 그룹핑 ──────────────
// 잠재: 아직 반응 없음 / 가망: 반응 있음(영업 진행 중) / 고객: 계약 / 종료: 중단

export const STAGES = ['잠재', '가망', '고객', '종료'] as const
export type Stage = typeof STAGES[number]

export const STAGE_STATUS: Record<Stage, CompanyStatus[]> = {
  '잠재': ['신규문의'],
  '가망': ['제안서발송', '미팅진행', '계약검토'],
  '고객': ['계약완료'],
  '종료': ['이탈/보류'],
}

export function stageOf(status: string): Stage {
  for (const stage of STAGES) {
    if ((STAGE_STATUS[stage] as readonly string[]).includes(status)) return stage
  }
  return '잠재'
}

export const STAGE_COLOR: Record<Stage, string> = {
  '잠재': 'bg-gray-100 text-gray-600',
  '가망': 'bg-blue-100 text-blue-700',
  '고객': 'bg-emerald-100 text-emerald-800',
  '종료': 'bg-gray-200 text-gray-500',
}

// ── 영업사원 KPI 목표 ─────────────────────────────────────────
// 1주 단위로 통합 (2026-06 담당자 건의 반영)
export const KPI_TARGETS = {
  kolPerWeek:      15, // KOL 제안 15건 / 주
  threadsPerWeek:  3,  // 스레드 업로드 3건 / 주
  meetingsPerWeek: 3,  // 미팅 3건 / 주 (활동 유형 '미팅' 기준)
} as const

export const KPI_ENTRY_TYPES = ['KOL 제안', '스레드 업로드'] as const
export type KpiEntryType = typeof KPI_ENTRY_TYPES[number]

// ── KOL 아카이브 ─────────────────────────────────────────────
// KOL 콘텐츠 카테고리 — 거래처 업종(병의원/F&B/뷰티/숙박 등)에 매칭해 제안하는 기준.
// 한 KOL이 여러 카테고리를 가질 수 있다 (kols.categories TEXT[]).
export const KOL_CATEGORY = [
  '뷰티', '의료/시술', '맛집/F&B', '패션', '여행/숙박',
  '리빙', '육아/키즈', '운동/헬스', '라이프스타일', '기타',
] as const

export type KolCategory = typeof KOL_CATEGORY[number]

export const KOL_CATEGORY_COLOR: Record<string, string> = {
  '뷰티':         'bg-pink-100 text-pink-700',
  '의료/시술':    'bg-red-100 text-red-700',
  '맛집/F&B':     'bg-orange-100 text-orange-700',
  '패션':         'bg-purple-100 text-purple-700',
  '여행/숙박':    'bg-sky-100 text-sky-700',
  '리빙':         'bg-teal-100 text-teal-700',
  '육아/키즈':    'bg-yellow-100 text-yellow-800',
  '운동/헬스':    'bg-green-100 text-green-700',
  '라이프스타일': 'bg-indigo-100 text-indigo-700',
  '기타':         'bg-gray-100 text-gray-600',
}

// 팔로워 수 표시: 95000 → "9.5만", 1234567 → "123만", 800 → "800"
export function fmtFollowers(n: number | null): string {
  if (n === null || n === undefined) return '—'
  if (n >= 10000) {
    const man = n / 10000
    return `${man >= 100 ? Math.round(man).toLocaleString('ko-KR') : Math.round(man * 10) / 10}만`
  }
  if (n >= 1000) return `${Math.round(n / 100) / 10}천`
  return String(n)
}

export const STATUS_COLOR: Record<CompanyStatus, string> = {
  '신규문의':   'bg-gray-100 text-gray-600',
  '제안서발송': 'bg-cyan-100 text-cyan-700',
  '미팅진행':   'bg-purple-100 text-purple-700',
  '계약검토':   'bg-amber-100 text-amber-700',
  '계약완료':   'bg-emerald-100 text-emerald-800',
  '이탈/보류':  'bg-gray-200 text-gray-500',
}
