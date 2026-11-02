import { speechChunks } from './core.mjs';

export class Voice {
  constructor({ settings, onState, onTranscript, onError, onVoices }) {
    this.settings = settings;
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.synth = window.speechSynthesis;
    this.Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = null;
    this.speechId = 0;
    this.voices = [];
    this.listening = false;
    this.speaking = false;
    const update = () => {
      this.voices = this.synth?.getVoices() || [];
      onVoices(this.voices);
    };
    this.synth?.addEventListener('voiceschanged', update);
    update();
  }

  get canListen() { return !!this.Recognition; }
  get canSpeak() { return !!this.synth && !!window.SpeechSynthesisUtterance; }

  listen() {
    if (!this.canListen) { this.onError('Bu tarayıcı mikrofonla yazdırmayı desteklemiyor. Chrome ile açabilir veya mesajını yazabilirsin.'); return; }
    this.cancelSpeech();
    this.stopListening(true);
    const recognition = new this.Recognition();
    this.recognition = recognition;
    let finalText = '';
    let lastText = '';
    let aborted = false;
    let failed = false;
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (this.recognition !== recognition) return; this.listening = true; this.onState('listening'); };
    recognition.onresult = event => {
      if (this.recognition !== recognition) return;
      finalText = ''; let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      lastText = (finalText + interim).trim().slice(0, 2000);
      this.onTranscript(lastText, false);
    };
    recognition.onerror = event => {
      if (this.recognition !== recognition) return;
      failed = true;
      const errors = { 'not-allowed': 'Mikrofon izni verilmedi. Tarayıcının site ayarlarından izin verip yeniden deneyebilirsin.', 'service-not-allowed': 'Tarayıcının konuşma tanıma hizmeti kullanılamıyor. Mesajını yazabilirsin.', 'audio-capture': 'Mikrofon bulunamadı. Cihazının mikrofonunu kontrol et.', 'network': 'Konuşma tanıma hizmetine ulaşılamadı. İnternet bağlantını kontrol et.', 'no-speech': 'Ses algılanmadı. Mikrofona dokunarak yeniden deneyebilirsin.' };
      if (event.error !== 'aborted') this.onError(errors[event.error] || 'Ses tanınamadı. Tekrar konuşabilir veya mesajını yazabilirsin.');
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.listening = false;
      this.recognition = null;
      this.onState('idle');
      if (!aborted && !failed && (finalText || lastText).trim()) this.onTranscript((finalText || lastText).trim().slice(0, 2000), true);
    };
    recognition._cancel = () => { aborted = true; };
    try { recognition.start(); }
    catch { this.recognition = null; this.listening = false; this.onState('idle'); this.onError('Mikrofon başlatılamadı. Tarayıcı izinlerini kontrol edip yeniden dene.'); }
  }

  stopListening(abort = false) {
    const recognition = this.recognition;
    if (!recognition) return;
    if (abort) {
      recognition._cancel?.();
      this.recognition = null;
      this.listening = false;
      try { recognition.abort(); } catch {}
      this.onState('idle');
    } else { try { recognition.stop(); } catch {} }
  }

  cancelSpeech() {
    this.speechId++;
    this.synth?.cancel();
    this.speaking = false;
    if (this.cancelPending) { this.cancelPending(false); this.cancelPending = null; }
    this.onState('idle');
  }

  async speak(text) {
    this.stopListening(true);
    this.cancelSpeech();
    if (!this.canSpeak) { this.onError('Bu tarayıcı seslendirmeyi desteklemiyor. Yanıtı ekrandan okuyabilirsin.'); return false; }
    const voices = this.synth.getVoices();
    const selected = voices.find(v => v.voiceURI === this.settings.voice) || voices.find(v => /^tr(-|_)/i.test(v.lang)) || voices.find(v => /^tr/i.test(v.lang));
    if (!selected && voices.length) { this.onError('Cihazında Türkçe konuşma sesi bulunamadı. Cihazının metin okuma ayarlarından Türkçe ses yükle.'); return false; }
    const chunks = speechChunks(text);
    if (!chunks.length) return false;
    const id = this.speechId;
    this.speaking = true;
    this.onState('speaking');
    for (const chunk of chunks) {
      if (id !== this.speechId) return false;
      const completed = await new Promise(resolve => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = 'tr-TR';
        if (selected) utterance.voice = selected;
        utterance.rate = this.settings.rate;
        utterance.pitch = 1;
        let settled = false;
        const finish = result => { if (settled) return; settled = true; clearTimeout(timer); this.cancelPending = null; resolve(result); };
        const timer = setTimeout(() => { this.onError('Ses motorundan yanıt gelmedi. Cihazında Türkçe sesi etkinleştirip yeniden dene.'); finish(false); this.synth.cancel(); }, 45000);
        this.cancelPending = finish;
        utterance.onend = () => finish(true);
        utterance.onerror = event => {
          if (id === this.speechId && !['interrupted', 'canceled'].includes(event.error)) this.onError('Ses başlatılamadı. Yanıtın altındaki dinleme düğmesine dokunabilir veya ses ayarlarını kontrol edebilirsin.');
          finish(false);
        };
        this.synth.speak(utterance);
        this.synth.resume();
      });
      if (!completed) { if (id === this.speechId) { this.speaking = false; this.onState('idle'); } return false; }
    }
    if (id !== this.speechId) return false;
    this.speaking = false;
    this.onState('idle');
    return true;
  }
}
