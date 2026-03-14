import { createClient } from '@supabase/supabase-js'

const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

if (!supabaseUrl || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env')
}

/** In dev, use same-origin proxy to avoid CORS preflight (OPTIONS). In prod, use Supabase URL. */
const url =
  import.meta.env.DEV && typeof location !== 'undefined'
    ? `${location.origin}/supabase-proxy`
    : supabaseUrl

export const supabase = createClient(url, publishableKey)

/** Base URL for edge function calls (uses proxy in dev to avoid CORS). */
export function getSupabaseFunctionsUrl(): string {
  return `${url}/functions/v1`
}
