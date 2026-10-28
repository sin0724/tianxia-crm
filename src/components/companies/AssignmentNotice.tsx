'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

interface AssignmentNoticeProps {
  count: number      // 오늘(KST) 나에게 새로 배분된 거래처 수
  reassigned?: number // 그중 재배분(기존 DB) 건수
  todayKey: string   // KST 기준 "YYYY-MM-DD" — 하루 단위 닫기 상태 키
  href: string       // "내 거래처 보기" 이동 경로 (본인 담당분 필터 포함)
}

const DISMISS_KEY = 'assignment-notice-dismissed'

// 다른 탭에서 닫으면 반영되도록 storage 이벤트 구독 (없어도 동작에는 무방).
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null // 접근 불가(시크릿 모드 등) — 안 닫힌 것으로 간주해 노출
  }
}

// 오늘 나에게 새 거래처가 배분되면 담당자에게 팝업으로 알린다.
// "오늘 하루 안 보기"를 누르면 그 날(KST 날짜)에는 다시 뜨지 않는다 —
// 닫은 날짜를 localStorage에 저장하고 날짜가 바뀌면 자동으로 다시 노출.
export function AssignmentNotice({ count, reassigned = 0, todayKey, href }: AssignmentNoticeProps) {
  // useSyncExternalStore: 서버 렌더에서는 항상 미노출로 시작해 hydration 불일치를 피하고,
  // 클라이언트에서 localStorage 값을 읽어 노출 여부를 결정한다.
  const dismissedForToday = useSyncExternalStore(
    subscribe,
    () => readDismissed() === todayKey, // 클라이언트: 오늘 닫았는지
    () => true,                          // 서버/초기: 미노출
  )
  const [closedThisSession, setClosedThisSession] = useState(false)

  const open = count > 0 && !dismissedForToday && !closedThisSession
  if (!open) return null

  function dismissForToday() {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey)
    } catch {
      // 저장 실패해도 이번 세션에서는 닫히도록 진행
    }
    setClosedThisSession(true)
  }

  // 토스식 바텀시트 — 모바일은 하단에서 올라오고, 데스크톱은 가운데 카드로 뜬다
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-notice-title"
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-white px-6 pb-6 pt-7 shadow-xl sm:rounded-3xl">
        <p className="text-[13px] font-medium text-[#3182f6]">오늘 배분</p>
        <h2 id="assignment-notice-title" className="mt-1 text-[22px] font-bold leading-snug tracking-tight text-gray-900">
          거래처 {count}곳이<br />새로 배분됐어요
        </h2>
        {/* 신규 / 재배분(기존 DB) 구분 — 재배분이 있을 때만 */}
        {reassigned > 0 && (
          <div className="mt-4 space-y-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm">
            {count - reassigned > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">신규</span>
                <span className="font-semibold text-gray-900">{count - reassigned}곳</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">재배분 (기존 DB)</span>
              <span className="font-semibold text-gray-900">{reassigned}곳</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={dismissForToday}
            className="flex-1 rounded-2xl bg-gray-100 py-3.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
          >
            오늘 그만 보기
          </button>
          <Link
            href={href}
            onClick={() => setClosedThisSession(true)}
            className="flex-[1.4] rounded-2xl bg-[#3182f6] py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#1b64da]"
          >
            내 거래처 보기
          </Link>
        </div>
      </div>
    </div>
  )
}
