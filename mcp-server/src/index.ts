#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeClient, BridgeError } from './bridge-client.js';

/**
 * MCP server for the iCloud bridge.
 *
 * Wraps the consumer API as tools so any agent framework can read and send
 * iMessages and manage Reminders without bespoke glue.
 *
 * Writes are asynchronous by design: the Mac sits behind NAT, so a write returns
 * a commandId and the agent confirms with get_command_status. Each write tool's
 * description says so, so a model knows to follow up rather than assume success.
 *
 * Configure with:
 *   BRIDGE_URL   base URL of the API stage
 *   BRIDGE_KEY   a consumer API key
 */

const baseUrl = process.env.BRIDGE_URL;
const apiKey = process.env.BRIDGE_KEY;

if (!baseUrl || !apiKey) {
    // stdout is the MCP protocol channel, so diagnostics go to stderr.
    console.error('BRIDGE_URL and BRIDGE_KEY must both be set');
    process.exit(1);
}

const bridge = new BridgeClient({ baseUrl, apiKey });
const server = new McpServer({ name: 'icloud-bridge', version: '0.1.0' });

/** Renders a tool result, turning an API error into a readable failure. */
async function respond(work: () => Promise<unknown>) {
    try {
        const data = await work();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
        const message = e instanceof BridgeError
            ? `${e.code} (${e.status}): ${e.message}`
            : (e as Error).message;
        return {
            content: [{ type: 'text' as const, text: `Request failed: ${message}` }],
            isError: true,
        };
    }
}

// --- messages ---------------------------------------------------------------

server.registerTool('search_messages', {
    title: 'Search messages',
    description:
        'Search recent iMessage/SMS history. Without `q` this returns the most recent messages. ' +
        'Text search is case-insensitive over a recent window rather than all history, so ' +
        'narrow with `sender` or `since` when looking further back.',
    inputSchema: {
        q: z.string().optional().describe('Case-insensitive text to look for in the message body'),
        sender: z.string().optional().describe('Handle to filter by, e.g. +15551234567; use "me" for sent messages'),
        since: z.string().optional().describe('ISO8601 timestamp; only messages newer than this'),
        limit: z.number().int().min(1).max(200).optional().describe('Maximum messages to return (default 50)'),
        cursor: z.string().optional().describe('nextCursor from a previous call, to page further back'),
    },
}, async args => respond(() => bridge.get('/messages', args)));

server.registerTool('get_thread', {
    title: 'Get conversation thread',
    description: 'Fetch messages in one conversation, newest first. `chatId` is the chat GUID, e.g. "iMessage;-;+15551234567".',
    inputSchema: {
        chatId: z.string().describe('Chat GUID identifying the conversation'),
        since: z.string().optional().describe('ISO8601 timestamp; only messages newer than this'),
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
    },
}, async ({ chatId, ...query }) =>
    respond(() => bridge.get(`/messages/${encodeURIComponent(chatId)}`, query)));

server.registerTool('send_message', {
    title: 'Send a message',
    description:
        'Send an iMessage/SMS. Queues the send on the Mac and returns a commandId immediately — ' +
        'it does NOT confirm delivery. Poll get_command_status until status is "done" or "failed" ' +
        'before telling the user it was sent.',
    inputSchema: {
        chatGuid: z.string().describe('Chat GUID to send to, e.g. "iMessage;-;+15551234567"'),
        text: z.string().min(1).describe('Message body'),
    },
}, async args => respond(() => bridge.post('/messages', args)));

// --- reminders --------------------------------------------------------------

server.registerTool('list_reminder_lists', {
    title: 'List reminder lists',
    description: 'All Reminders lists with their open-item counts. Use the returned listId with the other reminder tools.',
    inputSchema: {},
}, async () => respond(() => bridge.get('/reminders/lists')));

server.registerTool('list_reminders', {
    title: 'List reminders',
    description:
        'Reminders ordered by due date, soonest first; undated ones come last. ' +
        'Defaults to every list and both open and completed items.',
    inputSchema: {
        listId: z.string().optional().describe('Restrict to one list'),
        completed: z.boolean().optional().describe('true for completed only, false for open only'),
        dueBefore: z.string().optional().describe('ISO8601 timestamp; only reminders due before it'),
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
    },
}, async args => respond(() => bridge.get('/reminders', args)));

server.registerTool('add_reminder', {
    title: 'Add a reminder',
    description:
        'Create a reminder. Queued on the Mac and returns a commandId; confirm with get_command_status. ' +
        'Omit listId to use the default Reminders list.',
    inputSchema: {
        title: z.string().min(1),
        listId: z.string().optional(),
        notes: z.string().optional(),
        dueDate: z.string().optional().describe('ISO8601 timestamp'),
        priority: z.number().int().min(0).max(9).optional().describe('EventKit priority: 0 none, 1 high, 5 medium, 9 low'),
    },
}, async args => respond(() => bridge.post('/reminders', args)));

server.registerTool('complete_reminder', {
    title: 'Complete a reminder',
    description: 'Mark a reminder done (or reopen it). Queued; confirm with get_command_status.',
    inputSchema: {
        reminderId: z.string(),
        completed: z.boolean().default(true).describe('false reopens a completed reminder'),
    },
}, async ({ reminderId, completed }) =>
    respond(() => bridge.patch(`/reminders/${encodeURIComponent(reminderId)}`, { completed })));

server.registerTool('update_reminder', {
    title: 'Update a reminder',
    description:
        'Change a reminder\'s fields. Only the fields you pass are touched; pass null to clear ' +
        'notes, dueDate or priority. Queued; confirm with get_command_status.',
    inputSchema: {
        reminderId: z.string(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional().describe('ISO8601 timestamp, or null to clear'),
        priority: z.number().int().min(0).max(9).nullable().optional(),
        listId: z.string().optional().describe('Move the reminder to another list'),
        completed: z.boolean().optional(),
    },
}, async ({ reminderId, ...body }) =>
    respond(() => bridge.patch(`/reminders/${encodeURIComponent(reminderId)}`, body)));

// --- write confirmation -----------------------------------------------------

server.registerTool('get_command_status', {
    title: 'Get command status',
    description:
        'Check whether a queued write actually happened on the Mac. Status goes ' +
        'queued -> picked_up -> done or failed. Normally lands within a few seconds.',
    inputSchema: {
        commandId: z.string().describe('commandId returned by a write tool'),
    },
}, async ({ commandId }) =>
    respond(() => bridge.get(`/commands/${encodeURIComponent(commandId)}`)));

await server.connect(new StdioServerTransport());
console.error(`icloud-bridge MCP server connected to ${baseUrl}`);
