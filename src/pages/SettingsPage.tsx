import { useMemo, useRef, useState, type FormEvent } from 'react'
import { downloadText, formatDate, formatTime } from '../lib/format'
import { DownloadIcon, RefreshIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { usePlayer } from '../components/hooks'
import { auth, isCloudConfigured, store, sync, useAppState, useAuthUser, useSyncStatus } from '../data/app'
import { pendingCount } from '../data/store'
import { parseExportBundle, safeFilename, toExportBundle } from '../domain/export'
import { checkForUpdate, reinstallApp } from '../data/appUpdate'
import { cleanOpponent, opponentRowsWithRoster, type OpponentRow } from '../domain/session'

declare const __APP_VERSION__: string

export function SettingsPage() {
  const state = useAppState()
  const player = usePlayer()
  const status = useSyncStatus()
  const { user, ready } = useAuthUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = pendingCount(state)
  const foreign = store.foreignCount()
  const unsyncable = store.unsyncableCount()

  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await auth.signIn(email, password)
    setBusy(false)
    if (r.error) setError(r.error)
    else {
      setPassword('')
      setMsg('Signed in — syncing…')
    }
  }

  const signOut = async (clearDevice: boolean) => {
    if (pending > 0 && !confirm(`${pending} change${pending === 1 ? '' : 's'} not uploaded yet. Sign out anyway?`)) return
    if (clearDevice && !confirm('Remove all sessions and points from this device? (They stay in the cloud.)')) return
    await auth.signOut()
    if (clearDevice) store.clearAll()
    setMsg(clearDevice ? 'Signed out and cleared this device.' : 'Signed out. Data stays on this device.')
  }

  const exportJson = () => {
    const bundle = toExportBundle(Object.values(state.sessions), Object.values(state.points))
    downloadText(safeFilename('tennis-marker-backup', 'json'), JSON.stringify(bundle, null, 2), 'application/json')
  }

  const importJson = async (file: File) => {
    try {
      const bundle = parseExportBundle(await file.text())
      const added = store.importRows(bundle.sessions, bundle.points)
      setMsg(added ? `Imported ${added} item${added === 1 ? '' : 's'}.` : 'Nothing new to import — everything was already here.')
      void sync.flush()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Shell title="Settings">
      <div className="stack">
        <section className="card">
          <div className="section-title">Cloud sync</div>
          {!isCloudConfigured ? (
            <div className="notice info">
              <strong>Local-only mode.</strong> Data is saved in this browser only. To sync between phone and desktop, configure Supabase (see the README) and redeploy.
            </div>
          ) : !ready ? (
            <p className="muted">Checking sign-in…</p>
          ) : user ? (
            <div className="stack">
              <div className="status-line">
                <span>
                  Signed in as <strong>{user.email ?? user.id}</strong>
                </span>
              </div>
              <div className="status-line muted">
                <span>{describeStatus(status.phase)}</span>
                {status.lastSyncAt && <span>· last sync {formatTime(status.lastSyncAt)}</span>}
                {pending > 0 && <span>· {pending} unsynced</span>}
              </div>
              {status.error && <div className="notice err">{status.error}</div>}
              {unsyncable > 0 && (
                <div className="notice">
                  <strong>{unsyncable}</strong> item{unsyncable === 1 ? '' : 's'} on this device can’t be uploaded — they were created
                  outside the app and their ids aren’t in the cloud’s format. Everything else syncs normally.
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() => {
                        if (!confirm(`Delete ${unsyncable} item${unsyncable === 1 ? '' : 's'} that can’t sync? They only exist on this device.`)) return
                        setMsg(`Removed ${store.dropUnsyncable()} item(s) that could not sync.`)
                        void sync.flush()
                      }}
                    >
                      Remove them
                    </button>
                  </div>
                </div>
              )}
              {foreign > 0 && (
                <div className="notice">
                  This device has <strong>{foreign}</strong> item{foreign === 1 ? '' : 's'} from a different account.
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    <button type="button" className="btn sm" onClick={() => setMsg(`Copied ${store.copyForeignToOwner()} items into this account.`)}>
                      Upload as copies
                    </button>
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() => {
                        store.dropForeign()
                        setMsg('Removed the other account’s data from this device.')
                      }}
                    >
                      Remove from device
                    </button>
                  </div>
                </div>
              )}
              <div className="row wrap">
                <button type="button" className="btn" onClick={() => void sync.sync(true)}>
                  Sync now
                </button>
                <button type="button" className="btn ghost" onClick={() => void signOut(false)}>
                  Sign out
                </button>
                <button type="button" className="btn ghost" onClick={() => void signOut(true)}>
                  Sign out &amp; clear device
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={signIn} className="stack">
              <p className="muted">Sign in to sync between your phone and desktop. Recording works offline either way.</p>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="field">
                <span>Password</span>
                <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {error && <div className="notice err">{error}</div>}
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              {pending > 0 && <p className="kbd-hint">{pending} local item{pending === 1 ? '' : 's'} will upload after you sign in.</p>}
            </form>
          )}
        </section>

        <PlayerName />

        <AppVersion />

        <Opponents />

        <section className="card">
          <div className="section-title">Data</div>
          <div className="row wrap">
            <button type="button" className="btn" onClick={exportJson}>
              <DownloadIcon /> Backup (JSON)
            </button>
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
              Import backup…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importJson(f)
                e.target.value = ''
              }}
            />
          </div>
          <p className="kbd-hint" style={{ marginTop: 10 }}>
            {Object.values(state.sessions).filter((s) => !s.deleted_at).length} sessions · {Object.values(state.points).filter((p) => !p.deleted_at).length} points on this device.
          </p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {confirmClear ? (
              <>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    store.clearAll()
                    setConfirmClear(false)
                    setMsg('Cleared this device.')
                  }}
                >
                  Really clear this device?
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirmClear(true)}>
                Clear device data
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="section-title">Tips</div>
          <ul className="stack" style={{ paddingLeft: 18, listStyle: 'disc' }}>
            <li>
              <strong>Install it</strong>: on iPhone, Share → “Add to Home Screen”; on Android/desktop Chrome, use “Install app”. Installed apps keep data longer and open full-screen.
            </li>
            <li>
              <strong>Flip ends</strong> when {player.subject} plays the far side, so you tap what you see. Data is always stored from {player.possessive} point of view.
            </li>
            <li>
              <strong>2 taps per point</strong>: tap the court, then one of the six buttons. Toggle “Forced” only when needed.
            </li>
          </ul>
        </section>

        {msg && <div className="notice info">{msg}</div>}
        {error && !isCloudConfigured && <div className="notice err">{error}</div>}
        <p className="kbd-hint">
          Tennis Marker v{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'} ·{' '}
          <a href="https://github.com/rokey-z/tennis-marker" target="_blank" rel="noreferrer">
            source
          </a>
        </p>
      </div>
    </Shell>
  )
}



