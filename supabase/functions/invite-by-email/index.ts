import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller } } = await supabaseAnon.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })

    const { list_id, email } = (await req.json()) as { list_id?: string; email?: string }
    if (!list_id || !email?.trim()) return new Response(JSON.stringify({ error: 'list_id and email required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    const { data: membership } = await supabaseAnon.from('list_members').select('role').eq('list_id', list_id).eq('user_id', caller.id).single()
    if (membership?.role !== 'owner') return new Response(JSON.stringify({ error: 'Only the list owner can invite' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const emailFilter = encodeURIComponent(`email.eq.${email.trim().toLowerCase()}`)
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?filter=${emailFilter}`, {
      headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` },
    })
    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: 'Could not look up user', details: err }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const usersJson = await res.json()
    const byEmail = Array.isArray(usersJson) ? usersJson[0] : usersJson?.users?.[0]
    if (!byEmail?.id) {
      return new Response(JSON.stringify({ error: 'No user found with that email. They need to sign up first.' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (byEmail.id === caller.id) return new Response(JSON.stringify({ error: 'You are already on the list' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const { error: insertError } = await supabaseAdmin.from('list_members').insert({ list_id, user_id: byEmail.id, role: 'member' })
    if (insertError) {
      if (insertError.code === '23505') return new Response(JSON.stringify({ error: 'User is already a member' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
