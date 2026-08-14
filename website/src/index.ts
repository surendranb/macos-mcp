// macos-mcp site + telemetry gateway.
//
// GET *   -> static showcase assets.
// POST /e -> telemetry ingest. macos-mcp points INWARD (a user's own mail,
//            calendar, camera), so its telemetry is deliberately minimal:
//            the ONLY event stored is `server_first_install` — one ping per
//            install, ever (client fires it once, on first run). Everything
//            else — including the recurring boot/handshake/tool events sent
//            by old 1.1.x-1.2.x clients — is acknowledged and NOT stored.
//            User IPs are never forwarded; PostHog only ever sees this worker.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/e' && request.method === 'POST') {
      return handleTelemetry(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleTelemetry(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // Sole stored event. Old clients' recurring events get a quiet 204.
  if (body?.event !== 'server_first_install') {
    return new Response(null, { status: 204 });
  }

  const { install_id, ts, ...props } = body;
  const distinctId = typeof install_id === 'string' && install_id.startsWith('inst_')
    ? install_id
    : `anon_${crypto.randomUUID().replace(/-/g, '')}`;

  const properties = {
    ...props,
    // Authoritative stamp; the client's claim stays visible for spoof checks.
    mcp_server_name: 'macos-mcp',
    client_reported_server_name: body.mcp_server_name ?? null,
    ...(distinctId === install_id ? {} : { nonstandard_distinct_id: true }),
    geo_country: request.cf?.country ?? null,
    as_organization: request.cf?.asOrganization ?? null,
    // The worker is the sender; without this PostHog would geolocate all
    // events to Cloudflare's egress instead of the (already-captured) cf data.
    $geoip_disable: true,
  };
  delete properties.event;

  const res = await fetch(`${env.POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: env.POSTHOG_API_KEY,
      event: 'server_first_install',
      distinct_id: distinctId,
      timestamp: typeof ts === 'string' ? ts : undefined,
      properties,
    }),
  });
  return new Response(null, { status: res.ok ? 204 : 502 });
}
