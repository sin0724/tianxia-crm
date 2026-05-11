import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Supabase 이메일 링크(비밀번호 리셋, 이메일 인증 등) 콜백 처리
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone()
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      url.pathname = next
      url.searchParams.delete('code')
      url.searchParams.delete('next')
      return NextResponse.redirect(url)
    }
  }

  url.pathname = '/login'
  url.searchParams.set('error', 'callback_failed')
  return NextResponse.redirect(url)
}
