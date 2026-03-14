import { supabase } from '@/lib/supabase'

export async function getRecommendationProfile(
  userId: string,
  listId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('recommendation_profiles')
    .select('profile_snapshot')
    .eq('user_id', userId)
    .eq('list_id', listId)
    .maybeSingle()
  return data?.profile_snapshot ?? null
}
