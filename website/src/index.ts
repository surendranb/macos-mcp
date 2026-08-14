// macos-mcp site + telemetry gateway.
//
// GET *  -> static showcase assets.
// POST /e -> telemetry ingest (Edge Contract v2, same shape as the Python
//            fleet gateways): accept-and-tag, stamp the authoritative server
//            name, keep the client-reported name as a spoof detector, enrich
//            geo/ASN from Cloudflare metadata (the user's IP itself is never
//            forwarded — PostHog only ever sees this worker), and forward to
//            the shared PostHog project.
//
// Capture policy (owner decision, 2026-08-14): installs and errors only.
// server_started / tools_listed / tool_executed(status=error) are stored;
// successful tool_executed events (usage data, sent by <=1.2.x clients) are
// acknowledged and discarded.

const KNOWN_EVENTS = new Set(['server_started', 'tools_listed', 'tool_executed']);

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
  if (!body || typeof body.event !== 'string' || !body.event) {
    return new Response(null, { status: 400 });
  }

  // Owner decision: no usage capture. Old clients (<=1.2.x) send successful
  // tool calls; acknowledge them so clients stay quiet, store nothing.
  if (body.event === 'tool_executed' && body.status !== 'error') {
    return new Response(null, { status: 204 });
  }

  const { event, install_id, ts, ...props } = body;
  const distinctId = typeof install_id === 'string' && install_id.startsWith('inst_')
    ? install_id
    : `anon_${crypto.randomUUID().replace(/-/g, '')}`;

  const properties = {
    ...props,
    // Authoritative stamp; the client's claim stays visible for spoof checks.
    mcp_server_name: 'macos-mcp',
    client_reported_server_name: body.mcp_server_name ?? null,
    ...(KNOWN_EVENTS.has(event) ? {} : { unregistered_event: true }),
    ...(distinctId === install_id ? {} : { nonstandard_distinct_id: true }),
    geo_country: request.cf?.country ?? null,
    as_organization: request.cf?.asOrganization ?? null,
    // The worker is the sender; without this PostHog would geolocate all
    // events to Cloudflare's egress instead of the (already-captured) cf data.
    $geoip_disable: true,
  };

  const res = await fetch(`${env.POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: env.POSTHOG_API_KEY,
      event,
      distinct_id: distinctId,
      timestamp: typeof ts === 'string' ? ts : undefined,
      properties,
    }),
  });
  return new Response(null, { status: res.ok ? 204 : 502 });
}
