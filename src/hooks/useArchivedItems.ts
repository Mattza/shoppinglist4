import { supabase } from '@/lib/supabase'

export async function insertArchivedItem(params: {
  list_id: string
  user_id: string
  name: string
  category_name: string | null
}): Promise<void> {
  const { error } = await supabase.from('archived_items').insert(params)
  if (error) throw error
}
