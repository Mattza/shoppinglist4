import { supabase } from '@/lib/supabase'
import type { ListMember } from '@/types/database'

export async function fetchMembershipsForUser(): Promise<
  { list_id: string; role: string }[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', user.id)
  if (error) throw error
  return data ?? []
}

export async function getMembership(
  listId: string,
  userId: string
): Promise<ListMember | null> {
  const { data, error } = await supabase
    .from('list_members')
    .select('*')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .single()
  if (error || !data) return null
  return data as ListMember
}
