import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/lib/companies'
import { kstTodayRange, kstStartOfDay, kstDaysAgoEnd } from '@/lib/datetime'

type TaskCompany = Pick<
  Company,
  | 'id'
  | 'company_name'
  | 'category'
  | 'status'
  | 'phone'
  | 'assigned_to'
  | 'next_action_at'
  | 'last_contacted_at'
  | 'meeting_at'
  | 'profiles'
>

const EXCLUDED_STATUSES = ['계약 완료', '실패', '제외']

const SELECT = 'id, company_name, category, status, phone, assigned_to, next_action_at, last_contacted_at, meeting_at, profiles(name)'

export interface TaskFilters {
  assigned_to?: string
}

/** 다음 액션일 = 오늘 (KST) */
export async function getTodayActions(filters: TaskFilters = {}): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const { start, end } = kstTodayRange()

  let q = supabase
    .from('companies')
    .select(SELECT)
    .gte('next_action_at', start)
    .lte('next_action_at', end)
    .order('next_action_at', { ascending: true })

  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)
  for (const s of EXCLUDED_STATUSES) q = q.neq('status', s)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

/** 다음 액션일이 오늘 이전인 연체 건 */
export async function getOverdueActions(filters: TaskFilters = {}): Promise<TaskCompany[]> {
  const supabase = await createClient()

  let q = supabase
    .from('companies')
    .select(SELECT)
    .lt('next_action_at', kstStartOfDay().toISOString())
    .order('next_action_at', { ascending: true })

  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)
  for (const s of EXCLUDED_STATUSES) q = q.neq('status', s)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export async function getTodayMeetings(filters: TaskFilters = {}): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const { start, end } = kstTodayRange()

  let q = supabase
    .from('companies')
    .select(SELECT)
    .gte('meeting_at', start)
    .lte('meeting_at', end)
    .order('meeting_at', { ascending: true })

  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export async function getLongNoContact(filters: TaskFilters = {}): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const threshold = kstDaysAgoEnd(7)

  let q = supabase
    .from('companies')
    .select(SELECT)
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${threshold}`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })

  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)
  for (const s of EXCLUDED_STATUSES) q = q.neq('status', s)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export async function getProposalPending(filters: TaskFilters = {}): Promise<TaskCompany[]> {
  const supabase = await createClient()
  const threshold = kstDaysAgoEnd(3)

  let q = supabase
    .from('companies')
    .select(SELECT)
    .eq('status', '제안서 발송')
    .or(`last_contacted_at.is.null,last_contacted_at.lte.${threshold}`)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })

  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)

  const { data } = await q
  return (data as unknown as TaskCompany[]) ?? []
}

export type { TaskCompany }
