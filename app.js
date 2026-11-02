import { cleanSettings, cleanSessions, modelMessages, SETTINGS_KEY, HISTORY_KEY } from './core.mjs';
import { Voice } from './voice.js';
import { generateCloud } from './cloud.mjs';

const $ = id => document.getElementById(id);
const icon = name => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); svg.setAttribute('aria-hidden', 'true'); return svg; };
const readStored = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const settings = cleanSettings(readStored(SETTINGS_KEY));
let sessions = settings.saveHistory ? cleanSessions(readStored(HISTORY_KEY)) : [];
let current = sessions[0] || newSession();
let worker = null;
let ready = false;
let loading = false;
let busy = false;
let pendingPrompt = '';
let requestId = 0;
let assistantNode;
let outputText = '';
let loadTimer;
let voiceMode = false;
let voiceSending = false;
let handsFreeTimer;
let noticeTimer;
let engineKind = 'cloud';
let cloudAbort;
let sdkPromise;

function newSession() { return { id: crypto.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: 'Yeni sohbet', messages: [] }; }
function notice(text, duration = 0) { clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').hidden = !text; if (text && duration) noticeTimer = setTimeout(() => notice(''), duration); if (voiceMode && text) $('voice-state').textContent = text; }
function announce(text) { $('announcer').textContent = text; }
function status(text, kind = '') { $('engine-status').textContent = text; $('status-dot').className = `status-dot ${kind}`; }
function readyLabel() { return engineKind === 'cloud' ? 'Gelişmiş sohbet hazır' : 'Sohbete hazır'; }
function persistSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { notice('Tarayıcı ayarları saklamaya izin vermiyor. Bu oturumda kullanmaya devam edebilirsin.'); } }
function saveSession() {
  if (!current.messages.length) return;
  current.title = current.messages.find(m => m.role === 'user')?.content.slice(0, 45) || 'Yeni sohbet';
  sessions = [current, ...sessions.filter(s => s.id !== current.id)].slice(0, 12);
  if (settings.saveHistory) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(cleanSessions(sessions))); } catch { notice('Sohbet cihazına kaydedilemedi. Tarayıcının depolama alanı dolu olabilir.'); }
  }
  renderHistory();
}
function renderHistory() {
  $('history').replaceChildren();
  $('history-empty').hidden = sessions.length > 0;
  for (const session of sessions) {
    const button = document.createElement('button');
    button.className = `history-item ${session.id === current.id ? 'active' : ''}`;
    button.textContent = session.title;
    button.setAttribute('aria-current', session.id === current.id ? 'true' : 'false');
    button.addEventListener('click', () => { if (busy || loading) return notice('Önce devam eden yanıtı veya hazırlığı durdur.'); voice.stopListening(true); voice.cancelSpeech(); current = session; renderConversation(); renderHistory(); });
    $('history').append(button);
  }
}
function scrollBottom() { $('content-scroll').scrollTop = $('content-scroll').scrollHeight; }
function messageElement(role, content, tools = true) {
  const article = document.createElement('article'); article.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'message-name';
  if (role === 'assistant') { const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); mark.innerHTML = '<use href="#asli-mark"/>'; mark.setAttribute('aria-hidden', 'true'); label.append(mark); }
  label.append(document.createTextNode(role === 'user' ? 'Sen' : 'Aslı'));
  const body = document.createElement('div'); body.className = 'message-body'; body.textContent = content;
  article.append(label, body); $('messages').append(article);
  if (role === 'assistant' && tools && content) addMessageTools(article, content);
  return { article, body };
}
function addMessageTools(article, content) {
  const controls = document.createElement('div'); controls.className = 'message-tools';
  const speak = document.createElement('button'); speak.type = 'button'; speak.className = 'icon-button'; speak.setAttribute('aria-label', 'Aslı’nın yanıtını dinle'); speak.append(icon('volume'));
  speak.addEventListener('click', () => voice.speaking ? voice.cancelSpeech() : voice.speak(content));
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'icon-button'; copy.setAttribute('aria-label', 'Yanıtı kopyala'); copy.append(icon('copy'));
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(content); copy.replaceChildren(icon('check')); copy.classList.add('copy-success'); announce('Yanıt kopyalandı.'); setTimeout(() => { copy.replaceChildren(icon('copy')); copy.classList.remove('copy-success'); }, 1600); } catch { notice('Kopyalanamadı. Yanıt metnini seçerek kopyalayabilirsin.'); } });
  controls.append(speak, copy); article.append(controls);
}
function renderConversation() {
  $('messages').replaceChildren();
  $('welcome').hidden = current.messages.length > 0;
  for (const message of current.messages) messageElement(message.role, message.content);
  scrollBottom();
}
function setBusy(value) {
  busy = value;
  $('messages').setAttribute('aria-busy', String(value));
  $('send').hidden = value;
  $('stop').hidden = !value;
  $('message').disabled = value;
  $('dictate').disabled = value || loading;
  if (value) { status('Aslı düşünüyor', 'loading'); $('voice-orb').className = 'voice-orb thinking'; $('voice-state').textContent = 'Düşünüyorum…'; }
  else if (ready) status(readyLabel(), 'ready');
}

