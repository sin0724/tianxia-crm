import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { KanbanBoard, type BoardCompany } from '@/components/companies/KanbanBoard'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

export default async function BoardPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('companies')
    .select('id, company_name, category, status, next_action_at, profiles(name)')
    .order('next_action_at', { ascending: true, nullsFirst: false })
    .limit(1000)

  const companies = (data as unknown as BoardCompany[]) ?? []

  return (
    <>
      <Header title="영업 보드" />
      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            카드를 드래그해서 상태를 변경할 수 있습니다.
          </p>
          <Link href="/companies" className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            ☰ 목록 보기
          </Link>
        </div>
        <KanbanBoard companies={companies} />
      </main>
    </>
  )
}
