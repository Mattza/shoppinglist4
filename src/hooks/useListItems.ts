import { supabase } from '@/lib/supabase'
import type { ListItem } from '@/types/database'

export type ListItemWithCategory = ListItem & {
  category: { name: string } | null
}

export async function fetchListItems(
  listId: string
): Promise<ListItemWithCategory[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('*, category:categories(name)')
    .eq('list_id', listId)
  if (error) throw error
  return (data ?? []) as ListItemWithCategory[]
}

export async function addListItem(
  listId: string,
  categoryId: string,
  name: string,
  createdBy?: string
): Promise<ListItemWithCategory> {
  const { data, error } = await supabase
    .from('list_items')
    .insert({
      list_id: listId,
      category_id: categoryId,
      name,
      created_by: createdBy,
    })
    .select('*, category:categories(name)')
    .single()
  if (error) throw error
  return data as ListItemWithCategory
}

export async function removeListItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
}

export async function updateListItemName(
  itemId: string,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ name })
    .eq('id', itemId)
  if (error) throw error
}

export async function updateListItemCategory(
  itemId: string,
  categoryId: string
): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ category_id: categoryId })
    .eq('id', itemId)
  if (error) throw error
}

export async function moveListItemsToCategory(
  listId: string,
  fromCategoryId: string,
  toCategoryId: string
): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ category_id: toCategoryId })
    .eq('list_id', listId)
    .eq('category_id', fromCategoryId)
  if (error) throw error
}