const voice = new Voice({
  settings,
  onState(state) {
    $('dictate').classList.toggle('listening', state === 'listening');
    $('dictate').setAttribute('aria-label', state === 'listening' ? 'Mikrofonu durdur' : 'Mikrofonla yazdır');
    $('voice-orb').className = `voice-orb ${state}`;
    $('voice-listen').disabled = busy || !ready || !voice.canListen;
    $('voice-listen').replaceChildren(icon(state === 'listening' ? 'stop' : 'mic'), document.createTextNode(state === 'listening' ? 'Konuşmayı bitir' : 'Konuşmaya başla'));
    if (voiceMode) {
      $('voice-heading').textContent = state === 'listening' ? 'Seni dinliyorum.' : state === 'speaking' ? 'Aslı konuşuyor.' : 'Biraz konuşalım mı?';
      $('voice-state').textContent = state === 'listening' ? 'Konuşman bitince yanıt vereceğim.' : state === 'speaking' ? 'İstersen sesi durdurabilirsin.' : 'Mikrofona dokun ve konuşmaya başla.';
    }
  },
  onTranscript(text, final) {
    $('message').value = text; resizeInput();
    if (voiceMode) $('voice-transcript').textContent = text;
    if (final && voiceMode && !voiceSending) { voiceSending = true; sendMessage(text); }
  },
  onError: text => { clearTimeout(handsFreeTimer); voiceSending = false; notice(text); if ($('settings-dialog').open) $('voice-info').textContent = text; },
  onVoices(voices) {
    const select = $('voice-select'); select.replaceChildren(new Option('Cihazın Türkçe sesi', ''));
    const turkish = voices.filter(v => /^tr/i.test(v.lang));
    for (const item of turkish) select.add(new Option(item.name, item.voiceURI));
    select.value = settings.voice;
    $('voice-info').textContent = turkish.length ? `${turkish.length} Türkçe ses bulundu.` : voices.length ? 'Türkçe ses bulunamadı. Cihazının metin okuma ayarlarından Türkçe ses yükle.' : 'Ses listesi cihazından yüklenir. Ses yoksa cihazının metin okuma ayarlarını kontrol et.';
  },
});

