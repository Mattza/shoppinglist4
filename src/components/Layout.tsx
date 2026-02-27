import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useLists } from '@/hooks/useLists'
import { cn } from '@/components/ui'

export default function Layout() {
  const { listId } = useParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: lists = [] } = useLists()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-surface to-background">
      <header className="border-b border-border/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <nav
            className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-thin"
            aria-label="Mina listor"
          >
            <Link
              to="/"
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                !listId ? 'bg-white/25 text-surface' : 'text-secondary hover:bg-white/10',
              )}
            >
              Mina listor
            </Link>
            {lists.map((list) => (
              <Link
                key={list.id}
                to={`/list/${list.id}`}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  listId === list.id ? 'bg-white/25 text-surface' : 'text-secondary hover:bg-white/10',
                )}
              >
                {list.name}
              </Link>
            ))}
          </nav>

          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-surface text-lg text-text hover:bg-background"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Öppna meny"
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-44 rounded-lg bg-surface p-1 text-sm text-text shadow-lg"
                role="menu"
              >
                {listId && (
                  <>
                    <Link
                      to={`/list/${listId}`}
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-background"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Lista
                    </Link>
                    <Link
                      to={`/list/${listId}/recommendations`}
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-background"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Rekommendationer
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  className="block w-full rounded-md px-3 py-2 text-left text-red-600 hover:bg-red-50"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    supabase.auth.signOut()
                  }}
                >
                  Logga ut
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
