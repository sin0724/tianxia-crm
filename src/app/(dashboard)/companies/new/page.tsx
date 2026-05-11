import { Header } from '@/components/layout/Header'
import { CompanyForm } from '@/components/companies/CompanyForm'
import { getProfiles } from '@/lib/companies'
import { requireAuth } from '@/lib/auth'

export default async function NewCompanyPage() {
  await requireAuth()
  const profiles = await getProfiles()

  return (
    <>
      <Header title="거래처 추가" />
      <main className="flex-1 p-6 max-w-3xl">
        <CompanyForm profiles={profiles} />
      </main>
    </>
  )
}
