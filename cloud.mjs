import { ASLI_PERSONALITY } from './core.mjs';

const RUNNABLES_URL = 'https://esm.sh/@langchain/core@1.3.4/runnables?bundle&target=es2022';
let chainPromise;

function formatMessages(messages) {
  return [{ role: 'system', content: ASLI_PERSONALITY }, ...messages];
}

export function createCloudChain({ RunnableLambda, RunnableSequence }) {
  return RunnableSequence.from([
    RunnableLambda.from(request => ({ ...request, messages: formatMessages(request.messages) })),
    RunnableLambda.from(streamPuter),
  ]);
}

export function loadCloudChain() {
  if (chainPromise) return chainPromise;

  let timeout;
  const deadline = new Promise(resolve => { timeout = setTimeout(() => resolve(null), 6000); });
  chainPromise = Promise.race([import(RUNNABLES_URL).then(createCloudChain), deadline])
    .catch(() => null)
    .then(chain => {
      if (!chain) chainPromise = null;
      return chain;
    })
    .finally(() => clearTimeout(timeout));
  return chainPromise;
}

export async function generateCloud(puter, messages, signal, onText, chainPromise) {
  if (!puter?.auth?.isSignedIn()) throw new Error('auth_required');
  const chain = await chainPromise;
  signal.throwIfAborted();
  const request = { puter, messages, signal, onText };
  if (chain) return chain.invoke(request);
  return streamPuter({ ...request, messages: formatMessages(messages) });
}

async function streamPuter({ puter, messages, signal, onText }) {
  signal.throwIfAborted();
  let text = '';
  try {
    const response = await puter.ai.chat(messages, { model: 'gpt-5.4-nano', stream: true, max_tokens: 600, signal, fallback: false });
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
