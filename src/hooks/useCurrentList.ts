import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { List } from '@/types/database'

export function useCurrentList(listId: string | undefined) {
  return useQuery({
    queryKey: ['list', listId],
    queryFn: async (): Promise<List | null> => {
      if (!listId) return null
      const { data, error } = await supabase.from('lists').select('*').eq('id', listId).single()
      if (error || !data) return null
      return data
    },
    enabled: !!listId,
  })
}
