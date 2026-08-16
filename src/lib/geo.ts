export interface Coords {
  lat: number
  lon: number
}

const R_M = 6_371_000

/** Great-circle distance in metres. */
export function distanceM(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(m: number, metric = guessMetric()): string {
  if (!Number.isFinite(m)) return ''
  if (metric) return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`
  const feet = m * 3.28084
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`
  const miles = m / 1609.344
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
}

function guessMetric(): boolean {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? ''
    return !['US', 'LR', 'MM', 'GB'].includes(region)
  } catch {
    return true
  }
}

/** Coordinates rounded to ~11 m — enough for a nearby search, less precise than what the device knows. */
export function coarse(c: Coords, decimals = 4): Coords {
  const f = 10 ** decimals
  return { lat: Math.round(c.lat * f) / f, lon: Math.round(c.lon * f) / f }
}

export interface GeolocateOptions {
  timeoutMs?: number
  maximumAgeMs?: number
}

/** Promise wrapper around the Geolocation API with plain-language errors. */
export function currentPosition({ timeoutMs = 12_000, maximumAgeMs = 300_000 }: GeolocateOptions = {}): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device has no location support.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — allow it, or type the name.'
            : err.code === err.TIMEOUT
              ? 'Location timed out — try again outdoors, or type the name.'
              : 'Could not get your location — type the name instead.'
        reject(new Error(msg))
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: maximumAgeMs },
    )
  })
}
