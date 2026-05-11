import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { CompanyFilters } from '@/components/companies/CompanyFilters'
import { CompanyTable } from '@/components/companies/CompanyTable'
import { getCompanies, getProfiles } from '@/lib/companies'
import type { CompanyListFilters } from '@/lib/companies'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters: CompanyListFilters = {
    status:      sp.status,
    assigned_to: sp.assigned_to,
    category:    sp.category,
    source:      sp.source,
    next_action: sp.next_action,
    q:           sp.q,
  }

  const [companies, profiles] = await Promise.all([
    getCompanies(filters),
    getProfiles(),
  ])

  return (
    <>
      <Header title="거래처 관리" />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">거래처 목록</p>
          <div className="flex items-center gap-2">
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

        <CompanyFilters profiles={profiles} total={companies.length} />
        <CompanyTable companies={companies} />
      </main>
    </>
  )
}
