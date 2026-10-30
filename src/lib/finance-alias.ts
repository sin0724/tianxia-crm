// 재무 고객명을 CRM 거래처에 잇는 별칭.
// 스키마를 바꾸지 않고 activities.activity_type = finance_alias, memo = 정규화된 재무 고객명으로 남긴다.
// 거래처 없이 담당자를 직접 지정할 때는 notification_logs.notification_type = finance_assignee_override,
// message = 정규화된 고객명, user_id = 프로필 id 로 남긴다. company_id 는 비운다.

export const FINANCE_ALIAS_ACTIVITY = 'finance_alias'

export const FINANCE_ASSIGNEE_OVERRIDE_TYPE = 'finance_assignee_override'

export interface FinanceClientAlias {
  company_id: string
  normalized: string
  created_at: string
  // 직접 지정한 담당자 표시 이름. 값이 있으면 거래처명·거래처 별칭보다 우선한다.
  assignee_name?: string | null
}

export interface DuplicateCompanyRef {
  id: string
  company_name: string
  assignee_name: string | null
}

export interface DuplicateCompanyGroup {
  normalized: string
  assignee_name: string | null
  companies: DuplicateCompanyRef[]
}

// 비어 있지 않은 담당자 이름이 모두 같을 때만 그 이름을 돌려준다.
export function sharedAssigneeName(names: readonly (string | null | undefined)[]): string | null {
  if (names.length === 0) return null
  const trimmed = names.map(name => (typeof name === 'string' ? name.trim() : ''))
  if (trimmed.some(name => name.length === 0)) return null
  return trimmed.every(name => name === trimmed[0]) ? trimmed[0] : null
}

// 정규화한 이름이 둘 이상인 거래처만 묶는다. 빈 키(주식회사만 있는 이름)는 묶지 않는다.
export function duplicateCompanyGroups(companies: readonly DuplicateCompanyRef[]): DuplicateCompanyGroup[] {
  const groups = new Map<string, DuplicateCompanyRef[]>()
  for (const company of companies) {
    const key = normalizeAssigneeCompanyName(company.company_name ?? '')
    if (!key || !company.id) continue
    const list = groups.get(key)
    if (list) list.push(company)
    else groups.set(key, [{ ...company }])
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([normalized, list]) => {
      const companiesInGroup = [...list].sort((a, b) => (
        a.company_name.localeCompare(b.company_name, 'ko') || a.id.localeCompare(b.id)
      ))
      return {
        normalized,
        assignee_name: sharedAssigneeName(companiesInGroup.map(company => company.assignee_name)),
        companies: companiesInGroup,
      }
    })
    .sort((a, b) => a.normalized.localeCompare(b.normalized, 'ko'))
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
