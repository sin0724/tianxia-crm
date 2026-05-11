'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import {
  notifyNewCompany,
  notifyMeetingScheduled,
  notifyContractComplete,
} from '@/lib/notifications'

interface ActionResult {
  error: string
}

const NOTIF_SELECT = 'id, company_name, category, source, status, meeting_at, latest_note, contract_amount, profiles(name)' as const

function extractData(fd: FormData) {
  const str = (k: string) => { const v = fd.get(k); return v && v !== '' ? (v as string) : null }
  const num = (k: string) => { const v = fd.get(k); return v && v !== '' ? Number(v) : null }

  return {
    company_name:    str('company_name')!,
    category:        str('category'),
    region:          str('region'),
    source:          str('source'),
    contact_name:    str('contact_name'),
    phone:           str('phone'),
    email:           str('email'),
    kakao_id:        str('kakao_id'),
    instagram_url:   str('instagram_url'),
    naver_place_url: str('naver_place_url'),
    website_url:     str('website_url'),
    assigned_to:     str('assigned_to'),
    status:          str('status') ?? '미연락',
    interest_level:  num('interest_level'),
    expected_amount: num('expected_amount'),
    meeting_at:      str('meeting_at'),
    next_action_at:  str('next_action_at'),
    latest_note:     str('latest_note'),
  }
}

type NotifCompany = {
  id: string
  company_name: string
  category: string | null
  source: string | null
  status: string
  meeting_at: string | null
  latest_note: string | null
  contract_amount: number | null
  profiles: { name: string } | null
}

export async function createCompany(formData: FormData): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const data = extractData(formData)
  if (!data.company_name) return { error: '상호명은 필수입니다.' }

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from('companies')
    .insert(data)
    .select('id')
    .single()

  if (error) return { error: error.message }

  // 알림: 신규 등록
  const { data: co } = await supabase
    .from('companies')
    .select(NOTIF_SELECT)
    .eq('id', created.id)
    .single()

  if (co) {
    await notifyNewCompany(co as unknown as NotifCompany, profile.id).catch(() => {})
  }

  revalidatePath('/companies')
  redirect('/companies')
}

export async function updateCompany(id: string, formData: FormData): Promise<ActionResult | undefined> {
  const profile = await requireAuth()
  const data = extractData(formData)
  if (!data.company_name) return { error: '상호명은 필수입니다.' }

  const supabase = await createClient()

  // 변경 감지용 기존 데이터 조회
  const { data: prev } = await supabase
    .from('companies')
    .select('status, meeting_at')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('companies').update(data).eq('id', id)
  if (error) return { error: error.message }

  // 알림 조건 판별 후 발송
  if (prev) {
    const oldStatus = prev.status as string
    const oldMeetingDate = prev.meeting_at ? (prev.meeting_at as string).split('T')[0] : null
    const newMeetingDate = data.meeting_at  // "YYYY-MM-DD" or null

    const meetingChanged = newMeetingDate !== null && newMeetingDate !== oldMeetingDate
    const contractJustDone = oldStatus !== '계약 완료' && data.status === '계약 완료'

    if (meetingChanged || contractJustDone) {
      const { data: co } = await supabase
        .from('companies')
        .select(NOTIF_SELECT)
        .eq('id', id)
        .single()

      if (co) {
        const company = co as unknown as NotifCompany
        if (meetingChanged) {
          await notifyMeetingScheduled(company, profile.id).catch(() => {})
        }
        if (contractJustDone) {
          await notifyContractComplete(company, profile.id).catch(() => {})
        }
      }
    }
  }

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}`)
}

export async function deleteCompany(id: string): Promise<ActionResult | undefined> {
  await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/companies')
  redirect('/companies')
}
