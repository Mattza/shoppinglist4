import { useState, useRef, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Link, useParams } from 'react-router-dom'
import { useLists } from '@/hooks/useLists'

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
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <nav className="header-tabs" aria-label="Mina listor">
            <Link
              to="/"
              className={`header-tab ${!listId ? 'header-tab--active' : ''}`}
            >
              Mina listor
            </Link>
            {lists.map((list) => (
              <Link
                key={list.id}
                to={`/list/${list.id}`}
                className={`header-tab ${listId === list.id ? 'header-tab--active' : ''}`}
              >
                {list.name}
              </Link>
            ))}
          </nav>

          <div className="header-actions" ref={menuRef}>
            <button
              type="button"
              className="header-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Öppna meny"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="header-dropdown" role="menu">
                {listId && (
                  <>
                    <Link
                      to={`/list/${listId}`}
                      className="header-dropdown-item"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Lista
                    </Link>
                    <Link
                      to={`/list/${listId}/recommendations`}
                      className="header-dropdown-item"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Rekommendationer
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  className="header-dropdown-item header-dropdown-item--button"
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
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
