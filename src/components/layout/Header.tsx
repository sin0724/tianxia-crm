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
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between gap-3 px-4 sm:px-6">
      <h1 className="text-base font-semibold text-gray-800 truncate min-w-0">{title}</h1>
      <button
        onClick={handleSignOut}
        className="shrink-0 text-sm text-gray-500 hover:text-gray-800 transition-colors px-2 py-2 -mr-2"
      >
        로그아웃
      </button>
    </header>
  )
}
