import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { ImportClient } from '@/components/companies/ImportClient'
import { requireAuth } from '@/lib/auth'

export default async function ImportPage() {
  await requireAuth()

  return (
    <>
      <Header title="거래처 가져오기" />
      <main className="flex-1 p-6 max-w-3xl">
        <div className="mb-5">
          <Link href="/companies" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 거래처 목록
          </Link>
        </div>
        <ImportClient />
      </main>
    </>
  )
}
