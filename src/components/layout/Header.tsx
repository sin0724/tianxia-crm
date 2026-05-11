'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      <button
        onClick={handleSignOut}
        className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        로그아웃
      </button>
    </header>
  )
}
