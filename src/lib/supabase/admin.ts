import { createClient } from '@supabase/supabase-js'

// 서비스 롤 클라이언트 — RLS를 우회한다. 서버 전용.
// 영업 담당자는 RLS상 본인 담당 건만 보이므로, 중복 확인처럼 전체 거래처를 봐야 하는
// 곳에서만 쓰고 호출부에서 권한과 노출 필드를 직접 제한한다.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
