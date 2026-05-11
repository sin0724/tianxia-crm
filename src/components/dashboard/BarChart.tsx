interface BarItem {
  label: string
  value: number
  display?: string
}

interface BarChartProps {
  title: string
  items: BarItem[]
  emptyMessage?: string
}

export function BarChart({ title, items, emptyMessage = '데이터 없음' }: BarChartProps) {
  const max = Math.max(...items.map(i => i.value), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{emptyMessage}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 shrink-0 truncate text-right">
                {item.label}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-16 shrink-0">
                {item.display ?? item.value.toLocaleString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
