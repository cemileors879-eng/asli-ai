// Model inference is isolated from the interface in a dedicated worker.
const MODELS = {
  wasm: { id: 'onnx-community/Qwen3-0.6B-ONNX', revision: '558750086ed49d78cb701ed6fa85af33fd16453f', dtype: 'q8' },
  webgpu: { id: 'onnx-community/Qwen3-1.7B-ONNX', revision: 'e1da89f', dtype: 'q4f16' },
};
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
let generator;
let stopping;
let api;
let loading = false;
let generating = false;
let mode = 'wasm';
const send = data => self.postMessage(data);
const SYSTEM = 'You are Aslı, a friendly AI assistant. Always answer in Turkish. Give a direct answer in one or two short sentences. Say you do not know when unsure. You have no internet or tools.';

async function initialize(requestedMode) {
  if (generator) { send({ type: 'ready', mode }); return; }
  if (loading) return;
  loading = true;
  try {
    send({ type: 'phase', text: 'Sohbet motoru yükleniyor…' });
    api = await import(LIBRARY);
    api.env.allowLocalModels = false;
    api.env.backends.onnx.wasm.numThreads = 1;
    api.env.backends.onnx.wasm.proxy = false;
    mode = 'wasm';
    if (requestedMode !== 'wasm' && self.navigator.gpu) {
      try {
        const adapter = await self.navigator.gpu.requestAdapter();
        if (adapter?.features.has('shader-f16')) mode = 'webgpu';
      } catch {}
    }
    const progress = progress => {
      if (progress.status === 'progress') send({ type: 'progress', file: progress.file, loaded: progress.loaded || 0, total: progress.total || 0, progress: progress.progress || 0 });
      if (progress.status === 'done') send({ type: 'phase', text: 'Model cihazına hazırlanıyor…' });
    };
    const config = MODELS[mode];
    const options = { dtype: config.dtype, device: mode, revision: config.revision, progress_callback: progress };
    try { generator = await api.pipeline('text-generation', config.id, options); }
    catch (error) {
      if (mode !== 'webgpu') throw error;
      send({ type: 'phase', text: 'Uyumlu moda geçiliyor. Farklı model dosyası indirilebilir…' });
      mode = 'wasm';
      const fallback = MODELS.wasm;
      generator = await api.pipeline('text-generation', fallback.id, { ...options, dtype: fallback.dtype, revision: fallback.revision, device: 'wasm' });
    }
    stopping = new api.InterruptableStoppingCriteria();
    send({ type: 'ready', mode });
  } catch (error) {
    generator = null;
    send({ type: 'error', stage: 'load', message: String(error?.message || error).slice(0, 400) });
  } finally { loading = false; }
}

async function generate(messages, requestId) {
  if (!generator || generating) return;
  generating = true;
  let text = '';
  try {
    stopping.reset();
    const streamer = new api.TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: token => { text += token; send({ type: 'token', requestId, text }); },
    });
    const inputs = generator.tokenizer.apply_chat_template([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'Sen kimsin?' },
      { role: 'assistant', content: 'Ben Aslı, Türkçe konuşan bir yapay zekâ asistanıyım. Seninle sohbet edebilirim.' },
      ...messages,
    ], {
      tokenize: true,
      add_generation_prompt: true,
      return_dict: true,
      enable_thinking: false,
    });
    await generator.model.generate({
      ...inputs,
      max_new_tokens: 96,
      do_sample: false,
      repetition_penalty: 1.1,
      streamer,
      stopping_criteria: stopping,
    });
    send({ type: 'done', requestId, text: text.trim() });
  } catch (error) { send({ type: 'error', requestId, stage: 'generate', message: String(error?.message || error).slice(0, 400), partial: text.trim() }); }
  finally { generating = false; }
}

self.onmessage = ({ data }) => {
  if (data.type === 'load') initialize(data.mode);
  if (data.type === 'generate') generate(data.messages, data.requestId);
  if (data.type === 'stop') stopping?.interrupt();
};
