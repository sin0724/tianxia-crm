'use client'

import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import type { Company } from '@/lib/companies'

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\. /g, '.').replace(/\.$/, '')
}

function isOverdue(s: string | null) {
  return !!s && new Date(s) < new Date()
}

export function CompanyTable({ companies }: { companies: Company[] }) {
  if (companies.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <p className="text-sm text-gray-400">조건에 맞는 거래처가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['상호명','구분','지역','DB 경로','담당자','상태','미팅 예정일','마지막 연락일','다음 액션일','최근 특이사항'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {companies.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  <Link href={`/companies/${c.id}`} className="hover:text-blue-600 hover:underline">
                    {c.company_name}
                  </Link>
                </td>
                <Td>{c.category}</Td>
                <Td>{c.region}</Td>
                <Td>{c.source}</Td>
                <Td>{c.profiles?.name}</Td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={c.status} />
                </td>
                <Td>{fmtDate(c.meeting_at)}</Td>
                <Td>{fmtDate(c.last_contacted_at)}</Td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm ${isOverdue(c.next_action_at) ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                  {fmtDate(c.next_action_at)}
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-xs">
                  <p className="truncate">{c.latest_note ?? '—'}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{children ?? '—'}</td>
}
