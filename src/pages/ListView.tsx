import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentList } from '@/hooks/useCurrentList'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Card } from '@/components/Card'
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
  const [quickAddByCategory, setQuickAddByCategory] = useState<Record<string, string>>({})
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  const defaultCategoryId = categories.find((c) => c.name === 'Övrigt')?.id ?? categories[0]?.id ?? ''

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
    onSuccess: (_, { category_id }) => {
      queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
      setNewItemName('')
      setQuickAddByCategory((prev) => ({ ...prev, [category_id]: '' }))
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

  const updateItemCategoryMutation = useMutation({
    mutationFn: async ({ itemId, categoryId }: { itemId: string; categoryId: string }) => {
      const { error } = await supabase.from('list_items').update({ category_id: categoryId }).eq('id', itemId)
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

  function handleAddToCategory(categoryId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    addItemMutation.mutate({ name: trimmed, category_id: categoryId })
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || !listId) return
    setInviteMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-by-email`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ list_id: listId, email }),
      })
      const json = await res.json()
      if (!res.ok) {
        setInviteMessage({ type: 'error', text: json?.error ?? 'Kunde inte bjuda in' })
        return
      }
      setInviteMessage({ type: 'success', text: 'Inbjudan skickad! De kan nu se listan under Mina listor.' })
      setInviteEmail('')
    } catch {
      setInviteMessage({ type: 'error', text: 'Något gick fel. Försök igen.' })
    }
  }

  return (
    <div className="relative mx-auto max-w-3xl space-y-8 pb-32">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {list && (
          <h1 className="text-3xl font-display font-semibold text-text">
            {list.name}
          </h1>
        )}
        {list?.role === 'owner' && (
          <Button
            variant="secondary"
            onClick={() => {
              setInviteOpen(true)
              setInviteMessage(null)
              setInviteEmail('')
            }}
            aria-label="Bjud in till listan"
          >
            Bjud in
          </Button>
        )}
      </div>

      {inviteOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <Card className="w-full max-w-md space-y-4">
              <div>
                <h2
                  id="invite-title"
                  className="text-xl font-display font-semibold text-text"
                >
                  Bjud in till listan
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Ange e-postadressen till någon som redan har ett konto. De
                  får tillgång till listan under Mina listor.
                </p>
              </div>
              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <Input
                  type="email"
                  placeholder="t.ex. namn@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-label="E-postadress"
                  required
                />
                {inviteMessage && (
                  <p
                    className={
                      inviteMessage.type === 'error'
                        ? 'text-sm text-red-600'
                        : 'text-sm text-cta'
                    }
                  >
                    {inviteMessage.text}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setInviteOpen(false)
                      setInviteMessage(null)
                    }}
                  >
                    Avbryt
                  </Button>
                  <Button type="submit">
                    Bjud in
                  </Button>
                </div>
              </form>
            </Card>
          </div>,
          document.body,
        )}

      {/* Categories with items – main focus */}
      <section className="space-y-4" aria-label="Kategorier och varor">
        <div>
          <h2 className="text-lg font-display font-semibold text-text">
            Varor i kategorier
          </h2>
          <p className="text-sm text-text-muted">
            Håll din lista organiserad genom att gruppera varor per kategori.
          </p>
        </div>
        <div className="space-y-4">
          {itemsByCategory.map(({ category: cat, items: catItems }) => (
            <Card key={cat.id} className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="font-display text-sm font-semibold text-primary">
                  {cat.name}
                </h3>
                {!DEFAULT_CATEGORY_NAMES.includes(cat.name) && (
                  <button
                    type="button"
                    className="text-sm text-text-muted hover:text-red-700 hover:bg-red-50 rounded-md px-2 py-1"
                    onClick={() => deleteCategoryMutation.mutate(cat.id)}
                    title="Ta bort kategori"
                    aria-label={`Ta bort kategorin ${cat.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
              <ul
                aria-label={`Varor i ${cat.name}`}
                className="divide-y divide-border/70"
              >
                {catItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="font-medium text-text">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-text"
                        value={item.category_id}
                        onChange={(e) => {
                          const categoryId = e.target.value
                          if (categoryId && categoryId !== item.category_id) {
                            updateItemCategoryMutation.mutate({ itemId: item.id, categoryId })
                          }
                        }}
                        aria-label={`Kategori för ${item.name}`}
                        disabled={updateItemCategoryMutation.isPending}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeItemMutation.mutate(item)}
                        title="Ta bort (sparas i arkiv)"
                        aria-label={`Ta bort ${item.name}`}
                      >
                        Ta bort
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Per-category quick add */}
              <form
                className="mt-3 flex gap-2 border-t border-dashed border-border pt-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = quickAddByCategory[cat.id]?.trim()
                  if (name) handleAddToCategory(cat.id, name)
                }}
              >
                <Input
                  placeholder={`Lägg till i ${cat.name}…`}
                  value={quickAddByCategory[cat.id] ?? ''}
                  onChange={(e) => setQuickAddByCategory((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  aria-label={`Lägg till vara i ${cat.name}`}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!quickAddByCategory[cat.id]?.trim() || addItemMutation.isPending}
                >
                  Lägg till
                </Button>
              </form>
            </Card>
          ))}
        </div>
        {categories.length === 0 && (
          <p className="text-sm text-text-muted">
            Inga kategorier än. Lägg till en nedan.
          </p>
        )}
      </section>

      {/* Add category + AI – secondary */}
      <div className="mt-8 space-y-6 border-t border-border pt-6">
        <form
          className="flex flex-col items-start gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault()
            const name = (e.currentTarget.elements.namedItem('newCategory') as HTMLInputElement)?.value?.trim()
            if (name) {
              addCategoryMutation.mutate(name)
              ;(e.currentTarget.elements.namedItem('newCategory') as HTMLInputElement).value = ''
            }
          }}
        >
          <Input
            name="newCategory"
            placeholder="Ny kategori"
            aria-label="Namn på ny kategori"
            className="w-full sm:w-60"
          />
          <Button type="submit" disabled={addCategoryMutation.isPending}>
            Lägg till kategori
          </Button>
        </form>

        <section className="space-y-2">
          <h2 className="text-base font-display font-semibold text-text">
            AI-kategorisering
          </h2>
          <p className="text-sm text-text-muted">
            Skriv eller klistra in varor (en per rad eller separerade med
            komma). Klicka för att automatiskt lägga till dem i listans
            kategorier.
          </p>
          <textarea
            className="block w-full min-h-[80px] rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="t.ex. mjölk, äpplen, bröd"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            rows={3}
            aria-label="Varor att kategorisera med AI"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAiCategorize}
            disabled={aiLoading || !aiInput.trim()}
          >
            {aiLoading ? 'Kategoriserar…' : 'Kategorisera med AI'}
          </Button>
        </section>
      </div>

      <p className="mt-4 text-sm text-text-muted">
        <Link
          className="font-semibold text-primary hover:underline"
          to={`/list/${listId}/recommendations`}
        >
          Rekommendationer
        </Link>{' '}
        baserat på arkivet
      </p>

      {/* Add bar rendered in portal so it stays fixed to viewport (no scroll parent) */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
          <section
            className="mx-auto max-w-3xl rounded-lg border border-border bg-surface px-4 py-3 shadow-md"
            aria-label="Lägg till vara"
          >
            <h2 className="mb-2 text-sm font-display font-semibold text-text">
              Lägg till vara
            </h2>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (newItemName.trim() && defaultCategoryId) {
                  addItemMutation.mutate({ name: newItemName.trim(), category_id: defaultCategoryId })
                }
              }}
            >
              <Input
                placeholder="Namn på vara (läggs i Övrigt)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                aria-label="Namn på vara"
              />
              <Button
                type="submit"
                disabled={!newItemName.trim() || !defaultCategoryId || addItemMutation.isPending}
                className="sm:w-auto w-full"
              >
                {addItemMutation.isPending ? 'Lägger till…' : 'Lägg till'}
              </Button>
            </form>
          </section>
        </div>,
        document.body
      )}
    </div>
  )
}
