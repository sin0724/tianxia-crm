import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '티엔샤 CRM',
  description: '티엔샤 내부 영업 CRM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}
