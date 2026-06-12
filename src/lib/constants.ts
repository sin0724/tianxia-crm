export const COMPANY_STATUS = [
  '미연락', '1차 연락 완료', '부재', '답변 대기', '관심 있음',
  '미팅 예정', '미팅 완료', '제안서 발송', '계약 검토',
  '계약 완료', '보류', '실패', '제외',
] as const

export type CompanyStatus = typeof COMPANY_STATUS[number]

export const COMPANY_CATEGORY = [
  '병의원', '맛집', '카페/디저트', '뷰티샵', '커머스', '숙박', '학원', '피트니스', '기타',
] as const

export type CompanyCategory = typeof COMPANY_CATEGORY[number]

export const COMPANY_SOURCE = [
  'OB', '네이버', '스레드', '인스타그램', '메타 광고', '회사DB', '소개', '기존 고객', '기타',
] as const

export type CompanySource = typeof COMPANY_SOURCE[number]

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
  '잠재': ['미연락', '1차 연락 완료', '부재', '답변 대기'],
  '가망': ['관심 있음', '미팅 예정', '미팅 완료', '제안서 발송', '계약 검토'],
  '고객': ['계약 완료'],
  '종료': ['보류', '실패', '제외'],
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

export const KPI_TARGETS = {
  meetingsPerMonth: 12, // 미팅 12건 이상 / 월 (활동 유형 '미팅' 기준)
  kolPerDay:        3,  // KOL 제안 3건 / 일
  threadsPerWeek:   3,  // 스레드 업로드(주제 선정) 3건 / 주
} as const

export const KPI_ENTRY_TYPES = ['KOL 제안', '스레드 업로드'] as const
export type KpiEntryType = typeof KPI_ENTRY_TYPES[number]

export const STATUS_COLOR: Record<CompanyStatus, string> = {
  '미연락':        'bg-gray-100 text-gray-600',
  '1차 연락 완료': 'bg-blue-100 text-blue-700',
  '부재':          'bg-orange-100 text-orange-700',
  '답변 대기':     'bg-yellow-100 text-yellow-700',
  '관심 있음':     'bg-green-100 text-green-700',
  '미팅 예정':     'bg-purple-100 text-purple-700',
  '미팅 완료':     'bg-indigo-100 text-indigo-700',
  '제안서 발송':   'bg-cyan-100 text-cyan-700',
  '계약 검토':     'bg-amber-100 text-amber-700',
  '계약 완료':     'bg-emerald-100 text-emerald-800',
  '보류':          'bg-gray-100 text-gray-500',
  '실패':          'bg-red-100 text-red-600',
  '제외':          'bg-gray-200 text-gray-500',
}
