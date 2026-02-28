import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useLists } from '@/hooks/useLists'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Card } from '@/components/Card'

export default function Lists() {
  const [newName, setNewName] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data: lists = [], isLoading } = useLists()

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user?.id) throw new Error('Du måste vara inloggad')
      const { data, error } = await supabase
        .from('lists')
        .insert({ name, owner_id: user.id })
        .select('id, slug')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      if (row?.slug) navigate(`/list/${row.slug}`)
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate(newName.trim())
    setNewName('')
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-text font-semibold">
        Laddar listor...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-display font-semibold text-text">
          Mina listor
        </h1>
        <p className="text-sm text-text-muted">
          Skapa separata listor för olika butiker eller projekt.
        </p>
      </header>

      <Card>
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input
            placeholder="Namn på ny lista"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Namn på ny lista"
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !user}
            className="sm:w-auto w-full"
          >
            Skapa lista
          </Button>
        </form>
      </Card>

      <ul className="grid gap-4 md:grid-cols-2">
        {lists.map((list) => (
          <li key={list.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-sm transition hover:border-primary hover:shadow-md"
              onClick={() => navigate(`/list/${list.slug}`)}
            >
              <span className="font-semibold text-text truncate">
                {list.name}
              </span>
              <span className="ml-3 shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-text-muted">
                {list.role === 'owner' ? 'Ägare' : 'Medlem'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lists.length === 0 && (
        <p className="text-sm text-text-muted">
          Du har inga listor än. Skapa en ovan.
        </p>
      )}
    </div>
  )
}
