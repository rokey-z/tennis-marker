import { useSyncExternalStore } from 'react'
import { createAuth, type AuthUser } from './auth'
import { STORAGE_KEY, memoryStorage, type StorageLike } from './localRepo'
import { createStore, useStoreState, type Store } from './store'
import { createSupabase, createSupabaseRemote, isCloudConfigured } from './supabaseClient'
import { createSyncEngine, type SyncStatus } from './syncEngine'

function pickStorage(): StorageLike {
  try {
    const s = window.localStorage
    s.setItem('tennis-marker.probe', '1')
    s.removeItem('tennis-marker.probe')
    return s
  } catch {
    console.warn('localStorage unavailable — data will not persist across reloads')
    return memoryStorage()
  }
}

export const store: Store = createStore(pickStorage())
export const supabase = createSupabase()
export const auth = createAuth(supabase)
export const sync = createSyncEngine({
  store,
  remote: supabase ? createSupabaseRemote(supabase) : null,
  getUserId: () => auth.getUser()?.id ?? null,
})
export { isCloudConfigured }

let started = false
/** Idempotent app bootstrap: wire auth → store owner → sync; multi-tab reload. */
export function startApp(): void {
  if (started) return
  started = true
  const applyUser = () => {
    const u = auth.getUser()
    store.setOwner(u?.id ?? null)
    sync.onAuthChanged()
  }
  auth.subscribe(applyUser)
  if (auth.isReady()) applyUser()
  sync.start()
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) store.reload()
  })
}

// ---------- hooks ----------

export function useAppState() {
  return useStoreState(store)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(sync.subscribe, sync.getStatus, sync.getStatus)
}

export function useAuthUser(): { user: AuthUser | null; ready: boolean } {
  const user = useSyncExternalStore(auth.subscribe, auth.getUser, auth.getUser)
  const ready = useSyncExternalStore(auth.subscribe, auth.isReady, auth.isReady)
  return { user, ready }
}
