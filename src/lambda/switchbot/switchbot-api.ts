import { httpsGet } from '../http';
import * as SM from '../secrets';
import crypto from 'crypto';


// https://github.com/OpenWonderLabs/SwitchBotAPI?tab=readme-ov-file#command-set-for-virtual-infrared-remote-devices


export const COMMANDS = [
    'turnOn',
    'turnOff',
    'volumeAdd',
    'volumeSub',
    'setMute',
    'Play',
    'Pause',
    'FastForward',
    'Rewind',
    'Next',
    'Previous',
    'Stop'
] as const;

const SWITCHBOT_CREDENTIALS_NAME = process.env.SWITCHBOT_CREDENTIALS_NAME!;

async function createAuthHeaders() {

    const credentials = await SM.getSecretObject(SWITCHBOT_CREDENTIALS_NAME);
    const token = credentials?.token;
    const secret = credentials?.secret;

    if (!token || !secret) {
        throw new Error('Missing SwitchBot token/secret: provide env vars or Secrets Manager names');
    }

    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signData = token + t + nonce;
    const sign = crypto.createHmac('sha256', secret).update(signData).digest('base64');

    return {
        Authorization: token,
        sign,
        nonce,
        t
    };
}

async function getDeviceByName(name: string, authHeaders: {}) {
    const response = await httpsGet('https://api.switch-bot.com/v1.1/devices', {
        headers: authHeaders
    });
    let parsed: any;
    try {
        parsed = JSON.parse(response);
    } catch (e) {
        console.error('Failed to parse devices response', e);
        return undefined;
    }

    const body = parsed.body || {};
    const lists: any[] = [];
    if (Array.isArray(body.deviceList)) lists.push(...body.deviceList);
    if (Array.isArray(body.infraredRemoteList)) lists.push(...body.infraredRemoteList);
    if (Array.isArray(body.meterList)) lists.push(...body.meterList);

    return lists.find((d: any) => d.deviceName === name || d.deviceId === name);
}

export async function sendSwitchBotCommand(deviceName: string, command: string, repeat?: number): Promise<string[]> {
    // Validate command against allowed commands list (case-sensitive)
    const commandValue = COMMANDS.find(v => v === command);
    if (!commandValue) {
        throw new Error(`Unsupported command: ${command}`);
    }

    const authHeaders = await createAuthHeaders();

    // Find the device
    const device = await getDeviceByName(deviceName, authHeaders);
    if (!device) {
        throw new Error(`Device not found: ${deviceName}`);
    }

    const url = `https://api.switch-bot.com/v1.1/devices/${device.deviceId}/commands`;
    const body = JSON.stringify({
        command: commandValue,
        parameter: 'default',
        commandType: 'command'
    });

    const headers = {
        ...authHeaders,
        'Content-Type': 'application/json'
    };

    const times = (repeat && repeat > 0) ? repeat : 1;
    const results: string[] = [];
    for (let i = 0; i < times; i++) {
        console.log(`Sending SwitchBot command (${i + 1}/${times}) to device ${device.deviceId}`);
        const result = await httpsGet(url, {
            method: 'POST',
            headers,
            body
        });
        results.push(result);
    }

    return results;
}
