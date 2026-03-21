import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Lists from '@/pages/Lists'
import ListView from '@/pages/ListView'
import Recommendations from '@/pages/Recommendations'
import WeeklyMenu from '@/pages/WeeklyMenu'
import ListRecipes from '@/pages/ListRecipes'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="loading">Laddar...</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Lists />} />
          <Route path="list/:listSlug" element={<ListView />} />
          <Route path="list/:listSlug/recommendations" element={<Recommendations />} />
          <Route path="list/:listSlug/veckomeny" element={<WeeklyMenu />} />
          <Route path="list/:listSlug/recept" element={<ListRecipes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
