import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ListWithMembership } from '@/types/database'

async function fetchLists(): Promise<ListWithMembership[]> {
  const { data: memberships } = await supabase
    .from('list_members')
    .select('list_id, role')
  if (!memberships?.length) return []
  const ids = memberships.map((m) => m.list_id)
  const { data: lists, error } = await supabase
    .from('lists')
    .select('*')
    .in('id', ids)
  if (error) throw error
  const withRole = (lists ?? []).map((l) => ({
    ...l,
    role: memberships.find((m) => m.list_id === l.id)!.role as 'owner' | 'member',
  }))
  return withRole.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )
}

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: fetchLists,
  })
}
