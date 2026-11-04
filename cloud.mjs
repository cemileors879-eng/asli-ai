import { ASLI_PERSONALITY } from './core.mjs';

export async function generateCloud(puter, messages, signal, onText) {
  if (!puter?.auth?.isSignedIn()) throw new Error('auth_required');
  let text = '';
  try {
    const response = await puter.ai.chat([
      { role: 'system', content: ASLI_PERSONALITY },
      ...messages,
    ], { model: 'gpt-5.4-nano', stream: true, max_tokens: 600, signal, fallback: false });
    for await (const part of response) {
      if (signal.aborted) throw signal.reason || new Error('aborted');
      if (part.type === 'error') throw new Error(part.message || 'provider_error');
      if (part.type === 'text' && typeof part.text === 'string') { text += part.text; onText(text); }
    }
    if (!text.trim()) throw new Error('empty_response');
    return text.trim();
  } catch (error) {
    const failure = new Error(error?.message || error?.error?.message || 'cloud_error');
    failure.partial = text.trim();
    throw failure;
  }
}
