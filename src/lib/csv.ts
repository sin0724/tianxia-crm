// ── CRM 필드 정의 ─────────────────────────────────────────────

export interface CrmField {
  key: string
  label: string
  required: boolean
}

export const CRM_FIELDS: CrmField[] = [
  { key: 'company_name',      label: '상호명',              required: true  },
  { key: 'category',          label: '구분',                required: true  },
  { key: 'source',            label: 'DB 경로',              required: true  },
  { key: 'assigned_to_name',  label: '담당자 (이름)',        required: false },
  { key: 'assigned_to_email', label: '담당자 (이메일)',      required: false },
  { key: 'region',            label: '지역',                required: false },
  { key: 'phone',             label: '연락처',              required: false },
  { key: 'email',             label: '이메일',              required: false },
  { key: 'kakao_id',          label: '카카오ID',             required: false },
  { key: 'instagram_url',     label: '인스타그램 URL',      required: false },
  { key: 'naver_place_url',   label: '네이버 플레이스 URL', required: false },
  { key: 'website_url',       label: '홈페이지 URL',        required: false },
  { key: 'status',            label: '상태',                required: false },
  { key: 'meeting_at',        label: '미팅 예정일',          required: false },
  { key: 'last_contacted_at', label: '마지막 연락일',        required: false },
  { key: 'next_action_at',    label: '다음 액션일',          required: false },
  { key: 'latest_note',       label: '최근 특이사항',        required: false },
]

// ── CSV 파싱 ──────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQ = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"')                    inQ = false
      else                                    cur += ch
    } else {
      if (ch === '"')      inQ = true
      else if (ch === ',') { fields.push(cur.trim()); cur = '' }
      else                  cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter(l => l.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [] }
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) }
}

// ── 자동 매핑 감지 ────────────────────────────────────────────

export function autoDetectMapping(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, '')
  const normalizedHeaders = csvHeaders.map(norm)

  for (const field of CRM_FIELDS) {
    const idx = normalizedHeaders.indexOf(norm(field.label))
    if (idx !== -1) mapping[field.key] = csvHeaders[idx]
  }
  return mapping
}

// ── 매핑 유효성 검사 ──────────────────────────────────────────

export function validateMapping(mapping: Record<string, string>): string[] {
  const missing: string[] = []
  if (!mapping.company_name) missing.push('상호명')
  if (!mapping.category)     missing.push('구분')
  if (!mapping.source)       missing.push('DB 경로')
  if (!mapping.assigned_to_name && !mapping.assigned_to_email)
    missing.push('담당자 (이름 또는 이메일 중 하나)')
  return missing
}

// ── CSV 생성 ──────────────────────────────────────────────────

function escapeField(v: string | null | undefined): string {
  const s = v ?? ''
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`
  return s
}

export function generateCSV(headers: string[], rows: (string | null)[][]): string {
  const lines = [
    headers.map(escapeField).join(','),
    ...rows.map(row => row.map(escapeField).join(',')),
  ]
  return '﻿' + lines.join('\r\n')
}

// ── 날짜 파싱 ─────────────────────────────────────────────────

export function parseDate(s: string | undefined | null): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s))     return s.substring(0, 10)
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(s)) {
    const [y, m, d] = s.split('.')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ko = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (ko) return `${ko[1]}-${ko[2].padStart(2, '0')}-${ko[3].padStart(2, '0')}`
  return null
}
