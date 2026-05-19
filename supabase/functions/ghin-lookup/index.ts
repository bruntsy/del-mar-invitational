import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { ghin } = await req.json()
    if (!ghin) return json({ error: 'ghin required' }, 400)

    // Step 1: get a guest token from GHIN
    const loginRes = await fetch('https://api2.ghin.com/api/v1/golfer_login.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ user: { token_type: 'guest', source_code: 'GHINcomMobile' } }),
    })

    if (!loginRes.ok) return json({ error: `GHIN auth failed (${loginRes.status})` }, 502)
    const loginData = await loginRes.json()
    const token = loginData.golfer_user_token || loginData.token
    if (!token) return json({ error: 'No token in GHIN response' }, 502)

    // Step 2: look up the golfer
    const golferRes = await fetch(
      `https://api2.ghin.com/api/v1/golfers.json?ghin=${encodeURIComponent(ghin)}&per_page=1`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    )

    if (!golferRes.ok) return json({ error: `GHIN lookup failed (${golferRes.status})` }, golferRes.status)
    const data = await golferRes.json()
    const g = data?.golfers?.[0]
    if (!g) return json({ error: 'GHIN number not found' }, 404)

    return json({
      ghin:            g.ghin,
      name:            `${g.first_name} ${g.last_name}`.trim(),
      handicap_index:  g.handicap_index ?? g.display_handicap,
      club:            g.club_name,
      state:           g.state,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
