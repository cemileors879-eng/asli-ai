export const SETTINGS_KEY = 'asli.settings.v1';
export const HISTORY_KEY = 'asli.history.v1';
export const DEFAULT_SETTINGS = Object.freeze({ autoSpeak: false, voice: '', rate: 1, saveHistory: false, engineMode: 'auto' });

export function cleanSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    autoSpeak: source.autoSpeak === true,
    voice: typeof source.voice === 'string' ? source.voice.slice(0, 300) : '',
    rate: Number.isFinite(source.rate) ? Math.max(.7, Math.min(1.3, source.rate)) : 1,
    saveHistory: source.saveHistory === true,
    engineMode: source.engineMode === 'wasm' ? 'wasm' : 'auto',
  };
}

export function cleanSessions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter(s => s && typeof s.id === 'string' && Array.isArray(s.messages)).map(s => ({
    id: s.id.slice(0, 100),
    title: typeof s.title === 'string' ? s.title.slice(0, 60) : 'Yeni sohbet',
    messages: s.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()).slice(-80).map(m => ({ role: m.role, content: m.content.slice(0, 6000) })),
  }));
}

export function modelMessages(messages, budget = 4500) {
  const clean = messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim());
  const result = [];
  let length = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    const content = clean[i].content.slice(-2000);
    if (result.length && (length + content.length > budget || result.length >= 10)) break;
    result.unshift({ role: clean[i].role, content });
    length += content.length;
  }
  while (result.length && result[0].role !== 'user') result.shift();
  return result;
}

export function speechText(text) {
  return text.replace(/```[\s\S]*?```/g, ' Kod örneğini ekranda görebilirsin. ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_#`~]/g, '').replace(/\s+/g, ' ').trim();
}

export function speechChunks(text, size = 180) {
  const clean = speechText(text);
  const chunks = [];
  let rest = clean;
  while (rest.length > size) {
    const prefix = rest.slice(0, size);
    const sentenceEnd = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '));
    const split = sentenceEnd > 50 ? sentenceEnd + 1 : Math.max(prefix.lastIndexOf(' '), 1);
    chunks.push(rest.slice(0, split).trim());
    rest = rest.slice(split).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// Shared conversation style for cloud and device engines.
export const ASLI_PERSONALITY = "Sen Aslı AI'sın, Türkçe konuşan bir yapay zekâ sohbet arkadaşısın.\nÜslubun gündelik, sıcak, muzip ve kendine güvenli. Günlük sohbette çoğunlukla 1–3 kısa cümle kur; kullanıcı ayrıntı isterse gerektiği kadar açıkla. Söylenen bir kelimeyi veya önceki mesajdaki ayrıntıyı yakalayıp hafif bir espriyle karşılık verebilirsin. Her mesajda şaka, iltifat, hitap veya soru kullanma. Zoraki espri, uzun süslü giriş, sürekli onaylama ve hazır cevap kalıplarından kaçın. Emojiyi seyrek kullan; sesli okunabilecek doğal cümleler kur.\nTakılmaların incitici veya küçümseyici olmasın. Kullanıcı sıcak ya da flörtöz bir ton açarsa aynı ölçüde hafifçe eşlik edebilirsin; kendiliğinden romantik hitaplar, kıskançlık veya sahiplenme ekleme.\nKullanıcı yorgunluk, üzüntü, korku, sağlık sorunu ya da ciddi bir mesele anlatıyorsa şakayı bırak; sakin ve ilgili yanıt ver. Duygusunu varsayma, öğüt yağdırma; soru yalnızca anlamaya veya yardım etmeye yarayacaksa sor.\nKonuşmanın bağlamını takip et; olmayan ortak anılar, kişiler veya ilişkiler uydurma. Gerçek Aslı olduğunu ya da onun duygularını bildiğini iddia etme. Bilmediğini açıkça söyle. İnternete, WhatsApp'a veya gerçek dünyada işlem yapma araçlarına erişimin yok; eriştiğini veya işlem yaptığını söyleme.";
