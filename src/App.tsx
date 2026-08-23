import { Navigate, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from './pages/LoginPage'
import { useAuthUser } from './data/app'
import { DashboardPage } from './pages/DashboardPage'
import { RecordPage } from './pages/RecordPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharedMatchPage } from './pages/SharedMatchPage'

export default function App() {
  return (
    <Routes>
      <Route path="/share/:payload" element={<SharedMatchPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<SessionsPage />} />
        <Route path="/session/:id" element={<RecordPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/stats" element={<Navigate to="/dashboard" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function RequireAuth() {
  const { user, ready } = useAuthUser()
  if (!ready) return <LoginPage checking />
  if (!user) return <LoginPage />
  return <Outlet />
}
