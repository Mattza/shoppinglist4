import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Card } from '@/components/Card'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError(null)
        alert('Kontrollera din e-post för bekräftelselänk.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/', { replace: true })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      })
      if (error) throw error
      if (data?.url) window.location.href = data.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Något gick fel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-semibold text-text">
            Handlarlista
          </h1>
          <p className="text-sm text-text-muted">
            Logga in för att använda appen
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full justify-center"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? 'Vänta...' : 'Logga in med Google'}
        </Button>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="h-px flex-1 bg-border" />
          <span>eller</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">
              E-post
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">
              Lösenord
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full justify-center" disabled={loading}>
            {loading ? 'Vänta...' : isSignUp ? 'Skapa konto' : 'Logga in'}
          </Button>
        </form>

        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => setIsSignUp((v) => !v)}
        >
          {isSignUp ? 'Har du konto? Logga in' : 'Skapa konto'}
        </button>
      </Card>
    </div>
  )
}
