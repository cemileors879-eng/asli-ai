import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudChain, generateCloud } from './cloud.mjs';

test('cloud requests require an explicit signed-in session', async () => {
  let called = false;
  const puter = { auth: { isSignedIn: () => false }, ai: { chat: () => { called = true; } } };
  await assert.rejects(generateCloud(puter, [], new AbortController().signal, () => {}), /auth_required/);
  assert.equal(called, false);
});
test('only text chunks reach the conversation and requests have a bounded output', async () => {
  let options; const streamed = [];
  const puter = { auth: { isSignedIn: () => true }, ai: { chat: async (_, config) => { options = config; return (async function*() { yield { type: 'reasoning', text: 'internal' }; yield { type: 'text', text: 'Merhaba' }; yield { type: 'text', text: ' Aslı.' }; })(); } } };
  const result = await generateCloud(puter, [{ role: 'user', content: 'Merhaba' }], new AbortController().signal, text => streamed.push(text));
  assert.equal(result, 'Merhaba Aslı.'); assert.deepEqual(streamed, ['Merhaba', 'Merhaba Aslı.']); assert.equal(options.max_tokens, 600); assert.equal(options.fallback, false);
});
test('provider failure after partial output remains a failure', async () => {
  const puter = { auth: { isSignedIn: () => true }, ai: { chat: async () => (async function*() { yield { type: 'text', text: 'Kısmi yanıt' }; yield { type: 'error', message: 'quota exceeded' }; })() } };
  await assert.rejects(generateCloud(puter, [], new AbortController().signal, () => {}), error => error.message === 'quota exceeded' && error.partial === 'Kısmi yanıt');
});
test('cancelled streams never append another text chunk', async () => {
  const controller = new AbortController(); const streamed = [];
  const puter = { auth: { isSignedIn: () => true }, ai: { chat: async () => (async function*() { controller.abort(); yield { type: 'text', text: 'late' }; })() } };
  await assert.rejects(generateCloud(puter, [], controller.signal, text => streamed.push(text)));
  assert.deepEqual(streamed, []);
});

test('the LangChain steps pass context to Puter once and preserve a failed stream', async () => {
  const chain = createCloudChain({
    RunnableLambda: { from: fn => fn },
    RunnableSequence: {
      from: ([format, stream]) => ({ invoke: request => stream(format(request)) }),
    },
  });
  const messages = [{ role: 'user', content: 'Merhaba' }];
  const streamed = [];
  let calls = 0;
  const puter = {
    auth: { isSignedIn: () => true },
    ai: {
      async *chat(context) {
        calls++;
        assert.equal(context[0].role, 'system');
        assert.deepEqual(context.slice(1), messages);
        yield { type: 'text', text: 'Merhaba' };
        yield { type: 'error', message: 'quota exceeded' };
      },
    },
  };
  const signal = new AbortController().signal;
  await assert.rejects(
    generateCloud(puter, messages, signal, text => streamed.push(text), Promise.resolve(chain)),
    error => error.message === 'quota exceeded' && error.partial === 'Merhaba',
  );
  assert.equal(calls, 1);
  assert.deepEqual(streamed, ['Merhaba']);
});
