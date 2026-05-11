'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfileName } from '@/app/(dashboard)/settings/actions'

interface ProfileNameFormProps {
  currentName: string
}

export function ProfileNameForm({ currentName }: ProfileNameFormProps) {
  const [name, setName] = useState(currentName)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSuccessMsg('')
    setErrorMsg('')

    startTransition(async () => {
      const result = await updateProfileName(name)
      if (result.error) {
        setErrorMsg(result.error)
      } else {
        setSuccessMsg('저장되었습니다')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          저장
        </button>
      </div>
      {successMsg && <p className="text-xs text-green-600">{successMsg}</p>}
      {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
    </form>
  )
}