function resetEngine() {
  clearTimeout(loadTimer); worker?.terminate(); worker = null; ready = false; loading = false; pendingPrompt = '';
  cloudAbort?.abort(); cloudAbort = null; engineKind = 'cloud';
  $('setup').hidden = false; $('start-engine').hidden = false; $('start-engine').textContent = 'Bağlan ve konuş';
  $('setup-title').textContent = 'Model indirmeden sohbet et'; $('setup-description').textContent = 'Puter hesabınla bağlan. Kullanım hesabının kotasından düşer.';
  $('download-track').hidden = true; $('dictate').disabled = false;
  status('Bağlanmaya hazır'); document.querySelector('.small-note span').textContent = 'Model indirmeden sohbet';
}
function loadEngine() {
  if (ready || loading) return;
  engineKind = 'local';
  loading = true; notice('');
  $('setup').hidden = false; $('start-engine').hidden = true; $('download-track').hidden = false;
  $('setup-title').textContent = 'Aslı hazırlanıyor'; $('setup-description').textContent = 'İlk indirme birkaç dakika sürebilir. Bu sekmeyi açık tut.';
  $('download-progress').removeAttribute('value'); $('download-label').textContent = 'Sohbet motoru yükleniyor…';
  status('Aslı hazırlanıyor', 'loading');
  try { worker = new Worker(new URL('./engine.js', import.meta.url), { type: 'module' }); }
  catch { resetEngine(); notice('Sohbet motoru başlatılamadı. Güncel bir tarayıcıyla tekrar dene.'); return; }
  const activeWorker = worker;
  worker.onmessage = event => { if (worker === activeWorker) handleEngine(event); };
  worker.onerror = () => { const hadRequest = busy; resetEngine(); if (hadRequest) failResponse(); notice('Sohbet motoru yüklenemedi. İnternet bağlantını kontrol et ve yeniden başlat.'); };
  worker.postMessage({ type: 'load', mode: settings.engineMode });
  loadTimer = setTimeout(() => { resetEngine(); notice('Modelin yüklenmesi beklenenden uzun sürdü. Bağlantını kontrol edip yeniden deneyebilirsin; indirilen dosyalar önbellekte kalmış olabilir.'); }, 300000);
}
async function handleEngine({ data }) {
  if (data.type === 'phase') $('download-label').textContent = data.text;
  if (data.type === 'progress' && /\.onnx/.test(data.file || '')) {
    $('download-progress').value = data.progress;
    $('download-label').textContent = `Model indiriliyor · ${Math.round(data.loaded / 1e6)} / ${Math.round(data.total / 1e6)} MB · %${Math.round(data.progress)}`;
  }
  if (data.type === 'ready') {
    clearTimeout(loadTimer); ready = true; loading = false; $('setup').hidden = true; $('dictate').disabled = false;
    status('Sohbete hazır', 'ready'); announce('Aslı hazır. Mesajını yazabilir veya mikrofonu kullanabilirsin.');
    $('voice-listen').disabled = busy || !voice.canListen;
    const prompt = pendingPrompt; pendingPrompt = '';
    if (prompt) sendMessage(prompt);
    else if (voiceMode) $('voice-state').textContent = 'Hazırım. Mikrofona dokunarak başlayabilirsin.';
    else $('message').focus();
  }
  if (data.type === 'token' && data.requestId === requestId && busy) {
    outputText = data.text; assistantNode.body.classList.remove('thinking'); assistantNode.body.textContent = outputText; scrollBottom();
    if (voiceMode) $('voice-transcript').textContent = outputText;
  }
  if (data.type === 'done' && data.requestId === requestId && busy) {
    const text = data.text || outputText;
    if (!text.trim()) { failResponse(); notice('Yanıt üretilemedi. Mesajını yeniden gönderebilirsin.'); return; }
    completeResponse(text);
    if (settings.autoSpeak || voiceMode) {
      const thisRequest = requestId;
      const spoken = await voice.speak(text);
      if (spoken && voiceMode && thisRequest === requestId && $('hands-free').checked) handsFreeTimer = setTimeout(() => { if (voiceMode && !busy && ready) voice.listen(); }, 550);
    }
  }
  if (data.type === 'error') {
    console.warn('Aslı engine:', data.stage, data.message);
    if (data.stage === 'load') { resetEngine(); notice('Bu cihaz modeli açamadı. İndirmeden devam etmek için Bağlan ve konuş düğmesine dokun.'); }
    else if (data.requestId === requestId && busy) {
      if (data.partial) completeResponse(data.partial); else failResponse();
      notice('Yanıt tamamlanamadı. Daha kısa bir mesajla yeniden deneyebilirsin.');
    }
  }
}
function completeResponse(text) {
  assistantNode.body.classList.remove('thinking'); assistantNode.body.textContent = text;
  addMessageTools(assistantNode.article, text);
  current.messages.push({ role: 'assistant', content: text });
  setBusy(false); voiceSending = false; saveSession(); announce('Aslı yanıtladı.');
  $('voice-listen').disabled = false; $('voice-orb').className = 'voice-orb';
  if (voiceMode) { $('voice-transcript').textContent = text; $('voice-state').textContent = 'Yanıtım hazır.'; }
  scrollBottom(); if (!voiceMode) $('message').focus();
}
function failResponse() {
  assistantNode?.article.remove();
  const last = current.messages.at(-1);
  if (last?.role === 'user') { $('message').value = last.content; current.messages.pop(); }
  setBusy(false); voiceSending = false; $('voice-listen').disabled = false; saveSession(); resizeInput();
}
function sendMessage(text = $('message').value) {
  text = String(text).trim().slice(0, 2000);
  if (!text || busy) return;
  if (ready && engineKind === 'cloud' && !window.puter?.auth.isSignedIn()) { resetEngine(); openCloudDialog(); return; }
  if (!ready) {
    if (loading) { pendingPrompt = text; notice('Cihaz modeli hazırlanıyor. İstersen hazırlığı iptal edip indirmeden bağlanabilirsin.'); }
    else openCloudDialog();
    return;
  }
  clearTimeout(handsFreeTimer); voice.stopListening(true); voice.cancelSpeech(); notice('');
  requestId++; outputText = ''; $('welcome').hidden = true;
  current.messages.push({ role: 'user', content: text }); messageElement('user', text);
  assistantNode = messageElement('assistant', 'Biraz düşünüyorum…', false); assistantNode.body.classList.add('thinking');
  $('message').value = ''; resizeInput(); setBusy(true); scrollBottom(); saveSession();
  if (engineKind === 'cloud') {
    const id = requestId; cloudAbort = new AbortController();
    const controller = cloudAbort;
    const timer = setTimeout(() => controller.abort(), 90000);
    generateCloud(window.puter, modelMessages(current.messages), controller.signal, text => handleEngine({ data: { type: 'token', requestId: id, text } }))
      .then(text => handleEngine({ data: { type: 'done', requestId: id, text } }))
      .catch(error => {
        if (id !== requestId || !busy) return;
        if (error.partial) completeResponse(error.partial); else failResponse();
        notice('Gelişmiş sohbet tamamlanamadı. İnternetini, Puter oturumunu ve kullanım kotanı kontrol et. Mesajın otomatik olarak tekrar gönderilmedi.');
      })
      .finally(() => { clearTimeout(timer); if (cloudAbort === controller) cloudAbort = null; });
  } else worker.postMessage({ type: 'generate', messages: modelMessages(current.messages), requestId });
}
function stopGeneration() {
  if (!busy) return;
  if (engineKind === 'cloud') {
    cloudAbort?.abort();
    if (outputText.trim()) completeResponse(outputText.trim()); else failResponse();
    requestId++; notice('Yanıt durduruldu. Sağlayıcı tamamlanan kullanımı kotana yansıtabilir.');
    return;
  }
  worker?.postMessage({ type: 'stop' });
  // Keep partial text, invalidate late worker messages, then release the model.
  const partial = outputText.trim();
  if (partial) completeResponse(partial); else failResponse();
  requestId++; resetEngine(); notice('Yanıt durduruldu. Devam etmek için Aslı’yı yeniden başlatabilirsin.');
}
function resizeInput() { $('message').style.height = 'auto'; $('message').style.height = Math.min($('message').scrollHeight, 150) + 'px'; }
function closeVoice() {
  voiceMode = false; voiceSending = false; clearTimeout(handsFreeTimer); voice.stopListening(true); voice.cancelSpeech();
  if ($('voice-dialog').open) $('voice-dialog').close();
}

