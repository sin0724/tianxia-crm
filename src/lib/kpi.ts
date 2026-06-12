import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { kstStartOfMonth, kstStartOfWeek, kstDateString } from '@/lib/datetime'

// ── 타입 ──────────────────────────────────────────────────────

export interface KpiRow {
  userId: string
  name: string
  meetingsThisMonth: number // 목표: 12 / 월
  kolToday: number          // 목표: 3 / 일
  kolThisWeek: number
  threadsThisWeek: number   // 목표: 3 / 주
}

export interface KpiEntry {
  id: string
  user_id: string
  entry_type: string
  topic: string | null
  entry_date: string
  created_at: string
}

// ── 대상 유저 결정 ────────────────────────────────────────────
// KPI는 영업 실무자(sales) 지표 — admin/manager는 감독 대상인 영업사원만 조회
// sales: 본인만 / manager: 같은 팀 영업사원 / admin: 전체 활성 영업사원

async function getTargetProfiles(profile: Profile): Promise<{ id: string; name: string }[]> {
  if (profile.role === 'sales') {
    return [{ id: profile.id, name: profile.name }]
  }

  const supabase = await createClient()
  let q = supabase
    .from('profiles')
    .select('id, name')
    .eq('is_active', true)
    .eq('role', 'sales')
    .order('name')

  if (profile.role === 'manager' && profile.team) {
    q = q.eq('team', profile.team)
  }

  const { data } = await q
  return data ?? []
}

// ── KPI 집계 ──────────────────────────────────────────────────

export async function getKpiData(profile: Profile): Promise<KpiRow[]> {
  const supabase = await createClient()
  const targets = await getTargetProfiles(profile)
  if (targets.length === 0) return []

  const ids = targets.map(t => t.id)
  const monthStart = kstStartOfMonth().toISOString()
  const weekStartDate = kstDateString(kstStartOfWeek())
  const today = kstDateString()

  const [{ data: meetings }, { data: entries }] = await Promise.all([
    supabase
      .from('activities')
      .select('user_id')
      .eq('activity_type', '미팅')
      .gte('created_at', monthStart)
      .in('user_id', ids),
    supabase
      .from('kpi_entries')
      .select('user_id, entry_type, entry_date')
      .gte('entry_date', weekStartDate)
      .in('user_id', ids),
  ])

  const rows = new Map<string, KpiRow>(targets.map(t => [t.id, {
    userId: t.id,
    name: t.name,
    meetingsThisMonth: 0,
    kolToday: 0,
    kolThisWeek: 0,
    threadsThisWeek: 0,
  }]))

  for (const m of meetings ?? []) {
    const row = rows.get(m.user_id)
    if (row) row.meetingsThisMonth++
  }

  for (const e of entries ?? []) {
    const row = rows.get(e.user_id)
    if (!row) continue
    if (e.entry_type === 'KOL 제안') {
      row.kolThisWeek++
      if (e.entry_date === today) row.kolToday++
    } else if (e.entry_type === '스레드 업로드') {
      row.threadsThisWeek++
    }
  }

  return [...rows.values()]
}

/** 본인의 오늘 KPI 기록 목록 (퀵 로그 위젯용) */
export async function getMyTodayKpiEntries(userId: string): Promise<KpiEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('kpi_entries')
    .select('id, user_id, entry_type, topic, entry_date, created_at')
    .eq('user_id', userId)
    .eq('entry_date', kstDateString())
    .order('created_at', { ascending: false })
  return (data as KpiEntry[]) ?? []
}
