import { Navigate, Route, Routes } from 'react-router'
import { DashboardPage } from './pages/DashboardPage'
import { RecordPage } from './pages/RecordPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SharedMatchPage } from './pages/SharedMatchPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SessionsPage />} />
      <Route path="/session/:id" element={<RecordPage />} />
      <Route path="/share/:payload" element={<SharedMatchPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/stats" element={<Navigate to="/dashboard" replace />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
