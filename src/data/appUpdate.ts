export type UpdateResult = 'updating' | 'current' | 'unsupported'

/**
 * Ask the service worker to look for a new build. With `registerType: 'autoUpdate'` a newly
 * installed worker takes over by itself, so all the page has to do is reload afterwards.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  const regs = await navigator.serviceWorker.getRegistrations()
  if (!regs.length) return 'unsupported'
  let pending = false
  await Promise.all(
    regs.map(async (r) => {
      try {
        await r.update()
      } catch {
        /* offline — nothing to do */
      }
      if (r.waiting || r.installing) pending = true
    }),
  )
  return pending ? 'updating' : 'current'
}

/**
 * The "why am I still on the old version" button: drop every cached asset and the service worker,
 * then reload. Sessions and points live in localStorage (and the cloud), so nothing is lost.
 */
export async function reinstallApp(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* best effort — reload anyway */
  }
  location.reload()
}
