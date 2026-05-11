import { createClient } from '@/lib/supabase/server'

export interface Activity {
  id: string
  company_id: string
  user_id: string
  activity_type: string
  activity_result: string | null
  memo: string | null
  next_action_at: string | null
  created_at: string
  profiles: { name: string } | null
}

export async function getActivities(companyId: string): Promise<Activity[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('activities')
    .select('id, company_id, user_id, activity_type, activity_result, memo, next_action_at, created_at, profiles(name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data as unknown as Activity[]) ?? []
}
