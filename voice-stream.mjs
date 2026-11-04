// Speak complete sentences while the text response is still arriving.
export class SpeechStream {
  constructor(voice) {
    this.voice = voice;
    this.offset = 0;
    this.cancelled = false;
    this.pending = Promise.resolve(true);
  }

  update(text, final = false) {
    if (this.cancelled) return;
    const source = text.trimStart();
    let rest = source.slice(this.offset);
    while (rest.trim()) {
      let cut = final ? rest.length : 0;
      if (!final) {
        for (const match of rest.matchAll(/[.!?…][”"’')]*(?=\s)/g)) {
          const end = match.index + match[0].length;
          if (end >= 24 && (rest.slice(0, end).match(/```/g) || []).length % 2 === 0) { cut = end; break; }
        }
        if (!cut && rest.length > 240 && !rest.includes('```')) cut = rest.lastIndexOf(' ', 220);
      }
      if (cut <= 0) break;
      const sentence = rest.slice(0, cut).trim();
      this.offset += cut;
      rest = source.slice(this.offset);
      if (sentence) this.pending = this.pending.then(ok => ok && !this.cancelled ? this.voice.speak(sentence) : false);
    }
  }

  async finish(text) {
    this.update(text, true);
    return (await this.pending) && !this.cancelled;
  }

  cancel() {
    this.cancelled = true;
    this.voice.cancelSpeech();
  }
}
