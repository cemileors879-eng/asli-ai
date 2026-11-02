# Aslı

Türkçe yazılı ve sesli yapay zekâ asistanı. GitHub Pages üzerinde çalışan, sunucu veya API anahtarı gerektirmeyen bir web uygulaması.

## Kullanım

“Aslı’yı başlat” düğmesi model dosyalarını indirir. İlk indirme cihaza göre 650 MB–1,5 GB'tır; tarayıcı önbelleği sonraki başlatmaları hızlandırır. Model hazırlanırken sekmeyi açık tutun. WebGPU ve shader-f16 destekleyen cihazlarda 1.7B model (yaklaşık 1,5 GB indirme), diğerlerinde tek iş parçacıklı WebAssembly ile 0.6B model (yaklaşık 650 MB indirme) kullanılır. WebGPU başlatılamazsa 0.6B modele geçilir; bu durumda iki model dosyası da indirilebilir. Grafik hızlandırması başarısızsa ayarlardan uyumlu mod seçilebilir. Model yüklenmeden önce gönderilen mesaj, hazırlık tamamlanınca gönderilir.

- Türkçe sohbet; yanıtların metin olarak akması.
- Cihazın Türkçe sesiyle yanıtları dinleme, ses seçimi ve hız ayarı.
- Destekleyen tarayıcılarda mikrofonla yazdırma ve sesli sohbet. Mikrofon kullanıcı tıklamasıyla başlar.
- İsteğe bağlı, yanıt sonrası tekrar dinleme. Sekme gizlenince veya sesli sohbet kapanınca mikrofon durur.
- İsteğe bağlı cihaz içi geçmiş, yeni sohbet, geçmiş temizleme ve sohbeti metin dosyası olarak indirme.
- Mobil görünüm, klavye kullanımı, ekran okuyucu etiketleri ve azaltılmış hareket tercihi.

## Sınırlar ve veri akışı

Qwen3 0.6B / 1.7B küçük bir modeldir; Türkçe kalitesi, muhakemesi ve bilgisi sınırlıdır. İnternet araması, güncel veri erişimi veya arka planda görev yürütme yapmaz. Yanıt hızı ve çalışabilirlik cihazın belleğine, tarayıcısına ve işlem gücüne bağlıdır. Uzun konuşmalarda modele son mesajların sınırlı bir bölümü verilir.

Cihaz modunda yazılı sohbetin model çıkarımı cihazda yapılır. Model dosyaları Hugging Face, çalışma kitaplığı ve WebAssembly dosyaları jsDelivr üzerinden alınır. Yazı tipleri Google Fonts'tan yüklenir. Bu kaynaklara sohbet metni gönderilmez. Mikrofonun Web Speech tanıması tarayıcı sağlayıcısının sunucularını kullanabilir. Seslendirme cihazın sunduğu Türkçe sese bağlıdır; özel veya klonlanmış bir ses değildir.

Geçmiş kaydı varsayılan olarak kapalıdır. Kayıt açıldığında son 12 sohbetin her birinden son 80 mesaj tarayıcının localStorage alanına yazılır. Bu, cihazda uygulamaya özel şifrelenmemiş bir kayıttır. Kayıt kapatıldığında kalıcı sohbet geçmişi silinir. Model önbelleği ve ses ayarları sohbet geçmişinden ayrıdır. Model dosyalarını silmek için tarayıcının bu siteye ait depolamasını temizleyin.

## Geliştirme ve yayın

Depo kökündeki dosyalar doğrudan statik olarak sunulur. Derleme adımı veya gizli anahtar yoktur. Yerel kontrol için:

```sh
python -m http.server 8000 
node --test core.test.mjs cloud.test.mjs
```

GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`. Yayın doğrudan depo kökündeki statik dosyalardan yapılır. `.nojekyll` dosyası Pages için korunur.

Bağımlılıklar sürümlere sabitlenmiştir: Transformers.js 3.8.1 ve Qwen3 ONNX revizyonları `558750086ed49d78cb701ed6fa85af33fd16453f` (0.6B), `e1da89f` (1.7B). Modelin lisansı Qwen model kartında, kitaplıkların lisansları kendi kaynaklarında bulunur.

## Kaynaklar

- https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX
- https://huggingface.co/docs/transformers.js/v3.8.1/en/pipelines
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis


## Gelişmiş sohbet

“Gelişmiş sohbet” düğmesiyle Puter hesabına bağlanarak GPT-5.4 Nano kullanılabilir. Bu seçenek model indirmesi gerektirmez; mesajlar Puter ve model sağlayıcısına iletilir. Puter oturumu kullanıcı tıklamasıyla açılır; bağlantı kurulunca önceki sohbetin aktarılmaması için yeni sohbet başlatılır. Kullanım kullanıcının Puter hesabına aittir; ücretsiz kota sınırlıdır ve ek kullanım ücretli olabilir. Durdurmak sağlayıcıya ulaşmış isteğin ücretlendirmesini tamamen iptal etmeyebilir. Sağlayıcı hesap bağlantısı gerektirdiğinden canlı bulut yanıtı bu oturumda doğrulanmadı. Kota bilgisi: https://docs.puter.com/user-pays-model/
