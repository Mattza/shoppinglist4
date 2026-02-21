import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentList } from '@/hooks/useCurrentList'
import type { Category, ListItem } from '@/types/database'

const DEFAULT_CATEGORY_NAMES = ['Frukt och grönt', 'Bröd', 'Kött', 'Mejeri', 'Frysvaror', 'Hem och hushåll', 'Övrigt']

async function fetchCategories(listId: string) {
  const { data, error } = await supabase.from('categories').select('*').eq('list_id', listId).order('sort_order')
  if (error) throw error
  return (data ?? []) as Category[]
}

async function fetchItems(listId: string) {
  const { data, error } = await supabase.from('list_items').select('*, category:categories(name)').eq('list_id', listId)
  if (error) throw error
  return (data ?? []) as (ListItem & { category: { name: string } | null })[]
}

export default function ListView() {
  const { listId } = useParams<{ listId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategoryId, setNewItemCategoryId] = useState<string>('')
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const { data: list } = useCurrentList(listId ?? undefined)
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', listId],
    queryFn: () => fetchCategories(listId!),
    enabled: !!listId,
  })
  const { data: items = [] } = useQuery({
    queryKey: ['list_items', listId],
    queryFn: () => fetchItems(listId!),
    enabled: !!listId,
  })

  // Realtime
  useEffect(() => {
    if (!listId) return
    const channel = supabase
      .channel(`list:${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `list_id=eq.${listId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['categories', listId] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [listId, queryClient])

  const addItemMutation = useMutation({
    mutationFn: async ({ name, category_id }: { name: string; category_id: string }) => {
      const { error } = await supabase.from('list_items').insert({
        list_id: listId!,
        category_id,
        name,
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
      setNewItemName('')
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: async (item: ListItem & { category?: { name: string } | null }) => {
      await supabase.from('archived_items').insert({
        list_id: listId!,
        user_id: user!.id,
        name: item.name,
        category_name: item.category?.name ?? null,
      })
      const { error } = await supabase.from('list_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['list_items', listId] }),
  })

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = Math.max(0, ...categories.map((c) => c.sort_order))
      const { error } = await supabase.from('categories').insert({ list_id: listId!, name, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', listId] }),
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const count = items.filter((i) => i.category_id === categoryId).length
      if (count > 0) if (!confirm(`${count} varor har denna kategori. Ta bort kategorin ändå? (Varorna tas inte bort.)`)) return
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', listId] })
      queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
    },
  })

  async function handleAiCategorize() {
    const lines = aiInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!lines.length || !listId) return
    setAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-items`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ list_id: listId, items: lines }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? res.statusText)
      setAiInput('')
      queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'AI-kategorisering misslyckades')
    } finally {
      setAiLoading(false)
    }
  }

  const itemsByCategory = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category_id === cat.id),
  }))

  return (
    <div className="list-view">
      {list && <h1>{list.name}</h1>}

      <section className="add-item">
        <h2>Lägg till vara</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newItemName.trim() && newItemCategoryId) {
              addItemMutation.mutate({ name: newItemName.trim(), category_id: newItemCategoryId })
            }
          }}
        >
          <input
            placeholder="Namn på vara"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          <select
            value={newItemCategoryId}
            onChange={(e) => setNewItemCategoryId(e.target.value)}
          >
            <option value="">Välj kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="submit" disabled={!newItemName.trim() || !newItemCategoryId || addItemMutation.isPending}>
            Lägg till
          </button>
        </form>
      </section>

      <section className="ai-categorize">
        <h2>AI-kategorisering</h2>
        <p className="hint">Skriv eller klistra in varor (en per rad eller separerade med komma). Klicka för att automatiskt lägga till dem i listans kategorier.</p>
        <textarea
          placeholder="t.ex. mjölk, äpplen, bröd"
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          rows={3}
        />
        <button type="button" onClick={handleAiCategorize} disabled={aiLoading || !aiInput.trim()}>
          {aiLoading ? 'Kategoriserar...' : 'Kategorisera med AI'}
        </button>
      </section>

      <section className="categories-section">
        <h2>Kategorier</h2>
        <div className="category-list">
          {categories.map((cat) => (
            <div key={cat.id} className="category-card">
              <div className="category-header">
                <h3>{cat.name}</h3>
                {!DEFAULT_CATEGORY_NAMES.includes(cat.name) && (
                  <button type="button" className="btn-remove-cat" onClick={() => deleteCategoryMutation.mutate(cat.id)} title="Ta bort kategori">
                    ×
                  </button>
                )}
              </div>
              <ul>
                {itemsByCategory.find((g) => g.category.id === cat.id)?.items.map((item) => (
                  <li key={item.id} className="item-row">
                    <span>{item.name}</span>
                    <button type="button" className="btn-remove" onClick={() => removeItemMutation.mutate(item)} title="Ta bort (sparas i arkiv)">
                      Ta bort
                    </button>
                  </li>
                )) ?? null}
              </ul>
            </div>
          ))}
        </div>
        <form
          className="add-category-form"
          onSubmit={(e) => {
            e.preventDefault()
            const name = (e.currentTarget.elements.namedItem('newCategory') as HTMLInputElement)?.value?.trim()
            if (name) {
              addCategoryMutation.mutate(name)
              ;(e.currentTarget.elements.namedItem('newCategory') as HTMLInputElement).value = ''
            }
          }}
        >
          <input name="newCategory" placeholder="Ny kategori" />
          <button type="submit" disabled={addCategoryMutation.isPending}>Lägg till kategori</button>
        </form>
      </section>

      <p className="nav-hint">
        <Link to={`/list/${listId}/recommendations`}>Rekommendationer</Link> baserat på arkivet
      </p>
    </div>
  )
}
