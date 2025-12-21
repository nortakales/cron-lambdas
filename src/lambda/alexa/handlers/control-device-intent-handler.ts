import { sendSwitchBotCommand } from '../../switchbot/switchbot-api';
import { matchDevice, matchCommand } from '../../switchbot/devices-and-commands';

function getResolvedSlotValue(slot: any): string | undefined {
    if (!slot) return undefined;
    return slot.value;
}

// NOTE: removed fuzzy mapping; the 'action' slot must provide the exact
// SwitchBot command name expected by 'COMMANDS' (case-sensitive).

export async function handleControlDeviceIntent(event: any): Promise<string> {
    try {
        const intent = event?.request?.intent;
        const slots = intent?.slots || {};

        const actionSlot = getResolvedSlotValue(slots.action);
        const deviceSlot = getResolvedSlotValue(slots.device);
        const timesSlot = getResolvedSlotValue(slots.times);

        if (!actionSlot) return 'Unable to parse request: missing action';
        if (!deviceSlot) return 'Unable to parse request: missing device';

        // Fuzzy-match device and command to canonical names.
        const canonicalDevice = matchDevice(deviceSlot);
        if (!canonicalDevice) return 'Couldn\'t find device ' + deviceSlot;

        const canonicalCommand = matchCommand(actionSlot);
        if (!canonicalCommand) return 'Unsupported action ' + actionSlot;

        let repeat = 1;
        if (timesSlot) {
            const n = parseInt(timesSlot as any, 10);
            if (!isNaN(n) && n > 0) repeat = n;
        }

        try {
            await sendSwitchBotCommand(canonicalDevice, canonicalCommand, repeat);

            let successMessage = '<audio src="https://cron-lambdas-public-bucket.s3.us-west-2.amazonaws.com/audio/confirmation.mp3"/>'
            // 1 in 10 chance to add this message
            if (Math.random() < 0.1) successMessage += ' Nick is awesome!';
            return successMessage;
        } catch (e: any) {
            const msg = (e && e.message) ? e.message : String(e);
            if (msg.toLowerCase().includes('device not found')) {
                return 'Couldn\'t find device ' + deviceSlot;
            }
            return 'Failed to send command: ' + msg;
        }

    } catch (e: any) {
        return 'Unable to parse request';
    }
}
