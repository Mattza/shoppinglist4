export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface List {
  id: string
  owner_id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface ListMember {
  list_id: string
  user_id: string
  role: 'owner' | 'member'
}

export interface Category {
  id: string
  list_id: string
  name: string
  sort_order: number
}

export interface ListItem {
  id: string
  list_id: string
  category_id: string
  name: string
  created_at: string
  updated_at: string
  created_by?: string
}

export interface ArchivedItem {
  id: string
  list_id: string
  user_id: string
  name: string
  category_name: string | null
  archived_at: string
}

export interface RecommendationProfile {
  id: string
  user_id: string
  list_id: string | null
  profile_snapshot: string | null
  updated_at: string
}

export interface ListWithMembership extends List {
  role: 'owner' | 'member'
}
