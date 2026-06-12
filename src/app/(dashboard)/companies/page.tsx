import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { CompanyFilters } from '@/components/companies/CompanyFilters'
import { CompanyTable } from '@/components/companies/CompanyTable'
import { Pagination } from '@/components/companies/Pagination'
import { getCompanies, getProfiles, getCategorySourceOptions } from '@/lib/companies'
import { requireAuth } from '@/lib/auth'
import type { CompanyListFilters } from '@/lib/companies'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const profile = await requireAuth()
  const sp = await searchParams
  const filters: CompanyListFilters = {
    status:      sp.status,
    stage:       sp.stage,
    assigned_to: sp.assigned_to,
    category:    sp.category,
    source:      sp.source,
    next_action:  sp.next_action,
    inflow_month: sp.inflow_month,
    q:            sp.q,
    page:         sp.page ? parseInt(sp.page, 10) || 1 : 1,
  }

  const [result, profiles, options] = await Promise.all([
    getCompanies(filters),
    getProfiles(),
    getCategorySourceOptions(),
  ])

  return (
    <>
      <Header title="거래처 관리" />
      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">거래처 목록</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/companies/board" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              📋 보드 보기
            </Link>
            <Link href="/companies/import" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              📥 가져오기
            </Link>
            <Link href="/companies/export" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              📤 내보내기
            </Link>
            <Link href="/companies/new" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
              + 거래처 추가
            </Link>
          </div>
        </div>

        <CompanyFilters
          profiles={profiles}
          total={result.total}
          categories={options.categories}
          sources={options.sources}
          inflowMonths={options.inflowMonths}
        />
        <CompanyTable
          companies={result.companies}
          canDelete={profile.role === 'admin'}
          canAssign={profile.role === 'admin' || profile.role === 'manager'}
          profiles={profiles}
          categories={options.categories}
          sources={options.sources}
        />
        <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />
      </main>
    </>
  )
}
