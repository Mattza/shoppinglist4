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

  const defaultCategoryId =
    categories.find((c) => c.name === 'Övrigt')?.id ?? categories[0]?.id ?? ''

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
    mutationFn: async (name: string) => {
      if (!listId || !defaultCategoryId) throw new Error('Ingen standardkategori tillgänglig')
      const { error } = await supabase.from('list_items').insert({
        list_id: listId,
        category_id: defaultCategoryId,
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
    <div className="relative mx-auto max-w-3xl space-y-8 pb-8">
      {list?.role === 'owner' && (
        <div className="flex justify-end">
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
        </div>
      )}

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
          <h2 className="text-xl font-display font-bold text-[#1f2937]">
            Varor i kategorier
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Håll din lista organiserad genom att gruppera varor per kategori.
          </p>
        </div>
        <div className="space-y-4">
          {itemsByCategory.map(({ category: cat, items: catItems }) => (
            <div
              key={cat.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-semibold text-[#1f2937]">
                  {cat.name}
                </h3>
                {!DEFAULT_CATEGORY_NAMES.includes(cat.name) && (
                  <button
                    type="button"
                    className="text-sm text-[#6b7280] hover:text-red-700 hover:bg-red-50 rounded-md px-2 py-1"
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
                className="divide-y divide-gray-100"
              >
                {catItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="font-medium text-[#374151]">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-[#374151]"
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
            </div>
          ))}
        </div>
        {categories.length === 0 && (
          <p className="text-sm text-[#6b7280]">
            Inga kategorier än. Lägg till en nedan.
          </p>
        )}
      </section>

      {/* Lägg till kategori */}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
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
          className="w-full sm:w-60 border-gray-200"
        />
        <button
          type="submit"
          disabled={addCategoryMutation.isPending}
          className="text-sm font-medium text-[#2563eb] hover:underline disabled:opacity-50"
        >
          Lägg till kategori
        </button>
      </form>

      {/* AI-kategorisering */}
      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 mb-24">
        <div className="flex items-center gap-2">
          <span className="text-[#1f2937]" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </span>
          <h2 className="text-base font-display font-semibold text-[#1f2937]">
            AI-kategorisering
          </h2>
        </div>
        <p className="text-sm text-[#6b7280]">
          Skriv eller klistra in varor i en per rad eller separerade med komma. Klicka för att automatiskt lägga till dem i listans kategorier.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAiCategorize()
          }}
          className="space-y-2"
        >
          <textarea
            className="block w-full min-h-[80px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#374151] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            placeholder="t.ex. mjölk, äpple, bröd"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            rows={3}
            aria-label="Varor att kategorisera med AI"
          />
          <button
            type="submit"
            disabled={aiLoading || !aiInput.trim()}
            className="text-sm font-medium text-[#2563eb] hover:underline disabled:opacity-50"
          >
            {aiLoading ? 'Kategoriserar…' : 'Kategorisera med AI'}
          </button>
        </form>
      </section>

      <p className="mt-4 text-sm text-[#6b7280]">
        <Link
          className="font-semibold text-[#2563eb] hover:underline"
          to={`/list/${listId}/recommendations`}
        >
          Rekommendationer
        </Link>{' '}
        baserat på arkivet
      </p>

      {/* Sticky add bar at bottom */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <form
            className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault()
              if (newItemName.trim() && defaultCategoryId) {
                addItemMutation.mutate(newItemName.trim())
              }
            }}
          >
            <label className="flex-1 text-sm text-[#374151]">
              <span className="mb-1 block font-medium">
                Lägg till vara
              </span>
              <Input
                placeholder="t.ex. mjölk, bröd, äpplen… (läggs i Övrigt)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                aria-label="Namn på vara"
                className="border-gray-200"
              />
            </label>
            <div className="flex sm:w-auto w-full justify-end">
              <button
                type="submit"
                disabled={!newItemName.trim() || !defaultCategoryId || addItemMutation.isPending}
                className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addItemMutation.isPending ? 'Lägger till…' : 'Lägg till i Övrigt'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  )
}
