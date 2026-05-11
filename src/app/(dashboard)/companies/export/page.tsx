import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { requireAuth } from '@/lib/auth'
import { getProfiles } from '@/lib/companies'
import { COMPANY_STATUS, COMPANY_CATEGORY, COMPANY_SOURCE } from '@/lib/constants'

export default async function ExportPage() {
  const profile = await requireAuth()
  const profiles = await getProfiles()

  return (
    <>
      <Header title="거래처 내보내기" />
      <main className="flex-1 p-6 max-w-lg">
        <div className="mb-5">
          <Link href="/companies" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 거래처 목록
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-1">CSV 다운로드</h2>
            <p className="text-xs text-gray-400">
              {profile.role === 'admin' ? '전체 거래처' : '본인 담당 거래처'}를 CSV로 내보냅니다.
            </p>
          </div>

          <form action="/api/companies/export" method="get" className="space-y-4">
            {/* 상태 필터 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">상태 필터</label>
              <select name="status" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">전체 상태</option>
                {COMPANY_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* 담당자 필터 (admin/manager만) */}
            {profile.role !== 'sales' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">담당자 필터</label>
                <select name="assigned_to" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">전체 담당자</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* 구분 필터 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">구분 필터</label>
              <select name="category" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">전체 구분</option>
                {COMPANY_CATEGORY.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* DB 경로 필터 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">DB 경로 필터</label>
              <select name="source" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">전체 경로</option>
                {COMPANY_SOURCE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              📥 CSV 다운로드
            </button>
          </form>
        </div>
      </main>
    </>
  )
}
