import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchMembershipsForUser } from '@/hooks/useListMembers'
import type { List, ListWithMembership } from '@/types/database'

export async function fetchLists(): Promise<ListWithMembership[]> {
  const memberships = await fetchMembershipsForUser()
  if (!memberships.length) return []
  const ids = memberships.map((m) => m.list_id)
  const { data: lists, error } = await supabase
    .from('lists')
    .select('*')
    .in('id', ids)
  if (error) throw error
  const withRole = (lists ?? []).map((l) => ({
    ...l,
    role: memberships.find((m) => m.list_id === l.id)!.role as
      | 'owner'
      | 'member',
  }))
  return withRole.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

export async function getListBySlug(slug: string): Promise<List | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return data as List
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('lists').delete().eq('id', id)
  if (error) throw error
}

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: fetchLists,
  })
}
