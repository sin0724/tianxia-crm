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
  '전화', '문자', '카톡', '이메일', 'DM', '미팅', '제안서 발송', '계약서 발송', '기타',
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
