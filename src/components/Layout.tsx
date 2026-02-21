import { Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Link, useParams } from 'react-router-dom'

export default function Layout() {
  const { user } = useAuth()
  const { listId } = useParams()

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">Handlarlista</Link>
          <nav>
            {listId && (
              <>
                <Link to={`/list/${listId}`}>Lista</Link>
                <Link to={`/list/${listId}/recommendations`}>Rekommendationer</Link>
              </>
            )}
          </nav>
          <div className="user">
            <span>{user?.email}</span>
            <button type="button" onClick={() => supabase.auth.signOut()}>Logga ut</button>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
