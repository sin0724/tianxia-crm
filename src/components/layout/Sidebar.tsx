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
  { label: '프로젝트',   href: '/projects',  icon: '📁', roles: ['admin', 'manager', 'sales'] },
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
      {/* 데스크탑: 좌측 사이드바 — 토스식 밝은 배경 + 선택 항목만 회색 칩으로 강조 */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col min-h-screen bg-white border-r border-gray-100">
        <div className="px-6 pt-6 pb-4">
          <span className="text-lg font-bold tracking-tight text-gray-900">티엔샤 <span className="text-[#3182f6]">CRM</span></span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-colors ${
                isActive(item)
                  ? 'bg-gray-100 font-bold text-gray-900'
                  : 'font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className={`text-base ${isActive(item) ? '' : 'opacity-70 grayscale'}`}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mx-3 mb-4 rounded-2xl bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900 truncate">{profile.name}</p>
          <p className="mt-0.5 text-xs text-gray-400">{ROLE_LABEL[profile.role]}</p>
        </div>
      </aside>

      {/* 모바일: 하단 탭 바 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-0.5 py-2 text-[10px] leading-tight text-center transition-colors ${
                isActive(item) ? 'font-bold text-gray-900' : 'font-medium text-gray-400'
              }`}
            >
              <span className={`text-lg leading-none ${isActive(item) ? '' : 'opacity-60 grayscale'}`}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