function PlayerName() {
  const state = useAppState()
  const [name, setName] = useState(state.meta.playerName)

  return (
    <section className="card">
      <div className="section-title">Player</div>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Player name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            store.setPlayerName(e.target.value)
          }}
          placeholder="e.g. Lily"
          autoComplete="off"
          autoCapitalize="words"
        />
      </label>
      <p className="kbd-hint" style={{ marginTop: 8 }}>
        Used throughout the app — the court label, hints and tooltips. Kept on this device.
      </p>
    </section>
  )
}

function AppVersion() {
  const [state, setState] = useState<'idle' | 'checking' | 'current' | 'updating' | 'unsupported'>('idle')

  const check = async () => {
    setState('checking')
    const r = await checkForUpdate()
    setState(r)
    // a new worker installs in the background; reload once it has had a moment to take over
    if (r === 'updating') setTimeout(() => location.reload(), 1200)
  }

  return (
    <section className="card">
      <div className="section-title">App</div>
      <div className="status-line">
        <span>
          Version <strong>{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}</strong>
        </span>
      </div>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button type="button" className="btn primary" onClick={() => void check()} disabled={state === 'checking' || state === 'updating'}>
          <RefreshIcon /> {state === 'checking' ? 'Checking…' : state === 'updating' ? 'Updating…' : 'Check for updates'}
        </button>
        <button type="button" className="btn ghost" onClick={() => void reinstallApp()}>
          Force refresh
        </button>
      </div>
      {state === 'current' && <div className="notice ok" style={{ marginTop: 10 }}>You are on the latest version.</div>}
      {state === 'updating' && <div className="notice info" style={{ marginTop: 10 }}>New version found — reloading…</div>}
      {state === 'unsupported' && <div className="notice" style={{ marginTop: 10 }}>This browser is not running the installed app, so there is nothing to update — just reload the page.</div>}
      <p className="kbd-hint" style={{ marginTop: 10 }}>
        Use this instead of reinstalling: “Force refresh” clears the cached app and loads the newest build. Your sessions and
        points are untouched.
      </p>
    </section>
  )
}

