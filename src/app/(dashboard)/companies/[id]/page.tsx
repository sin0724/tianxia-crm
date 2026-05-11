import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { CompanyDetailClient } from '@/components/companies/CompanyDetailClient'
import { getCompany, getProfiles } from '@/lib/companies'
import { getActivities } from '@/lib/activities'
import { requireAuth } from '@/lib/auth'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailPage({ params }: PageProps) {
  await requireAuth()
  const { id } = await params

  const [company, profiles, activities] = await Promise.all([
    getCompany(id),
    getProfiles(),
    getActivities(id),
  ])

  if (!company) notFound()

  return (
    <>
      <Header title="거래처 상세" />
      <main className="flex-1 p-6 max-w-3xl">
        <div className="mb-4">
          <Link href="/companies" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 거래처 목록
          </Link>
        </div>
        <CompanyDetailClient company={company} profiles={profiles} activities={activities} />
      </main>
    </>
  )
}
