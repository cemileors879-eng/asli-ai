export const AVATAR_KEY = 'asli.avatar.v1';
export const validAvatar = value => typeof value === 'string' && value.length < 400000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

export function setupAvatar({ input, change, reset, images, notify }) {
  const display = source => { images.forEach(image => { image.src = source || './asli-avatar.jpg'; }); reset.hidden = !source; };
  try { const stored = localStorage.getItem(AVATAR_KEY); if (validAvatar(stored)) display(stored); } catch {}
  change.addEventListener('click', () => input.click());
  reset.addEventListener('click', () => { try { localStorage.removeItem(AVATAR_KEY); } catch {} display(''); });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { notify('En fazla 8 MB boyutunda bir JPG, PNG veya WebP görsel seç.'); return; }
    const url = URL.createObjectURL(file);
    change.disabled = true;
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
      const ctx = canvas.getContext('2d');
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      if (!ctx || !size) throw new Error('invalid_image');
      ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 320, 320);
      const source = canvas.toDataURL('image/jpeg', .86);
      if (!validAvatar(source)) throw new Error('invalid_image');
      display(source);
      try { localStorage.setItem(AVATAR_KEY, source); }
      catch { notify('Görsel bu oturum için değiştirildi; tarayıcı kalıcı kayda izin vermedi.'); }
    } catch { notify('Görsel açılamadı. Başka bir JPG, PNG veya WebP görsel seç.'); }
    finally { URL.revokeObjectURL(url); change.disabled = false; }
  });
}
