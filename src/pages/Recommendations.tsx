import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentList } from '@/hooks/useCurrentList'
import { useAuth } from '@/hooks/useAuth'

async function fetchRecommendations(listId: string, accessToken: string): Promise<string[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-recommendations`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ list_id: listId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json.suggestions ?? []
}

export default function Recommendations() {
  const { listId } = useParams<{ listId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [feedbackBySuggestion, setFeedbackBySuggestion] = useState<Record<string, string>>({})
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null)

  const { data: list } = useCurrentList(listId ?? undefined)
  const { data: profile } = useQuery({
    queryKey: ['recommendation_profile', listId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('recommendation_profiles')
        .select('profile_snapshot')
        .eq('user_id', user!.id)
        .eq('list_id', listId!)
        .maybeSingle()
      return data?.profile_snapshot ?? null
    },
    enabled: !!listId && !!user?.id,
  })

  const {
    data: suggestions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['recommendations', listId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token || !listId) return []
      return fetchRecommendations(listId, session.access_token)
    },
    enabled: !!listId && !!user,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', listId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name').eq('list_id', listId!).order('sort_order')
      if (error) throw error
      return data ?? []
    },
    enabled: !!listId,
  })

  const addToListMutation = useMutation({
    mutationFn: async ({ name, categoryId }: { name: string; categoryId: string }) => {
      const { error } = await supabase.from('list_items').insert({
        list_id: listId!,
        category_id: categoryId,
        name,
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list_items', listId] })
    },
  })

  async function submitFeedback(suggestion: string) {
    const feedback = feedbackBySuggestion[suggestion]?.trim()
    if (feedback == null) return
    setSubmittingFeedback(suggestion)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-recommendation-profile`
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          list_id: listId,
          recommendation_text: suggestion,
          user_feedback: feedback,
          profile_snapshot: profile ?? null,
        }),
      })
      queryClient.invalidateQueries({ queryKey: ['recommendation_profile', listId, user?.id] })
      setFeedbackBySuggestion((prev) => ({ ...prev, [suggestion]: '' }))
    } finally {
      setSubmittingFeedback(null)
    }
  }

  return (
    <div className="recommendations-page">
      <h1>Rekommendationer</h1>
      {list && <p className="list-name">För listan: {list.name}</p>}
      <p className="hint">Förslag baserat på vad du tidigare tagit bort från listan. Lägg till det du vill och skriv gärna vad du tycker om förslagen så blir nästa rekommendation bättre.</p>

      {isLoading ? (
        <p>Laddar rekommendationer...</p>
      ) : suggestions.length === 0 ? (
        <p className="empty">Inga rekommendationer än. Ta bort några varor från listan så bygger vi upp ett arkiv.</p>
      ) : (
        <ul className="suggestions-list">
          {suggestions.map((s) => (
            <li key={s} className="suggestion-item">
              <span className="suggestion-text">{s}</span>
              <div className="suggestion-actions">
                {categories.length > 0 && (
                  <select
                    className="category-select"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (id) addToListMutation.mutate({ name: s, categoryId: id })
                    }}
                    disabled={addToListMutation.isPending}
                  >
                    <option value="">Välj kategori och lägg till</option>
                    {(categories as { id: string; name: string }[]).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <div className="feedback-row">
                  <input
                    placeholder="Vad tycker du? (t.ex. bra/redan köpt)"
                    value={feedbackBySuggestion[s] ?? ''}
                    onChange={(e) => setFeedbackBySuggestion((prev) => ({ ...prev, [s]: e.target.value }))}
                    onBlur={() => {
                      const fb = feedbackBySuggestion[s]?.trim()
                      if (fb) submitFeedback(s)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => submitFeedback(s)}
                    disabled={!feedbackBySuggestion[s]?.trim() || submittingFeedback === s}
                  >
                    {submittingFeedback === s ? 'Sparar...' : 'Spara feedback'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="refetch-btn" onClick={() => refetch()} disabled={isLoading}>
        Uppdatera rekommendationer
      </button>
    </div>
  )
}
