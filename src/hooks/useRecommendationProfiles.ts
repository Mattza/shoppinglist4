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

export async function upsertRecommendationProfile(
  userId: string,
  listId: string,
  profileSnapshot: string
): Promise<void> {
  const { error } = await supabase
    .from('recommendation_profiles')
    .upsert(
      {
        user_id: userId,
        list_id: listId,
        profile_snapshot: profileSnapshot.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,list_id' }
    )
  if (error) throw error
}
