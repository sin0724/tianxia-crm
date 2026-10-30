// 재무 고객명을 CRM 거래처에 잇는 별칭.
// 스키마를 바꾸지 않고 activities.activity_type = finance_alias, memo = 정규화된 재무 고객명으로 남긴다.

export const FINANCE_ALIAS_ACTIVITY = 'finance_alias'

export interface FinanceClientAlias {
  company_id: string
  normalized: string
  created_at: string
}

// 담당자 매칭·별칭 공통. 앞뒤 공백, 사이 공백, (주), 주식회사를 빼고 대소문자를 무시한다.
export function normalizeAssigneeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replaceAll('(주)', '')
    .replaceAll('주식회사', '')
}
