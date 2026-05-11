import { createClient } from '@/lib/supabase/server'

export interface Company {
  id: string
  company_name: string
  category: string | null
  region: string | null
  source: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  kakao_id: string | null
  instagram_url: string | null
  naver_place_url: string | null
  website_url: string | null
  assigned_to: string | null
  status: string
  interest_level: number | null
  expected_amount: number | null
  contract_amount: number | null
  meeting_at: string | null
  last_contacted_at: string | null
  next_action_at: string | null
  latest_note: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
  profiles: { name: string } | null
}

export interface ProfileOption {
  id: string
  name: string
  role: string
}

export interface CompanyListFilters {
  status?: string
  assigned_to?: string
  category?: string
  source?: string
  next_action?: string
  q?: string
}

export async function getCompanies(filters: CompanyListFilters = {}): Promise<Company[]> {
  const supabase = await createClient()

  let query = supabase
    .from('companies')
    .select('id, company_name, category, region, source, status, meeting_at, last_contacted_at, next_action_at, latest_note, assigned_to, profiles(name)')
    .order('next_action_at', { ascending: true, nullsFirst: false })
    .limit(500)

  if (filters.status)      query = query.eq('status', filters.status)
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters.category)    query = query.eq('category', filters.category)
  if (filters.source)      query = query.eq('source', filters.source)

  if (filters.next_action === 'overdue') {
    query = query
      .not('next_action_at', 'is', null)
      .lt('next_action_at', new Date().toISOString())
  }

  if (filters.q) {
    const safe = filters.q.replace(/[%_\\]/g, '\\$&')
    query = query.or(
      `company_name.ilike.%${safe}%,phone.ilike.%${safe}%,latest_note.ilike.%${safe}%`,
    )
  }

  const { data } = await query
  return (data as unknown as Company[]) ?? []
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('*, profiles(name)')
    .eq('id', id)
    .single()
  return (data as Company) ?? null
}

export async function getProfiles(): Promise<ProfileOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as ProfileOption[]
}
