import { useState, type FormEvent } from 'react'
import { LockIcon, LogoIcon } from '../components/Icons'
import { auth, isCloudConfigured } from '../data/app'

export function LoginPage({ checking = false }: { checking?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await auth.signIn(email, password)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  return (
    <main className="login-gate">
      <section className="login-window" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">
          <LogoIcon />
        </div>
        <div>
          <p className="eyebrow">Tennis Marker</p>
          <h1 id="login-title">{checking ? 'Checking your session…' : 'Sign in to continue'}</h1>
          <p className="muted">Your sessions, recording tools, and settings are private.</p>
        </div>
        {!checking && isCloudConfigured && (
          <form className="stack" onSubmit={signIn}>
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && <div className="notice err" role="alert">{error}</div>}
            <button type="submit" className="btn primary block" disabled={busy}>
              <LockIcon open /> {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
        {!checking && !isCloudConfigured && (
          <div className="notice err" role="alert">Login is unavailable because Supabase is not configured for this build.</div>
        )}
        <p className="login-public-note">Public match links remain viewable without signing in.</p>
      </section>
    </main>
  )
}
