'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Profile, UserRole } from '@/lib/auth'

interface NavItem {
  label: string
  href: string
  icon: string
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { label: '대시보드',   href: '/dashboard', icon: '📊', roles: ['admin', 'manager', 'sales'] },
  { label: '오늘 할 일', href: '/tasks',     icon: '✅', roles: ['admin', 'manager', 'sales'] },
  { label: '거래처 관리', href: '/companies', icon: '🏢', roles: ['admin', 'manager', 'sales'] },
  { label: 'KOL 리스트', href: '/kol',       icon: '⭐', roles: ['admin', 'manager', 'sales'] },
  { label: '설정',      href: '/settings',  icon: '⚙️', roles: ['admin', 'manager', 'sales'] },
]

const ROLE_LABEL: Record<UserRole, string> = {
  admin:   '관리자',
  manager: '매니저',
  sales:   '영업',
}

interface SidebarProps {
  profile: Profile
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(profile.role))

  function isActive(item: NavItem) {
    return item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href)
  }

  return (
    <>
      {/* 데스크탑: 좌측 사이드바 */}
      <aside className="hidden md:flex w-56 bg-gray-900 text-white flex-col min-h-screen">
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-lg font-bold tracking-tight">티엔샤 CRM</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(item)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <p className="text-sm font-medium text-white truncate">{profile.name}</p>
          <p className="mt-0.5 text-xs text-gray-400">{ROLE_LABEL[profile.role]}</p>
        </div>
      </aside>

      {/* 모바일: 하단 탭 바 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-gray-900 border-t border-gray-700 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                isActive(item) ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
