export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const posthogPayload = {
            api_key: env.POSTHOG_API_KEY,
            event: body.event,
            properties: {
                ...body.properties,
                source: 'install_gateway',
                ip: request.headers.get('CF-Connecting-IP')
            }
        };
        
        context.waitUntil(
            fetch('https://us.i.posthog.com/capture/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(posthogPayload)
            })
        );
        return new Response('ok', { status: 200 });
    } catch (e) {
        return new Response('error', { status: 400 });
    }
}
