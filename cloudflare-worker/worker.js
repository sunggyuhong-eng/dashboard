const corsHeaders = (origin, allowedOrigin) => ({
  'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status,
  headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
})

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://sunggyuhong-eng.github.io'
    const cors = corsHeaders(origin, allowedOrigin)

    if (request.method === 'OPTIONS') {
      return origin === allowedOrigin ? new Response(null, { status: 204, headers: cors }) : json({ ok: false, error: '허용되지 않은 사이트입니다.' }, 403, cors)
    }
    if (request.method !== 'POST' || origin !== allowedOrigin) {
      return json({ ok: false, error: '허용되지 않은 요청입니다.' }, 403, cors)
    }

    let body = {}
    try { body = await request.json() } catch { /* 아래에서 잘못된 요청으로 처리 */ }
    if (body.action !== 'sync') return json({ ok: false, error: '잘못된 동기화 요청입니다.' }, 400, cors)

    const cooldownRequest = new Request('https://kong-dashboard-refresh.internal/cooldown')
    const cached = await caches.default.match(cooldownRequest)
    if (cached) return json({ ok: true, alreadyRunning: true }, 202, cors)

    const owner = env.GITHUB_OWNER || 'sunggyuhong-eng'
    const repository = env.GITHUB_REPOSITORY || 'dashboard'
    const workflow = env.GITHUB_WORKFLOW || 'sync-and-deploy.yml'
    if (!env.GITHUB_ACTIONS_TOKEN) return json({ ok: false, error: 'Worker에 GitHub 토큰이 설정되지 않았습니다.' }, 500, cors)

    const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        'User-Agent': 'kong-recruiting-dashboard-refresh',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    })

    if (!githubResponse.ok) {
      const detail = await githubResponse.text()
      return json({ ok: false, error: `GitHub Actions 실행 요청 실패 (${githubResponse.status})`, detail: detail.slice(0, 300) }, 502, cors)
    }
    await caches.default.put(cooldownRequest, new Response('1', { headers: { 'Cache-Control': 'max-age=60' } }))
    return json({ ok: true }, 202, cors)
  },
}
