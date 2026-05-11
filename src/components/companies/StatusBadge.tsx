import { STATUS_COLOR, type CompanyStatus } from '@/lib/constants'

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status as CompanyStatus] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${color}`}>
      {status}
    </span>
  )
}
