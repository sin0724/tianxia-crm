import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { CompanyDetailClient } from '@/components/companies/CompanyDetailClient'
import { getCompany, getProfiles, getCategorySourceOptions } from '@/lib/companies'
import { getActivities } from '@/lib/activities'
import { requireAuth } from '@/lib/auth'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const profile = await requireAuth()
  const { id } = await params

  const [company, profiles, activities, options] = await Promise.all([
    getCompany(id),
    getProfiles(),
    getActivities(id),
    getCategorySourceOptions(),
  ])

  if (!company) notFound()

  return (
    <>
      <Header title="거래처 상세" />
      <main className="flex-1 p-4 sm:p-6 max-w-3xl">
        <div className="mb-4">
          <Link href="/companies" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← 거래처 목록
          </Link>
        </div>
        <CompanyDetailClient
          company={company}
          profiles={profiles}
          activities={activities}
          canDelete={profile.role === 'admin'}
          categoryOptions={options.categories}
          sourceOptions={options.sources}
        />
      </main>
    </>
  )
}
