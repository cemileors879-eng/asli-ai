import { ASLI_PERSONALITY, modelMessages } from '../core.mjs';

const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const BODY_LIMIT = 24 * 1024;
const DAILY_REQUESTS = 100;

function reply(status, body, headers) {
  return Response.json(body, { status, headers });
}

async function readMessages(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  let input = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      input += decoder.decode(value, { stream: true });
    }
    const { messages } = JSON.parse(input + decoder.decode());
    if (!Array.isArray(messages) || messages.length > 80 || messages.at(-1)?.role !== 'user') return null;
    if (!messages.every(message => message && ['user', 'assistant'].includes(message.role) &&
      typeof message.content === 'string' && message.content.trim() && message.content.length <= 2000)) return null;
    return modelMessages(messages);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export class DailyQuota {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch() {
    const day = new Date().toISOString().slice(0, 10);
    const accepted = await this.storage.transaction(async transaction => {
      const previous = await transaction.get('daily');
      const count = previous?.day === day ? previous.count : 0;
      if (count >= DAILY_REQUESTS) return false;
      await transaction.put('daily', { day, count: count + 1 });
      return true;
    });
    return new Response(null, { status: accepted ? 204 : 429 });
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/chat') return reply(404, { error: 'not_found' });
    const origin = request.headers.get('Origin');
    if (!origin || origin !== env.SITE_ORIGIN) return reply(403, { error: 'origin' });
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    };
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
    if (request.method !== 'POST') return reply(405, { error: 'method' }, headers);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
      return reply(415, { error: 'content_type' }, headers);
    }
    const messages = await readMessages(request);
    if (!messages?.length) return reply(400, { error: 'messages' }, headers);
    try {
      const client = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.CLIENT_RATE.limit({ key: client });
      if (!success) return reply(429, { error: 'rate_limit' }, headers);
      const quota = env.DAILY_QUOTA.get(env.DAILY_QUOTA.idFromName('asli-chat'));
      const reservation = await quota.fetch('https://quota.internal/reserve', { method: 'POST' });
      if (reservation.status === 429) return reply(429, { error: 'daily_limit' }, headers);
      if (reservation.status !== 204) return reply(503, { error: 'quota_unavailable' }, headers);
      const result = await env.AI.run(MODEL, {
        messages: [{ role: 'system', content: ASLI_PERSONALITY }, ...messages],
        max_tokens: 260,
      });
      const text = typeof result?.response === 'string' ? result.response.trim() : '';
      if (!text) return reply(502, { error: 'empty_response' }, headers);
      return reply(200, { text }, headers);
    } catch {
      return reply(503, { error: 'unavailable' }, headers);
    }
  },
};
