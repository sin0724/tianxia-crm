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
    <header className="h-16 bg-[#f2f4f6] flex items-center justify-between gap-3 px-4 sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-gray-900 truncate min-w-0">{title}</h1>
      <button
        onClick={handleSignOut}
        className="shrink-0 rounded-xl px-3 py-2 -mr-2 text-sm font-medium text-gray-500 hover:bg-gray-200/60 hover:text-gray-800 transition-colors"
      >
        로그아웃
      </button>
    </header>
  )
}
