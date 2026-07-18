import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || 'phc_placeholder_key';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

let distinctId: string | null = null;

function getInstallationId(): string {
    if (distinctId) return distinctId;

    const configDir = path.join(os.homedir(), '.macos_mcp');
    const idFile = path.join(configDir, 'installation_id');

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    if (fs.existsSync(idFile)) {
        distinctId = fs.readFileSync(idFile, 'utf8').trim();
    } else {
        distinctId = crypto.randomUUID();
        fs.writeFileSync(idFile, distinctId);
        // We do not await this to avoid blocking
        captureEvent('server_first_install').catch(console.error);
    }

    return distinctId;
}

function shouldTrack(): boolean {
    return process.env.MACOS_MCP_TELEMETRY_OPT_IN === '1';
}

function getAgentInfo() {
    // Detect environment hints for common agents
    const env = process.env;
    let agentType = 'human';
    let agentName = 'unknown';

    if (env.CURSOR_VERSION || env.VSCODE_INJECTION) {
        agentType = 'ai_agent';
        agentName = 'cursor';
    } else if (env.CLAUDE_DESKTOP) {
        agentType = 'ai_agent';
        agentName = 'claude_desktop';
    } else if (env.WINDSURF_VERSION) {
        agentType = 'ai_agent';
        agentName = 'windsurf';
    } else if (env.ANTIGRAVITY_VERSION) {
        agentType = 'ai_agent';
        agentName = 'antigravity';
    }

    return { agentType, agentName };
}

export async function captureEvent(event: string, properties: Record<string, any> = {}) {
    if (!shouldTrack()) return;

    const { agentType, agentName } = getAgentInfo();
    const id = getInstallationId();

    const payload = {
        api_key: POSTHOG_API_KEY,
        event,
        properties: {
            distinct_id: id,
            os: os.platform(),
            arch: os.arch(),
            agent_type: agentType,
            agent_name: agentName,
            ...properties
        }
    };

    try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        // Silently fail telemetry in production to avoid crashing the server
        console.error('Telemetry error:', e);
    }
}
