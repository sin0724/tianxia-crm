import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Header } from '@/components/layout/Header'
import { ProjectStatusView } from '@/components/projects/ProjectStatusView'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  PROJECT_STATUSES,
  loadStaffProgress,
  type CompanyAssigneeRecord,
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

function readProfileName(profiles: unknown): string | null {
  const row = Array.isArray(profiles) ? profiles[0] : profiles
  if (!row || typeof row !== 'object' || !('name' in row)) return null
  const name = (row as { name: unknown }).name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

// 담당자 표시는 역할과 관계없이 같아야 하므로 서비스 롤로 이름만 읽는다.
// 키가 없으면 로그인한 사용자가 볼 수 있는 거래처로만 맞춘다.
async function loadAssigneeDirectory(): Promise<CompanyAssigneeRecord[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = url && serviceKey
      ? createServiceClient(url, serviceKey, { auth: { persistSession: false } })
      : await createClient()
    const rows: CompanyAssigneeRecord[] = []
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, profiles(name)')
        .range(from, from + 999)
      if (error || !data) break
      for (const row of data as { id: string; company_name: string; profiles: unknown }[]) {
        if (!row.id || !row.company_name) continue
        rows.push({
          id: row.id,
          company_name: row.company_name,
          assignee_name: readProfileName(row.profiles),
        })
      }
      if (data.length < 1000) break
    }
    return rows
  } catch {
    return []
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
  const [companies, assigneeDirectory] = progress.ok
    ? await Promise.all([loadCompanyNames(), loadAssigneeDirectory()])
    : [[], []]

  return (
    <>
      <Header title="프로젝트 현황" />
      <main className="flex-1 p-4 sm:p-6">
        {progress.ok ? (
          <ProjectStatusView
            projects={progress.projects}
            companies={companies}
            assigneeDirectory={assigneeDirectory}
            filters={filters}
          />
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
