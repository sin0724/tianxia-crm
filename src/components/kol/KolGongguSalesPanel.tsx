'use client'

// KOL 공구매출 이력 — 행 펼치기 안에서 목록 + 추가/수정/삭제.
// 통화가 섞이면 단순 합산이 틀리므로 누적액은 통화별로 나눠 보여주고,
// 비교가 필요한 환산 합계에는 적용 환율을 함께 표기한다.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createKolGongguSale, updateKolGongguSale, deleteKolGongguSale,
  type KolGongguSaleInput,
} from '@/app/(dashboard)/kol/gonggu-actions'
import { sumGongguSales, type KolGongguSale } from '@/lib/kol-gonggu-sales'
import { CURRENCIES, CURRENCY_LABEL, FX_NOTE, fmtMoney, fmtMoneyCompact } from '@/lib/constants'
import { fmtDateKST } from '@/lib/datetime'

const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'

interface Props {
  kolId: string
  sales: KolGongguSale[]
  canEdit: boolean
}

export function KolGongguSalesPanel({ kolId, sales, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const totals = sumGongguSales(sales)

  function save(input: KolGongguSaleInput, saleId: string | null) {
    setError(null)
    startTransition(async () => {
      const result = saleId
        ? await updateKolGongguSale(saleId, input)
        : await createKolGongguSale(kolId, input)
      if (result?.error) {
        setError(result.error)
        return
      }
      setEditingId(null)
      setAdding(false)
      router.refresh()
    })
  }

  function remove(sale: KolGongguSale) {
    if (!confirm(`'${sale.title}' 공구매출 이력을 삭제할까요?`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteKolGongguSale(sale.id)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs font-semibold text-gray-700">공구매출 이력</p>
        {totals.count > 0 ? (
          <p className="text-xs text-gray-600">
            누적{' '}
            <span className="font-semibold text-gray-900">
              {[
                totals.twd > 0 ? fmtMoney(totals.twd, 'TWD') : null,
                totals.krw > 0 ? fmtMoneyCompact(totals.krw, 'KRW') : null,
              ].filter(Boolean).join(' · ') || fmtMoney(0, 'TWD')}
            </span>
            <span className="text-gray-400"> · {totals.count}건</span>
            {totals.mixed && (
              <span className="text-gray-400">
                {' '}(환산 합계 ≈ {fmtMoneyCompact(totals.krwTotal, 'KRW')} · {FX_NOTE})
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs text-gray-400">기록된 공구매출이 없습니다.</p>
        )}
        {canEdit && !adding && (
          <button
            type="button" onClick={() => { setAdding(true); setEditingId(null) }}
            className="ml-auto px-2 py-1 text-[11px] font-medium text-blue-700 border border-blue-200 bg-white rounded-md hover:bg-blue-50 transition-colors"
          >
            + 공구매출 추가
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding && (
        <SaleForm
          isPending={isPending}
          onCancel={() => setAdding(false)}
          onSubmit={input => save(input, null)}
        />
      )}

      {sales.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap">진행일</th>
                <th className="px-2.5 py-1.5 text-left font-medium">공구명</th>
                <th className="px-2.5 py-1.5 text-left font-medium">브랜드</th>
                <th className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap">수량</th>
                <th className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap">공구매출</th>
                <th className="px-2.5 py-1.5 text-left font-medium">메모</th>
                {canEdit && <th className="px-2.5 py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map(sale => (
                editingId === sale.id ? (
                  <tr key={sale.id}>
                    <td colSpan={canEdit ? 7 : 6} className="px-2.5 py-2 bg-blue-50/40">
                      <SaleForm
                        sale={sale}
                        isPending={isPending}
                        onCancel={() => setEditingId(null)}
                        onSubmit={input => save(input, sale.id)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={sale.id}>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">
                      {sale.sale_date ? fmtDateKST(sale.sale_date) : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 font-medium text-gray-900">{sale.title}</td>
                    <td className="px-2.5 py-1.5 text-gray-600">{sale.brand ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-right text-gray-600 whitespace-nowrap">
                      {sale.quantity != null ? `${sale.quantity.toLocaleString('ko-KR')}개` : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-medium text-gray-900 whitespace-nowrap">
                      {fmtMoney(sale.amount, sale.currency)}
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-500 max-w-[220px] truncate" title={sale.notes ?? undefined}>
                      {sale.notes ?? '—'}
                    </td>
                    {canEdit && (
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-right">
                        <button
                          type="button" onClick={() => { setEditingId(sale.id); setAdding(false) }}
                          className="px-1.5 py-0.5 text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          type="button" onClick={() => remove(sale)} disabled={isPending}
                          className="px-1.5 py-0.5 text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 추가·수정 공용 폼. 통화는 대만 공구(NTD)와 국내 공구(원)를 구분해 저장한다.
function SaleForm({
  sale, isPending, onSubmit, onCancel,
}: {
  sale?: KolGongguSale
  isPending: boolean
  onSubmit: (input: KolGongguSaleInput) => void
  onCancel: () => void
}) {
  const [input, setInput] = useState<KolGongguSaleInput>({
    title:     sale?.title ?? '',
    brand:     sale?.brand ?? '',
    sale_date: sale?.sale_date ?? '',
    amount:    sale?.amount != null ? String(sale.amount) : '',
    currency:  sale?.currency ?? 'TWD',
    quantity:  sale?.quantity != null ? String(sale.quantity) : '',
    notes:     sale?.notes ?? '',
  })

  function set<K extends keyof KolGongguSaleInput>(key: K, value: string) {
    setInput(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="space-y-0.5">
          <span className="block text-[11px] text-gray-500">진행일</span>
          <input type="date" value={input.sale_date} onChange={e => set('sale_date', e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-0.5 col-span-1 sm:col-span-2">
          <span className="block text-[11px] text-gray-500">공구명 *</span>
          <input
            type="text" value={input.title} onChange={e => set('title', e.target.value)}
            placeholder="예: 여름 쿨링 마스크 공구" className={inputCls}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[11px] text-gray-500">브랜드/업체</span>
          <input
            type="text" value={input.brand} onChange={e => set('brand', e.target.value)}
            placeholder="예: A브랜드" className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="space-y-0.5 col-span-1 sm:col-span-2">
          <span className="block text-[11px] text-gray-500">공구매출</span>
          <div className="flex gap-1">
            <input
              type="text" inputMode="numeric" value={input.amount} onChange={e => set('amount', e.target.value)}
              placeholder="예: 420,000" className={inputCls}
            />
            <select
              value={input.currency} aria-label="공구매출 통화"
              onChange={e => set('currency', e.target.value)}
              className="px-1.5 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_LABEL[c]}</option>)}
            </select>
          </div>
        </label>
        <label className="space-y-0.5">
          <span className="block text-[11px] text-gray-500">판매 수량</span>
          <input
            type="text" inputMode="numeric" value={input.quantity} onChange={e => set('quantity', e.target.value)}
            placeholder="예: 320" className={inputCls}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[11px] text-gray-500">메모 (반응·재구매율)</span>
          <input
            type="text" value={input.notes} onChange={e => set('notes', e.target.value)}
            placeholder="예: 재구매율 높음" className={inputCls}
          />
        </label>
      </div>

      <div className="flex justify-end gap-1.5">
        <button
          type="button" onClick={onCancel} disabled={isPending}
          className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          취소
        </button>
        <button
          type="button" onClick={() => onSubmit(input)} disabled={isPending}
          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? '저장 중...' : sale ? '수정 저장' : '추가'}
        </button>
      </div>
    </div>
  )
}
