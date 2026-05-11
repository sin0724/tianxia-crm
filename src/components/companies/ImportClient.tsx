'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { CRM_FIELDS, parseCSV, autoDetectMapping, validateMapping, generateCSV } from '@/lib/csv'
import { checkDuplicates, importCompanies } from '@/app/(dashboard)/companies/import-actions'
import type { DuplicateMatch, ImportResult, ImportRow } from '@/app/(dashboard)/companies/import-actions'

type Step = 'upload' | 'mapping' | 'preview' | 'result'

const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'

// ── 매핑 적용 ─────────────────────────────────────────────────

function applyMapping(row: string[], headers: string[], mapping: Record<string, string>): ImportRow {
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const get = (key: string) => {
    const h = mapping[key]
    return h && idx[h] !== undefined ? row[idx[h]] || undefined : undefined
  }
  return {
    company_name:      get('company_name') ?? '',
    category:          get('category'),
    source:            get('source'),
    assigned_to_name:  get('assigned_to_name'),
    assigned_to_email: get('assigned_to_email'),
    region:            get('region'),
    phone:             get('phone'),
    email:             get('email'),
    kakao_id:          get('kakao_id'),
    instagram_url:     get('instagram_url'),
    naver_place_url:   get('naver_place_url'),
    website_url:       get('website_url'),
    status:            get('status'),
    meeting_at:        get('meeting_at'),
    last_contacted_at: get('last_contacted_at'),
    next_action_at:    get('next_action_at'),
    latest_note:       get('latest_note'),
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────

export function ImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]               = useState<Step>('upload')
  const [headers, setHeaders]         = useState<string[]>([])
  const [rows, setRows]               = useState<string[][]>([])
  const [mapping, setMapping]         = useState<Record<string, string>>({})
  const [dupes, setDupes]             = useState<DuplicateMatch[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [result, setResult]           = useState<ImportResult | null>(null)
  const [fileError, setFileError]     = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()

  // ── Step 1: 파일 선택 ──────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)

      if (h.length === 0) { setFileError('CSV에서 컬럼을 찾을 수 없습니다.'); return }
      if (r.length === 0)  { setFileError('데이터 행이 없습니다.'); return }

      setHeaders(h)
      setRows(r)
      setMapping(autoDetectMapping(h))
      setStep('mapping')
    }
    reader.readAsText(file, 'utf-8')
  }

  // ── Step 2: 매핑 확인 후 미리보기 진행 ────────────────────

  function handleGoPreview() {
    const errors = validateMapping(mapping)
    if (errors.length > 0) {
      setFileError(`필수 항목 매핑 필요: ${errors.join(', ')}`)
      return
    }
    setFileError(null)
    setStep('preview')

    // 전체 선택으로 초기화
    setSelectedIndices(new Set(rows.map((_, i) => i)))

    const candidates = rows.map((row, idx) => ({
      idx,
      company_name:    applyMapping(row, headers, mapping).company_name,
      phone:           applyMapping(row, headers, mapping).phone,
      naver_place_url: applyMapping(row, headers, mapping).naver_place_url,
      instagram_url:   applyMapping(row, headers, mapping).instagram_url,
    }))

    startTransition(async () => {
      const matches = await checkDuplicates(candidates)
      setDupes(matches)
      // 중복 행은 기본으로 체크 해제
      if (matches.length > 0) {
        const dupeIdxs = new Set(matches.map(m => m.idx))
        setSelectedIndices(prev => new Set([...prev].filter(i => !dupeIdxs.has(i))))
      }
    })
  }

  // ── Step 3: 가져오기 실행 ──────────────────────────────────

  function handleImport() {
    const importRows = [...selectedIndices]
      .sort((a, b) => a - b)
      .map(i => applyMapping(rows[i], headers, mapping))
    startTransition(async () => {
      const r = await importCompanies(importRows)
      setResult(r)
      setStep('result')
    })
  }

  // ── 양식 다운로드 ─────────────────────────────────────────────

  function downloadTemplate() {
    const headers = CRM_FIELDS.map(f => f.label)
    const exampleRow: (string | null)[] = [
      '(주)티엔샤', '병의원', '네이버', '홍길동', '', '서울 강남구',
      '010-1234-5678', 'contact@example.com', '', '', '', '',
      '미연락', '', '', '', '',
    ]
    const csv = generateCSV(headers, [exampleRow])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '거래처_가져오기_양식.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Step 1: 업로드 UI ──────────────────────────────────────

  if (step === 'upload') return (
    <div className="max-w-lg">
      <div className="flex justify-end mb-3">
        <button
          onClick={downloadTemplate}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          📥 양식 다운로드
        </button>
      </div>
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <p className="text-4xl mb-3">📂</p>
        <p className="text-sm font-medium text-gray-700">CSV 파일을 클릭하여 선택</p>
        <p className="text-xs text-gray-400 mt-1">Excel에서 내보낸 .csv 파일 (UTF-8)</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>
      {fileError && <p className="mt-3 text-sm text-red-600">{fileError}</p>}

      <div className="mt-6 bg-gray-50 rounded-lg p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">필수 컬럼</p>
        {CRM_FIELDS.filter(f => f.required).map(f => <p key={f.key}>• {f.label}</p>)}
        <p className="text-gray-400 pt-1">+ 담당자 이름 또는 담당자 이메일 중 하나</p>
      </div>
    </div>
  )

  // ── Step 2: 컬럼 매핑 UI ──────────────────────────────────

  if (step === 'mapping') return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-500">
        CSV에서 감지된 <span className="font-medium">{headers.length}개 컬럼</span>,
        총 <span className="font-medium">{rows.length}행</span> 데이터
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left w-1/2">CRM 항목</th>
              <th className="px-4 py-3 text-left w-1/2">CSV 컬럼 선택</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CRM_FIELDS.map(field => (
              <tr key={field.key} className={field.required ? 'bg-blue-50/30' : ''}>
                <td className="px-4 py-2.5">
                  <span className="font-medium text-gray-800">{field.label}</span>
                  {field.required && <span className="ml-1 text-red-500 text-xs">*</span>}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className={inputCls}
                    value={mapping[field.key] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))}
                  >
                    <option value="">— 선택 안 함 —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fileError && <p className="text-sm text-red-600">{fileError}</p>}

      <div className="flex gap-2">
        <button onClick={handleGoPreview} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
          미리보기 →
        </button>
        <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          다시 선택
        </button>
      </div>
    </div>
  )

  // ── Step 3: 미리보기 + 중복 확인 ──────────────────────────

  if (step === 'preview') {
    const previewRows = rows.slice(0, 20).map((row, i) => ({
      mapped: applyMapping(row, headers, mapping),
      dupe: dupes.find(d => d.idx === i),
      idx: i,
    }))

    const allPreviewSelected = previewRows.every(r => selectedIndices.has(r.idx))
    const togglePreviewAll = () => {
      if (allPreviewSelected) {
        setSelectedIndices(prev => {
          const next = new Set(prev)
          previewRows.forEach(r => next.delete(r.idx))
          return next
        })
      } else {
        setSelectedIndices(prev => {
          const next = new Set(prev)
          previewRows.forEach(r => next.add(r.idx))
          return next
        })
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="text-gray-500">전체 <strong>{rows.length}행</strong></span>
          <span className="text-blue-600 font-medium">선택 <strong>{selectedIndices.size}건</strong> 가져오기 예정</span>
          {isPending && <span className="text-gray-400">중복 검사 중...</span>}
          {!isPending && dupes.length > 0 && (
            <span className="text-orange-600 font-medium">⚠ 중복 후보 {dupes.length}건 (체크 해제됨)</span>
          )}
          {!isPending && dupes.length === 0 && (
            <span className="text-green-600">✓ 중복 없음</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="text-xs w-full">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allPreviewSelected}
                    onChange={togglePreviewAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">상호명</th>
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-left">DB 경로</th>
                <th className="px-3 py-2 text-left">담당자</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">중복 여부</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {previewRows.map(({ mapped, dupe, idx }) => (
                <tr key={idx} className={
                  !selectedIndices.has(idx) ? 'opacity-40' :
                  dupe ? 'bg-orange-50' : ''
                }>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => setSelectedIndices(prev => {
                        const next = new Set(prev)
                        next.has(idx) ? next.delete(idx) : next.add(idx)
                        return next
                      })}
                      className="rounded border-gray-300 text-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{mapped.company_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{mapped.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{mapped.source || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{mapped.assigned_to_name || mapped.assigned_to_email || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{mapped.status || '미연락'}</td>
                  <td className="px-3 py-2">
                    {dupe
                      ? <span className="text-orange-600">⚠ {dupe.matchedField} ({dupe.existingName})</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > 20 && (
          <p className="text-xs text-gray-400">
            미리보기는 20행까지 표시됩니다.
            {rows.length - 20}행 더 있음 — 체크박스 선택은 전체 {rows.length}행에 적용됩니다.
          </p>
        )}

        <div className="flex gap-2 items-center">
          <button
            onClick={handleImport}
            disabled={isPending || selectedIndices.size === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? '가져오는 중...' : `선택한 ${selectedIndices.size}건 가져오기`}
          </button>
          <button onClick={() => setStep('mapping')} disabled={isPending} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            매핑 수정
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4: 결과 ───────────────────────────────────────────

  if (step === 'result' && result) return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <p className="text-3xl font-bold text-green-600">{result.inserted}</p>
          <p className="text-sm text-green-700 mt-1">성공</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
          <p className="text-3xl font-bold text-red-500">{result.errors.length}</p>
          <p className="text-sm text-red-600 mt-1">실패</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">실패 목록</p>
          </div>
          <div className="divide-y divide-gray-100">
            {result.errors.map(e => (
              <div key={e.idx} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-8 text-right shrink-0">#{e.idx}</span>
                <span className="font-medium text-gray-800 flex-1 truncate">{e.company_name}</span>
                <span className="text-red-500 text-xs shrink-0">{e.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/companies" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
          거래처 목록으로
        </Link>
        <button onClick={() => { setStep('upload'); setResult(null); setDupes([]); if (fileRef.current) fileRef.current.value = '' }}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          다시 가져오기
        </button>
      </div>
    </div>
  )

  return null
}
