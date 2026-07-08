// ── 서버 내장 스케줄러 ─────────────────────────────────────────
// Next.js instrumentation: 서버 기동 시 1회 실행된다.
// 외부 크론 서비스 없이 메타 리드 동기화를 10분 주기로 자체 호출한다.
// Railway 단일 인스턴스 전제 — 인스턴스를 늘리면 중복 실행되지만
// meta_lead_id unique 제약이 중복 등록을 막는다.

const SYNC_INTERVAL_MS = 10 * 60 * 1000 // 10분

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return
  if (!process.env.CRON_SECRET) return

  const port = process.env.PORT ?? '3000'

  const run = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/sync-meta-leads`, {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      const body = (await res.json().catch(() => null)) as
        | { inserted?: number; errors?: string[] }
        | null
      if (!res.ok) {
        console.error('[meta-sync] HTTP', res.status, body)
      } else if (body?.inserted || body?.errors) {
        console.log('[meta-sync]', JSON.stringify(body))
      }
    } catch (err) {
      console.error('[meta-sync] error:', err)
    }
  }

  setTimeout(run, 60_000)             // 기동 1분 후 첫 실행
  setInterval(run, SYNC_INTERVAL_MS)  // 이후 10분마다
  console.log('[meta-sync] scheduler registered (10m interval)')
}
