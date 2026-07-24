'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

interface AssignmentNoticeProps {
  count: number      // 오늘(KST) 나에게 새로 배분된 거래처 수
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
export function AssignmentNotice({ count, todayKey, href }: AssignmentNoticeProps) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-notice-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="px-6 pt-6 pb-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl">
            🏢
          </div>
          <h2 id="assignment-notice-title" className="mt-4 text-lg font-bold text-gray-900">
            새 거래처 배분
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            오늘 <span className="font-semibold text-blue-600">{count}건</span>의 거래처가
            새로 배분되었습니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-4">
          <Link
            href={href}
            onClick={() => setClosedThisSession(true)}
            className="w-full rounded-md bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            내 거래처 보기
          </Link>
          <button
            type="button"
            onClick={dismissForToday}
            className="w-full rounded-md py-2 text-center text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            오늘 하루 안 보기
          </button>
        </div>
      </div>
    </div>
  )
}
