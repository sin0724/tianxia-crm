'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { parseCSV, autoDetectMapping, generateCSV } from '@/lib/csv'
import { KOL_FIELDS, parseFollowers, parseCategories } from '@/lib/kol-fields'
import { fmtFollowers } from '@/lib/constants'
import { checkKolDuplicates, importKols } from '@/app/(dashboard)/kol/import-actions'
import type { KolDuplicateMatch, KolImportResult, KolImportRow } from '@/app/(dashboard)/kol/import-actions'

type Step = 'upload' | 'mapping' | 'preview' | 'result'

const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'

// ── 매핑 적용 ─────────────────────────────────────────────────

function applyMapping(row: string[], headers: string[], mapping: Record<string, string>): KolImportRow {
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const get = (key: string) => {
    const h = mapping[key]
    return h && idx[h] !== undefined ? row[idx[h]] || undefined : undefined
  }
  return {
    name:       get('name') ?? '',
    instagram:  get('instagram'),
    followers:  get('followers'),
    categories: get('categories'),
    rate:       get('rate'),
    visit_note: get('visit_note'),
    visit_date: get('visit_date'),
    history:    get('history'),
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────

export function KolImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]               = useState<Step>('upload')
  const [headers, setHeaders]         = useState<string[]>([])
  const [rows, setRows]               = useState<string[][]>([])
  const [mapping, setMapping]         = useState<Record<string, string>>({})
  const [dupes, setDupes]             = useState<KolDuplicateMatch[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [result, setResult]           = useState<KolImportResult | null>(null)
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
      setMapping(autoDetectMapping(h, KOL_FIELDS))
      setStep('mapping')
    }
    reader.readAsText(file, 'utf-8')
  }

  // ── Step 2: 매핑 확인 후 미리보기 진행 ────────────────────

  function handleGoPreview() {
    if (!mapping.name) {
      setFileError('필수 항목 매핑 필요: 이름')
      return
    }
    setFileError(null)
    setStep('preview')

    setSelectedIndices(new Set(rows.map((_, i) => i)))

    const candidates = rows.map((row, idx) => {
      const mapped = applyMapping(row, headers, mapping)
      return { idx, name: mapped.name, instagram: mapped.instagram }
    })

    startTransition(async () => {
      const matches = await checkKolDuplicates(candidates)
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
      const r = await importKols(importRows)
      setResult(r)
      setStep('result')
    })
  }

  // ── 양식 다운로드 ─────────────────────────────────────────────

  function downloadTemplate() {
    const headers = KOL_FIELDS.map(f => f.label)
    const exampleRow: (string | null)[] = [
      '김뷰티', '@beauty_kim', '95000', '뷰티, 라이프스타일',
      '피드 50 / 릴스 80', '7/12~7/15 방문', '2026-07-12',
      '25.05 A브랜드 릴스 진행 (반응 좋음) / 25.03 B클리닉 방문 후기',
    ]
    const csv = generateCSV(headers, [exampleRow])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'KOL_가져오기_양식.csv'
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
        <p className="text-xs text-gray-400 mt-1">Excel에서 &quot;CSV UTF-8&quot;로 저장한 .csv 파일</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>
      {fileError && <p className="mt-3 text-sm text-red-600">{fileError}</p>}

      <div className="mt-6 bg-gray-50 rounded-lg p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">입력 안내</p>
        <p>• 필수는 <strong>이름</strong>뿐이며, 나머지 컬럼은 있으면 자동 매핑됩니다.</p>
        <p>• 인스타그램은 @핸들·프로필 URL 모두 가능하고, 중복 핸들은 자동으로 걸러집니다.</p>
        <p>• 팔로워는 &quot;95000&quot;, &quot;95,000&quot;, &quot;9.5만&quot; 모두 인식합니다.</p>
        <p>• 카테고리는 쉼표로 여러 개 입력 (예: &quot;뷰티, 라이프스타일&quot;)</p>
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
              <th className="px-4 py-3 text-left w-1/2">KOL 항목</th>
              <th className="px-4 py-3 text-left w-1/2">CSV 컬럼 선택</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {KOL_FIELDS.map(field => (
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
      setSelectedIndices(prev => {
        const next = new Set(prev)
        previewRows.forEach(r => allPreviewSelected ? next.delete(r.idx) : next.add(r.idx))
        return next
      })
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
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">인스타그램</th>
                <th className="px-3 py-2 text-left">팔로워</th>
                <th className="px-3 py-2 text-left">카테고리</th>
                <th className="px-3 py-2 text-left">단가</th>
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
                        if (next.has(idx)) next.delete(idx)
                        else next.add(idx)
                        return next
                      })}
                      className="rounded border-gray-300 text-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{mapped.name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{mapped.instagram || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtFollowers(parseFollowers(mapped.followers))}</td>
                  <td className="px-3 py-2 text-gray-600">{parseCategories(mapped.categories).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{mapped.rate || '—'}</td>
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
                <span className="font-medium text-gray-800 flex-1 truncate">{e.name}</span>
                <span className="text-red-500 text-xs shrink-0">{e.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Link href="/kol" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
          KOL 리스트로
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
