export async function onRequest(context) {
    // Fetch the raw install.sh from GitHub
    const scriptResponse = await fetch('https://raw.githubusercontent.com/surendranb/macos-mcp/main/install.sh');
    const script = await scriptResponse.text();
    
    return new Response(script, {
        headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache'
        }
    });
}
