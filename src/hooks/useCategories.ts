import { supabase } from '@/lib/supabase'
import type { Category } from '@/types/database'

export async function fetchCategories(listId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('list_id', listId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Category[]
}

export async function addCategory(
  listId: string,
  name: string,
  sortOrder: number
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ list_id: listId, name, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data as Category
}

export async function updateCategoryColor(
  categoryId: string,
  color: string | null
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ color })
    .eq('id', categoryId)
  if (error) throw error
}

export async function updateCategorySortOrder(
  categoryId: string,
  sortOrder: number
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ sort_order: sortOrder })
    .eq('id', categoryId)
  if (error) throw error
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
  if (error) throw error
}
