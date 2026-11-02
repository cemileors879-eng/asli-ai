import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCloud } from './cloud.mjs';

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
