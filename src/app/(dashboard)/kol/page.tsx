import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { KolFilters } from '@/components/kol/KolFilters'
import { KolTable } from '@/components/kol/KolTable'
import { KolCreateButton } from '@/components/kol/KolCreateButton'
import { Pagination } from '@/components/companies/Pagination'
import { getKols, type KolListFilters } from '@/lib/kols'
import { requireAuth } from '@/lib/auth'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function KolPage({ searchParams }: PageProps) {
  const profile = await requireAuth()
  const sp = await searchParams
  const filters: KolListFilters = {
    q:             sp.q,
    category:      sp.category,
    followers_min: sp.followers_min,
    followers_max: sp.followers_max,
    sort:          sp.sort,
    page:          sp.page ? parseInt(sp.page, 10) || 1 : 1,
  }

  const result = await getKols(filters)
  const isAdmin = profile.role === 'admin'

  return (
    <>
      <Header title="KOL 리스트" />
      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            인플루언서 아카이브 — 전직원 열람 가능{isAdmin ? ' · 등록/수정은 관리자' : ' (등록/수정은 관리자에게 요청)'}
          </p>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/kol/import" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                📥 엑셀 가져오기
              </Link>
              <KolCreateButton />
            </div>
          )}
        </div>

        <KolFilters total={result.total} />
        <KolTable kols={result.kols} isAdmin={isAdmin} now={result.now} />
        <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/kol" />
      </main>
    </>
  )
}
