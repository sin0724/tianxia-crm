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
  { label: '설정',      href: '/settings',  icon: '⚙️', roles: ['admin', 'manager'] },
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

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">티엔샤 CRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-sm font-medium text-white truncate">{profile.name}</p>
        <p className="mt-0.5 text-xs text-gray-400">{ROLE_LABEL[profile.role]}</p>
      </div>
    </aside>
  )
}
