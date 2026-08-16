import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string | null
}

export interface Auth {
  /** true once the persisted session (if any) has been restored */
  isReady(): boolean
  getUser(): AuthUser | null
  subscribe(listener: () => void): () => void
  signIn(email: string, password: string): Promise<{ error: string | null }>
  signOut(): Promise<void>
}

/** Email + password auth over supabase-js; a no-op "always signed out" auth in local mode. */
export function createAuth(client: SupabaseClient | null): Auth {
  const listeners = new Set<() => void>()
  let user: AuthUser | null = null
  let ready = !client
  const notify = () => {
    for (const l of listeners) l()
  }

  if (client) {
    client.auth
      .getSession()
      .then(({ data }) => {
        user = data.session?.user ? { id: data.session.user.id, email: data.session.user.email ?? null } : null
      })
      .catch(() => {
        user = null
      })
      .finally(() => {
        ready = true
        notify()
      })
    client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null
      if (next?.id === user?.id && next?.email === user?.email) return
      user = next
      notify()
    })
  }

  return {
    isReady: () => ready,
    getUser: () => user,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async signIn(email, password) {
      if (!client) return { error: 'Cloud sync is not configured for this build.' }
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      return { error: error ? error.message : null }
    },
    async signOut() {
      if (!client) return
      try {
        await client.auth.signOut({ scope: 'local' })
      } catch {
        // ignore — local session is cleared regardless
      }
      if (user) {
        user = null
        notify()
      }
    },
  }
}
