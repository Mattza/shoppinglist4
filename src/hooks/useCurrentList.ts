import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getListBySlug } from '@/hooks/useLists'
import { getMembership } from '@/hooks/useListMembers'
import type { ListWithMembership } from '@/types/database'

export function useCurrentList(listSlug: string | undefined) {
  return useQuery({
    queryKey: ['list', listSlug],
    queryFn: async (): Promise<ListWithMembership | null> => {
      if (!listSlug) return null
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const list = await getListBySlug(listSlug)
      if (!list) return null
      const membership = await getMembership(list.id, user.id)
      const role = membership?.role === 'owner' ? 'owner' : 'member'
      return { ...list, role }
    },
    enabled: !!listSlug,
  })
}
