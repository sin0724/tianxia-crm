'use client'

import { useState, useTransition } from 'react'
import { claimCompanyForMyTeam } from '@/app/(dashboard)/companies/actions'

// 0팀 건을 내 팀으로 가져오기 — 성공하면 서버 액션이 거래처 상세로 이동시킨다
export function ClaimTeamButton({ companyId, team }: { companyId: string; team: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await claimCompanyForMyTeam(companyId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="px-4 py-2 bg-[#3182f6] text-white text-sm font-medium rounded-xl hover:bg-[#1b64da] disabled:opacity-50 transition-colors"
      >
        {isPending ? '가져오는 중...' : `내 팀(${team})으로 가져오기`}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