$('composer').addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
$('message').addEventListener('input', resizeInput);
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(min-width: 761px)').matches) { event.preventDefault(); sendMessage(); } });
$('start-engine').addEventListener('click', openCloudDialog);
$('cancel-load').addEventListener('click', () => { resetEngine(); notice('Hazırlık durduruldu. Yeniden başlatarak devam edebilirsin.'); });
$('stop').addEventListener('click', stopGeneration);
$('dictate').addEventListener('click', () => voice.listening ? voice.stopListening() : voice.listen());
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('message').value = button.dataset.prompt; resizeInput(); $('message').focus(); }));
document.querySelectorAll('[data-action="new"]').forEach(button => button.addEventListener('click', () => {
  if (busy) stopGeneration();
  pendingPrompt = ''; clearTimeout(handsFreeTimer); voice.stopListening(true); voice.cancelSpeech();
  saveSession(); current = newSession(); $('message').value = ''; notice(''); renderConversation(); renderHistory(); $('message').focus();
}));
document.querySelectorAll('[data-action="settings"]').forEach(button => button.addEventListener('click', () => $('settings-dialog').showModal()));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
$('about-button').addEventListener('click', () => $('about-dialog').showModal());
$('auto-speak').checked = settings.autoSpeak;
$('save-history').checked = settings.saveHistory;
$('speech-rate').value = settings.rate;
$('rate-label').value = `${settings.rate}×`;
$('engine-mode').value = settings.engineMode;
$('auto-speak').addEventListener('change', event => { settings.autoSpeak = event.target.checked; persistSettings(); if (!settings.autoSpeak) voice.cancelSpeech(); });
$('voice-select').addEventListener('change', event => { settings.voice = event.target.value; persistSettings(); });
$('speech-rate').addEventListener('input', event => { settings.rate = Number(event.target.value); $('rate-label').value = `${settings.rate}×`; persistSettings(); });
$('engine-mode').addEventListener('change', event => { settings.engineMode = event.target.value; persistSettings(); });
$('save-history').addEventListener('change', event => {
  settings.saveHistory = event.target.checked; persistSettings();
  if (settings.saveHistory) saveSession();
  else { try { localStorage.removeItem(HISTORY_KEY); } catch {} }
});
$('test-voice').addEventListener('click', () => { if (voice.speaking) voice.cancelSpeech(); else voice.speak('Merhaba, ben Aslı. İstersen sohbet edelim. Seni dinliyorum.'); });
$('settings-dialog').addEventListener('close', () => voice.cancelSpeech());
$('clear-history').addEventListener('click', () => {
  if (busy) stopGeneration();
  voice.stopListening(true); voice.cancelSpeech(); pendingPrompt = ''; sessions = []; current = newSession();
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
  $('message').value = ''; renderConversation(); renderHistory(); announce('Sohbet geçmişi temizlendi.');
  $('clear-history').textContent = 'Geçmiş temizlendi'; setTimeout(() => $('clear-history').textContent = 'Geçmişi temizle', 1800);
});
$('export-chat').addEventListener('click', () => {
  if (!current.messages.length) { announce('İndirmek için önce bir sohbet başlat.'); return; }
  const text = '# Aslı ile sohbet\n\n' + current.messages.map(m => `${m.role === 'user' ? 'Sen' : 'Aslı'}:\n${m.content}`).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'asli-sohbet.txt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('voice-mode').addEventListener('click', () => {
  if (!ready) { openCloudDialog(); return; }
  voiceMode = true; voiceSending = false; notice(''); $('voice-dialog').showModal();
  $('voice-state').textContent = ready ? 'Mikrofona dokun ve konuşmaya başla.' : 'Önce Aslı’yı sohbet ekranından başlat. İlk hazırlık birkaç dakika sürebilir.';
  $('voice-listen').disabled = !ready || busy;
  if (!voice.canListen) { $('voice-state').textContent = 'Bu tarayıcı mikrofonla konuşmayı desteklemiyor. Yazılı sohbeti kullanabilirsin; yanıtları seslendirebilirim.'; $('voice-listen').disabled = true; }
  if (!ready) $('voice-heading').textContent = 'Önce tanışmaya hazırlanalım.';
});
$('close-voice').addEventListener('click', closeVoice);
$('voice-dialog').addEventListener('cancel', event => { event.preventDefault(); closeVoice(); });
$('voice-listen').addEventListener('click', () => { clearTimeout(handsFreeTimer); voiceSending = false; if (voice.listening) voice.stopListening(); else { $('voice-transcript').textContent = ''; voice.listen(); } });
$('voice-stop').addEventListener('click', () => { clearTimeout(handsFreeTimer); voice.stopListening(true); voice.cancelSpeech(); if (busy) stopGeneration(); });
$('hands-free').addEventListener('change', event => { if (!event.target.checked) clearTimeout(handsFreeTimer); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(handsFreeTimer); voice.stopListening(true); voice.cancelSpeech(); } });
window.addEventListener('pagehide', () => { voice.stopListening(true); voice.cancelSpeech(); worker?.terminate(); });
window.addEventListener('pagehide', () => cloudAbort?.abort());

