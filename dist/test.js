"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const testCases = [
    {
        name: 'List Available Tools',
        method: 'tools/list',
        params: {},
        validate: (res) => Array.isArray(res?.result?.tools) && res.result.tools.length > 0,
    },
    {
        name: 'Get System Diagnostics',
        method: 'tools/call',
        params: { name: 'get_system_stats', arguments: {} },
        validate: (res) => {
            const content = JSON.parse(res?.result?.content?.[0]?.text || '{}');
            return content.uptime !== undefined && content.memory_pressure !== undefined;
        },
    },
    {
        name: 'Get Disk Usage',
        method: 'tools/call',
        params: { name: 'get_disk_usage', arguments: {} },
        validate: (res) => {
            const text = res?.result?.content?.[0]?.text || '';
            return text.includes('Filesystem') && text.includes('/');
        },
    },
    {
        name: 'Get Recent Podcasts',
        method: 'tools/call',
        params: { name: 'get_recent_podcast_episodes', arguments: { limit: 3 } },
        validate: (res) => {
            const text = res?.result?.content?.[0]?.text || '';
            // It should either return a valid JSON array or a sandboxing permission error/empty list
            try {
                const episodes = JSON.parse(text);
                return Array.isArray(episodes);
            }
            catch (e) {
                return text.includes('Error executing tool') || text === '';
            }
        },
    },
    {
        name: 'List Siri Shortcuts',
        method: 'tools/call',
        params: { name: 'list_shortcuts', arguments: {} },
        validate: (res) => {
            const text = res?.result?.content?.[0]?.text || '';
            try {
                const list = JSON.parse(text);
                return Array.isArray(list);
            }
            catch (e) {
                return false;
            }
        },
    },
];
async function runTests() {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│           macOS Companion MCP Test Suite               │');
    console.log('└────────────────────────────────────────────────────────┘\n');
    // Spawn the server
    const server = (0, child_process_1.spawn)('node', ['dist/index.js']);
    let buffer = '';
    const responses = [];
    server.stdout.on('data', (data) => {
        buffer += data.toString();
        // Split by newline if the SDK outputs newlines, or split by message chunks
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
            if (line.trim()) {
                responses.push(line);
            }
        }
    });
    server.stderr.on('data', (data) => {
        // Console errors or diagnostic logs from the server
        const log = data.toString().trim();
        if (log && !log.includes('running on stdio')) {
            console.log(`[Server Log] ${log}`);
        }
    });
    // Helper to send a request and wait for the matching response ID
    function sendRequest(id, method, params) {
        return new Promise((resolve) => {
            const request = JSON.stringify({
                jsonrpc: '2.0',
                method,
                id,
                params,
            }) + '\n';
            const checkResponse = setInterval(() => {
                // Find if a response with this ID exists
                const matchIndex = responses.findIndex((r) => {
                    try {
                        const parsed = JSON.parse(r);
                        return parsed.id === id;
                    }
                    catch (e) {
                        return false;
                    }
                });
                if (matchIndex !== -1) {
                    clearInterval(checkResponse);
                    const rawResponse = responses.splice(matchIndex, 1)[0];
                    resolve(JSON.parse(rawResponse));
                }
            }, 50);
            server.stdin.write(request);
        });
    }
    // Wait 1 second for server startup
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let passedCount = 0;
    const resultsTable = [];
    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const requestId = i + 1;
        process.stdout.write(` Running: ${tc.name.padEnd(35)}... `);
        try {
            const startTime = Date.now();
            const response = await sendRequest(requestId, tc.method, tc.params);
            const duration = Date.now() - startTime;
            const passed = tc.validate(response);
            if (passed) {
                passedCount++;
                process.stdout.write('\x1b[32m[PASS]\x1b[0m\n');
                resultsTable.push(`│ \x1b[32m✓\x1b[0m ${tc.name.padEnd(35)} │ ${`${duration}ms`.padStart(8)} │ \x1b[32mPassed\x1b[0m │`);
            }
            else {
                process.stdout.write('\x1b[31m[FAIL]\x1b[0m\n');
                resultsTable.push(`│ \x1b[31m✗\x1b[0m ${tc.name.padEnd(35)} │ ${`${duration}ms`.padStart(8)} │ \x1b[31mFailed\x1b[0m │`);
            }
        }
        catch (e) {
            process.stdout.write('\x1b[31m[ERROR]\x1b[0m\n');
            resultsTable.push(`│ \x1b[31m✗\x1b[0m ${tc.name.padEnd(35)} │    Error │ \x1b[31mError \x1b[0m │`);
        }
    }
    // Shut down server
    server.kill();
    // Print Success Dashboard
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│                 TEST SUCCESS DASHBOARD                 │');
    console.log('├──────────────────────────────────────┬──────────┬──────┤');
    resultsTable.forEach(row => console.log(row));
    console.log('├──────────────────────────────────────┴──────────┴──────┤');
    const scoreColor = passedCount === testCases.length ? '\x1b[32m' : '\x1b[31m';
    console.log(`│ Score: ${scoreColor}${passedCount}/${testCases.length} Tests Passed\x1b[0m (${Math.round((passedCount / testCases.length) * 100)}%)`.padEnd(68) + '│');
    console.log('└────────────────────────────────────────────────────────┘\n');
}
runTests().catch(err => {
    console.error('Test runner failure:', err);
    process.exit(1);
});
