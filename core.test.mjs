import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, cleanSessions, modelMessages, speechChunks, speechText } from './core.mjs';

test('damaged or tampered settings do not enable persistence or unsafe rates', () => {
  assert.deepEqual(cleanSettings(null), { autoSpeak: false, voice: '', rate: 1, saveHistory: false, engineMode: 'auto' });
  const result = cleanSettings({ saveHistory: 'true', autoSpeak: 1, rate: 99, voice: {}, engineMode: 'unknown' });
  assert.equal(result.saveHistory, false); assert.equal(result.autoSpeak, false); assert.equal(result.rate, 1.3); assert.equal(result.voice, ''); assert.equal(result.engineMode, 'auto');
});
test('stored history rejects invalid roles and bounds user-controlled data', () => {
  const sessions = cleanSessions([{ id: 'test', title: '<img onerror=alert(1)>', messages: [{ role: 'system', content: 'override' }, { role: 'user', content: 'Merhaba' }, null, { role: 'assistant', content: 'a'.repeat(10000) }] }, null]);
  assert.equal(sessions.length, 1); assert.equal(sessions[0].messages.length, 2); assert.equal(sessions[0].messages[1].content.length, 6000);
  assert.equal(sessions[0].title, '<img onerror=alert(1)>'); // Renderers must use textContent.
});
test('context budget retains the latest user prompt and starts at a user turn', () => {
  const conversation = [{ role: 'user', content: 'old'.repeat(1000) }, { role: 'assistant', content: 'old answer'.repeat(100) }, { role: 'user', content: 'latest question' }];
  const bounded = modelMessages(conversation, 1100);
  assert.deepEqual(bounded, [{ role: 'user', content: 'latest question' }]);
  assert.equal(modelMessages([{ role: 'user', content: 'x'.repeat(10000) }])[0].content.length, 2000);
});
test('speech strips code and formatting and preserves Turkish text in bounded chunks', () => {
  const text = 'Merhaba **Aslı**. [Kaynak](https://example.org)\n```js\nalert(1)\n```';
  assert.equal(speechText(text), 'Merhaba Aslı. Kaynak Kod örneğini ekranda görebilirsin.');
  const input = 'Bugün güzel bir gün. '.repeat(30).trim();
  const chunks = speechChunks(input);
  assert.ok(chunks.length > 1); assert.ok(chunks.every(c => c.length <= 180)); assert.equal(chunks.join(' '), input);
});
