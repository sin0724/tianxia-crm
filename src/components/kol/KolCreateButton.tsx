'use client'

import { useState } from 'react'
import { KolFormModal } from '@/components/kol/KolFormModal'

export function KolCreateButton({ categories }: { categories: { name: string; color: string }[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        + KOL 등록
      </button>
      {open && <KolFormModal categories={categories} onClose={() => setOpen(false)} />}
    </>
  )
}
