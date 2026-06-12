// ── CRM 필드 정의 ─────────────────────────────────────────────
// 가져오기는 기존 엑셀 운영 컬럼에 맞춰 핵심 10개 항목만 받습니다.
// aliases: 엑셀 헤더가 조금 달라도 자동 매핑되도록 하는 별칭 목록

export interface CrmField {
  key: string
  label: string
  required: boolean
  aliases?: string[]
}

export const CRM_FIELDS: CrmField[] = [
  { key: 'company_name',      label: '상호명',           required: true,  aliases: ['업체명', '회사명', '거래처명'] },
  { key: 'category',          label: '구분',             required: true,  aliases: ['카테고리', '업종'] },
  { key: 'source',            label: 'DB 경로',          required: true,  aliases: ['DB경로', '경로', '유입경로', '유입 경로'] },
  { key: 'assigned_to_name',  label: '담당자',           required: false, aliases: ['담당자 (이름)', '담당자명', '담당'] },
  { key: 'region',            label: '지역',             required: false, aliases: ['위치', '소재지'] },
  { key: 'phone',             label: '연락처',           required: false, aliases: ['전화번호', '휴대폰', '핸드폰', '전화'] },
  { key: 'naver_place_url',   label: '네이버 플레이스',  required: false, aliases: ['네이버 플레이스 URL', '네이버플레이스', '플레이스'] },
  { key: 'inflow_date',       label: '유입일',           required: false, aliases: ['유입월', 'DB월', '유입 시점', '유입날짜', 'DB 유입일'] },
  { key: 'meeting_at',        label: '미팅 예정일',      required: false, aliases: ['미팅예정일', '미팅일', '미팅'] },
  { key: 'last_contacted_at', label: '마지막 연락일',    required: false, aliases: ['마지막 연락', '마지막 연락 시점', '최근 연락일', '최근연락'] },
  { key: 'latest_note',       label: '최근 특이사항',    required: false, aliases: ['특이사항', '메모', '비고', '노트'] },
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
  const used = new Set<number>()

  for (const field of CRM_FIELDS) {
    const candidates = [field.label, ...(field.aliases ?? [])].map(norm)
    const idx = normalizedHeaders.findIndex((h, i) => !used.has(i) && candidates.includes(h))
    if (idx !== -1) {
      mapping[field.key] = csvHeaders[idx]
      used.add(idx)
    }
  }
  return mapping
}

// ── 매핑 유효성 검사 ──────────────────────────────────────────

// 담당자는 선택 사항 — 미배정으로 들여온 뒤 목록에서 일괄 배분할 수 있음
export function validateMapping(mapping: Record<string, string>): string[] {
  const missing: string[] = []
  if (!mapping.company_name) missing.push('상호명')
  if (!mapping.category)     missing.push('구분')
  if (!mapping.source)       missing.push('DB 경로')
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
  const v = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(v))     return v.substring(0, 10)
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(v)) {
    const [y, m, d] = v.split('.')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ko = v.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (ko) return `${ko[1]}-${ko[2].padStart(2, '0')}-${ko[3].padStart(2, '0')}`

  // 월 단위 표기 → 해당 월 1일 ("2026-06", "2026.6", "2026년 6월")
  const ym = v.match(/^(\d{4})[-.년]\s*(\d{1,2})월?$/)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}-01`
  return null
}
