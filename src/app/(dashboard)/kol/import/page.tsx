import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { KolImportClient } from '@/components/kol/KolImportClient'
import { requireRole } from '@/lib/auth'

export default async function KolImportPage() {
  // 등록/수정과 동일하게 가져오기도 admin 전용
  await requireRole(['admin'])

  return (
    <>
      <Header title="KOL 가져오기" />
      <main className="flex-1 p-4 sm:p-6 max-w-3xl">
        <div className="mb-5">
          <Link href="/kol" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← KOL 리스트
          </Link>
        </div>
        <KolImportClient />
      </main>
    </>
  )
}