function loadCloudSdk() {
  if (window.puter) return Promise.resolve(window.puter);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/'; script.async = true;
    const timer = setTimeout(() => { script.remove(); sdkPromise = null; reject(new Error('sdk_timeout')); }, 20000);
    script.onload = () => { clearTimeout(timer); if (window.puter) resolve(window.puter); else { sdkPromise = null; reject(new Error('sdk_unavailable')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('sdk_unavailable')); };
    document.head.append(script);
  });
  return sdkPromise;
}
async function openCloudDialog() {
  if (busy || loading) return notice('Önce devam eden yanıtı veya model hazırlığını durdur.');
  if ($('voice-dialog').open) closeVoice();
  if (!$('cloud-dialog').open) $('cloud-dialog').showModal(); $('cloud-connect').disabled = true; $('cloud-state').textContent = 'Bağlantı hazırlanıyor…';
  try { await loadCloudSdk(); $('cloud-connect').disabled = false; $('cloud-state').textContent = 'Puter giriş penceresi düğmeye dokunduğunda açılır.'; }
  catch { $('cloud-state').textContent = 'Puter bağlantısı yüklenemedi. İnternetini kontrol edip pencereyi yeniden açabilir veya cihaz modunu kullanabilirsin.'; }
}
$('cloud-open').addEventListener('click', openCloudDialog);
$('cloud-connect').addEventListener('click', async () => {
  const puter = window.puter;
  if (!puter) return;
  $('cloud-connect').disabled = true; $('cloud-state').textContent = 'Puter girişini tamamla…';
  try {
    if (!puter.auth.isSignedIn()) await puter.auth.signIn({ attempt_temp_user_creation: false });
    if (!puter.auth.isSignedIn()) throw new Error('not_signed_in');
    const draft = $('message').value;
    resetEngine(); engineKind = 'cloud'; ready = true; saveSession(); current = newSession();
    $('message').value = draft; resizeInput(); $('setup').hidden = true; renderConversation(); renderHistory();
    status(readyLabel(), 'ready'); document.querySelector('.small-note span').textContent = 'Puter üzerinden bağlı'; $('cloud-dialog').close(); notice('Gelişmiş sohbet açık. Gönderdiğin mesajlar Puter üzerinden işlenir ve hesabının kotasından düşer.'); $('message').focus();
  } catch { $('cloud-state').textContent = 'Bağlantı tamamlanmadı. Açılır pencereye izin verip yeniden deneyebilir veya cihaz modunu kullanabilirsin.'; }
  finally { $('cloud-connect').disabled = false; }
});
$('cloud-local').addEventListener('click', () => { if (busy) return; resetEngine(); $('cloud-dialog').close(); loadEngine(); });
if (!settings.saveHistory) { try { localStorage.removeItem(HISTORY_KEY); } catch {} }
if (!voice.canListen) $('dictate').title = 'Mikrofonla yazdırma bu tarayıcıda desteklenmiyor';
renderConversation(); renderHistory(); resizeInput();