function Opponents() {
  const state = useAppState()
  const rows = useMemo(() => opponentRowsWithRoster(Object.values(state.sessions), state.meta.roster), [state.sessions, state.meta.roster])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    const name = cleanOpponent(newName)
    if (!name) return
    const ok = store.addRosterOpponent(name)
    setNewName('')
    setNote(ok ? `Added ${name}.` : `${name} is already on the list.`)
  }

  const startEdit = (o: OpponentRow) => {
    setEditing(o.key)
    setDraft(o.name)
    setNote(null)
  }
  const saveEdit = (o: OpponentRow) => {
    const name = cleanOpponent(draft)
    setEditing(null)
    if (!name || name === o.name) return
    const merged = rows.some((r) => r.key !== o.key && r.name.toLowerCase() === name.toLowerCase())
    const n = store.renameOpponent(o.name, name)
    setNote(merged ? `Merged into ${name} (${n} session${n === 1 ? '' : 's'}).` : `Renamed to ${name} (${n} session${n === 1 ? '' : 's'}).`)
  }
  const remove = (o: OpponentRow) => {
    const q = o.sessions === 0 ? `Remove "${o.name}" from the list?` : `Remove "${o.name}" from ${o.sessions} session${o.sessions === 1 ? '' : 's'}? The sessions and points are kept.`
    if (!confirm(q)) return
    const n = store.clearOpponent(o.name)
    setNote(`Cleared ${o.name} from ${n} session${n === 1 ? '' : 's'}.`)
  }

  return (
    <section className="card">
      <div className="section-title">Opponents</div>
      <form className="row add-row" onSubmit={add}>
        <input className="input grow" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add an opponent…" autoComplete="off" autoCapitalize="words" enterKeyHint="done" />
        <button type="submit" className="btn primary" disabled={!cleanOpponent(newName)}>
          Add
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">No opponents yet — add one above, or set one when you start a match.</p>
      ) : (
        <ul className="opponent-list">
          {rows.map((o) => (
            <li key={o.key}>
              {editing === o.key ? (
                <>
                  <input
                    className="input grow"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(o)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                  <button type="button" className="btn sm primary" onClick={() => saveEdit(o)}>
                    Save
                  </button>
                  <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="grow">
                    <div className="o-name">{o.name}</div>
                    <div className="o-sub muted">
                      {o.sessions === 0 ? (
                        'Not used yet · this device'
                      ) : (
                        <>
                          {o.sessions} session{o.sessions === 1 ? '' : 's'}
                          {o.matches > 0 ? ` · ${o.matches} match${o.matches === 1 ? '' : 'es'}` : ''} · last {formatDate(o.lastDate)}
                        </>
                      )}
                    </div>
                  </div>
                  <button type="button" className="btn sm ghost" onClick={() => startEdit(o)}>
                    Rename
                  </button>
                  <button type="button" className="btn sm danger" onClick={() => remove(o)}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && <div className="notice ok" style={{ marginTop: 10 }}>{note}</div>}
      <p className="kbd-hint" style={{ marginTop: 10 }}>
        Renaming updates every session with that opponent; renaming onto an existing name merges them.
        Names added here stay on this device until you record a session with them.
      </p>
    </section>
  )
}

function describeStatus(phase: ReturnType<typeof useSyncStatus>['phase']): string {
  switch (phase) {
    case 'idle':
      return 'Up to date'
    case 'syncing':
      return 'Syncing…'
    case 'offline':
      return 'Offline — changes will upload when back online'
    case 'error':
      return 'Sync problem'
    case 'signed-out':
      return 'Signed out'
    default:
      return 'Local only'
  }
}
