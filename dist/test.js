"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const TOOLS_LIST = [
    'click_at', 'complete_reminder', 'create_calendar_event', 'create_note',
    'create_reminder', 'create_sticky', 'focus_app', 'forward_email',
    'get_battery_health', 'get_calendar_events', 'get_chat_history', 'get_clipboard',
    'get_current_location', 'get_directions', 'get_disk_usage', 'get_email',
    'get_music_state', 'get_note', 'get_process_list', 'get_recent_photos',
    'get_recent_podcast_episodes', 'get_reminders', 'get_safari_tabs',
    'get_startup_items', 'get_sticky', 'get_storage_scan', 'get_system_stats',
    'get_unread_emails', 'get_wifi_info', 'get_window_position', 'kill_process',
    'list_calendars', 'list_notes', 'list_shortcuts', 'list_stickies',
    'list_windows', 'lock_screen', 'open_url', 'play_pause_music', 'play_playlist',
    'press_key', 'reply_to_email', 'resize_window', 'restart_service',
    'run_disk_cleanup', 'run_health_audit', 'run_shortcut', 'search_contacts',
    'search_emails', 'search_maps', 'search_messages', 'search_photos',
    'send_email', 'send_imessage', 'send_notification', 'set_clipboard',
    'set_do_not_disturb', 'set_music_volume', 'set_system_volume', 'skip_music_track',
    'sleep_display', 'take_screenshot', 'type_text', 'update_note',
];
// Only call tools that are safe to run — no destructive side effects
const SAFE_TO_CALL = [
    { name: 'get_system_stats', args: {} },
    { name: 'get_disk_usage', args: {} },
    { name: 'get_battery_health', args: {} },
    { name: 'get_process_list', args: {} },
    { name: 'get_clipboard', args: {} },
    { name: 'list_shortcuts', args: {} },
    { name: 'get_recent_podcast_episodes', args: { limit: 1 } },
    { name: 'get_wifi_info', args: {} },
    { name: 'get_music_state', args: {} },
    { name: 'list_calendars', args: {} },
    { name: 'get_startup_items', args: {} },
    { name: 'run_health_audit', args: {} },
];
async function runTests() {
    console.log('\n  macOS Companion MCP Test Suite\n');
    const server = (0, child_process_1.spawn)('node', ['dist/index.js']);
    let buffer = '';
    const responses = [];
    server.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (line.trim())
                responses.push(line);
        }
    });
    function sendRequest(id, method, params) {
        return new Promise((resolve) => {
            const request = JSON.stringify({ jsonrpc: '2.0', method, id, params }) + '\n';
            const checkResponse = setInterval(() => {
                const matchIndex = responses.findIndex((r) => {
                    try {
                        return JSON.parse(r).id === id;
                    }
                    catch {
                        return false;
                    }
                });
                if (matchIndex !== -1) {
                    clearInterval(checkResponse);
                    resolve(JSON.parse(responses.splice(matchIndex, 1)[0]));
                }
            }, 50);
            server.stdin.write(request);
        });
    }
    await new Promise((r) => setTimeout(r, 1500));
    let passed = 0;
    let total = 0;
    // Test 1: tools/list contains all expected tools
    total++;
    const listResp = await sendRequest(1, 'tools/list', {});
    const toolNames = (listResp?.result?.tools || []).map((t) => t.name).sort();
    const allFound = TOOLS_LIST.every((t) => toolNames.includes(t));
    if (allFound)
        passed++;
    console.log(`  ${allFound ? 'PASS' : 'FAIL'} tools/list: ${toolNames.length} tools returned`);
    // Test 2-13: safe tool calls
    for (let i = 0; i < SAFE_TO_CALL.length; i++) {
        total++;
        const tc = SAFE_TO_CALL[i];
        const resp = await sendRequest(i + 2, 'tools/call', { name: tc.name, arguments: tc.args });
        const text = resp?.result?.content?.[0]?.text || '';
        const ok = !resp?.isError && !text.startsWith('Error executing tool');
        if (ok)
            passed++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'} ${tc.name}`);
    }
    server.kill();
    console.log(`\n  ${passed}/${total} passed (${Math.round(passed / total * 100)}%)\n`);
    // Clean exit — no process.exit
    if (passed !== total) {
        throw new Error(`${total - passed} tests failed`);
    }
}
runTests().catch((err) => {
    console.error('Test suite error:', err.message);
    process.exit(1);
});
