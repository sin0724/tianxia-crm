import { Header } from '@/components/layout/Header'
import { ProjectStatusView } from '@/components/projects/ProjectStatusView'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  PROJECT_STATUSES,
  loadStaffProgress,
  type ProjectListFilters,
  type ProjectStatus,
} from '@/lib/staff-progress'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

function readFilters(sp: Record<string, string | undefined>): ProjectListFilters {
  const status = sp.status?.trim()
  return {
    assignee: sp.assignee?.trim() || undefined,
    status: status && (PROJECT_STATUSES as readonly string[]).includes(status) ? status as ProjectStatus : undefined,
    category: sp.category?.trim().slice(0, 40) || undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  }
}

// 로그인한 사용자가 볼 수 있는 거래처만 연결한다. sales 는 본인 담당 건만 열린다.
async function loadCompanyNames(): Promise<{ id: string; company_name: string }[]> {
  try {
    const supabase = await createClient()
    const rows: { id: string; company_name: string }[] = []
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .range(from, from + 999)
      if (error) break
      rows.push(...((data ?? []) as { id: string; company_name: string }[]))
      if (!data || data.length < 1000) break
    }
    return rows
  } catch {
    return []
  }
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  await requireAuth()
  const filters = readFilters(await searchParams)
  const progress = await loadStaffProgress()
  const companies = progress.ok ? await loadCompanyNames() : []

  return (
    <>
      <Header title="프로젝트 현황" />
      <main className="flex-1 p-4 sm:p-6">
        {progress.ok ? (
          <ProjectStatusView projects={progress.projects} companies={companies} filters={filters} />
        ) : (
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-6 py-12 text-center">
            <p className="text-base font-semibold text-gray-900">프로젝트 현황을 표시할 수 없습니다</p>
            <p className="mt-2 text-sm text-gray-500">{progress.message}</p>
          </div>
        )}
      </main>
    </>
  )
}
