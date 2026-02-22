import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ListWithMembership } from '@/types/database'

export function useCurrentList(listId: string | undefined) {
  return useQuery({
    queryKey: ['list', listId],
    queryFn: async (): Promise<ListWithMembership | null> => {
      if (!listId) return null
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data: list, error: listError } = await supabase.from('lists').select('*').eq('id', listId).single()
      if (listError || !list) return null
      const { data: membership } = await supabase
        .from('list_members')
        .select('role')
        .eq('list_id', listId)
        .eq('user_id', user.id)
        .single()
      const role = membership?.role === 'owner' ? 'owner' : 'member'
      return { ...list, role }
    },
    enabled: !!listId,
  })
}
