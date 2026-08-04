import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { KolLogFilters } from '@/components/kol/KolLogFilters'
import { KolLogTable } from '@/components/kol/KolLogTable'
import { Pagination } from '@/components/companies/Pagination'
import { requireRole } from '@/lib/auth'
import { getKolAuditLogs, getKolAuditActors, type KolAuditFilters } from '@/lib/kol-audit'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

// KOL 변경 로그 — 최고 관리자(admin) 전용.
// requireRole이 화면 접근을, kol_audit_logs RLS가 데이터 접근을 각각 막는다.
export default async function KolLogsPage({ searchParams }: PageProps) {
  await requireRole(['admin'])
  const sp = await searchParams

  const filters: KolAuditFilters = {
    action: sp.action,
    target: sp.target,
    actor:  sp.actor,
    from:   sp.from,
    to:     sp.to,
    q:      sp.q,
    page:   sp.page ? parseInt(sp.page, 10) || 1 : 1,
  }

  const [result, actors] = await Promise.all([getKolAuditLogs(filters), getKolAuditActors()])

  return (
    <>
      <Header title="KOL 변경 로그" />
      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            KOL 리스트의 등록·수정·삭제·가져오기·내보내기 기록 — 관리자만 볼 수 있습니다.
          </p>
          <Link
            href="/kol"
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            ← KOL 리스트
          </Link>
        </div>

        {result.tableMissing ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            <p className="font-medium">로그 테이블이 아직 없습니다.</p>
            <p className="mt-1 text-amber-700">
              Supabase SQL 편집기에서 <code className="px-1 bg-amber-100 rounded">supabase/schema.sql</code>의
              &lsquo;15. KOL 변경 로그&rsquo; 섹션을 실행하면 이 화면에 기록이 쌓이기 시작합니다.
            </p>
          </div>
        ) : (
          <>
            <KolLogFilters total={result.total} actors={actors} />
            <KolLogTable logs={result.logs} />
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              basePath="/kol/logs"
            />
          </>
        )}
      </main>
    </>
  )
}
