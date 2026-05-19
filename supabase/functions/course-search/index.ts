import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOLF_API_KEY  = Deno.env.get('GOLF_COURSE_API_KEY') ?? ''
const SUPA_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPA_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CACHE_TTL_MS  = 30 * 24 * 60 * 60 * 1000 // 30 days

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { query } = await req.json()
    if (!query || query.trim().length < 2) return json({ error: 'query required (min 2 chars)' }, 400)
    if (!GOLF_API_KEY) return json({ error: 'GOLF_COURSE_API_KEY is not configured' }, 500)
    if (!SUPA_URL || !SUPA_SVC_KEY) return json({ error: 'Supabase service credentials are not configured' }, 500)

    const db = createClient(SUPA_URL, SUPA_SVC_KEY)
    const cacheKey = `search:${query.toLowerCase().trim()}`

    // Check cache first
    const { data: cached } = await db
      .from('courses_cache')
      .select('data, cached_at')
      .eq('cache_key', cacheKey)
      .single()

    if (cached) {
      const age = Date.now() - new Date(cached.cached_at).getTime()
      if (age < CACHE_TTL_MS) {
        return json({ courses: cached.data, cached: true })
      }
    }

    // Fetch from GolfCourseAPI
    const apiRes = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query.trim())}`,
      {
        headers: { 'Authorization': `Key ${GOLF_API_KEY}` },
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!apiRes.ok) return json({ error: `Course API error ${apiRes.status}` }, 502)

    const apiData = await apiRes.json()
    const courses = (apiData.courses || []).map(normalizeCourse)

    // Store in cache
    await db.from('courses_cache').upsert({
      cache_key: cacheKey,
      data: courses,
      cached_at: new Date().toISOString(),
    })

    return json({ courses, cached: false })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function normalizeCourse(c: Record<string, unknown>) {
  const tees = (c.tees as Record<string, unknown>) || {}
  return {
    id:         c.id,
    clubName:   c.club_name,
    courseName: c.course_name,
    location:   normalizeLocation(c.location),
    tees: {
      male:   ((tees.male   as unknown[]) || []).map((tee) => normalizeTee(tee, 'Men')),
      female: ((tees.female as unknown[]) || []).map((tee) => normalizeTee(tee, 'Women')),
    },
  }
}

function normalizeLocation(location: unknown) {
  if (!location) return ''
  if (typeof location === 'string') return location
  if (typeof location !== 'object') return String(location)

  const loc = location as Record<string, unknown>
  return [
    loc.city,
    loc.state,
    loc.state_code,
    loc.country,
  ]
    .filter(Boolean)
    .map(String)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(', ')
}

function normalizeTee(t: unknown, gender: string) {
  const tee = t as Record<string, unknown>
  return {
    name:     tee.tee_name,
    gender,
    rating:   tee.course_rating,
    slope:    tee.slope_rating,
    parTotal: tee.par_total,
    yards:    tee.total_yards,
    holes:    ((tee.holes as unknown[]) || []).map((h: Record<string, unknown>) => ({
      par:     h.par,
      yardage: h.yardage,
      si:      h.handicap,
    })),
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
