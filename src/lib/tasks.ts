import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/lib/companies'
import { kstTodayRange, kstDaysAgoEnd } from '@/lib/datetime'

type TaskCompany = Pick<
  Company,
  | 'id'
  | 'company_name'
  | 'category'
  | 'status'
  | 'next_action_at'
  | 'last_contacted_at'
  | 'meeting_at'
  | 'profiles'
>

const EXCLUDED_STATUSES = ['계약 완료', '실패', '제외']

const SELECT = 'id, company_name, category, status, next_action_at, last_contacted_at, meeting_at, profiles(name)'

export async function getTodayActions(): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const { end } = kstTodayRange()

  let q = supabase
    .from('companies')
    .select(SELECT)
    .lte('next_action_at', end)
    .order('next_action_at', { ascending: true })

  for (const s of EXCLUDED_STATUSES) q = q.neq('status', s)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export async function getTodayMeetings(): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const { start, end } = kstTodayRange()

  const { data } = await supabase
    .from('companies')
    .select(SELECT)
    .gte('meeting_at', start)
    .lte('meeting_at', end)
    .order('meeting_at', { ascending: true })

  return (data as unknown as TaskCompany[]) ?? []
}

export async function getLongNoContact(): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const threshold = kstDaysAgoEnd(7)

  let q = supabase
    .from('companies')
    .select(SELECT)
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${threshold}`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })

  for (const s of EXCLUDED_STATUSES) q = q.neq('status', s)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export async function getProposalPending(): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const threshold = kstDaysAgoEnd(3)

  const { data } = await supabase
    .from('companies')
    .select(SELECT)
    .eq('status', '제안서 발송')
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${threshold}`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })

  return (data as unknown as TaskCompany[]) ?? []
}

export type { TaskCompany }
