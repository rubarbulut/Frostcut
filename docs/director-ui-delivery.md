# UI düzeltmeleri — 19 Ekim 2026

Rubar'ın isteğiyle ilk UX düzeltme paketi uygulandı. Okan ve Manager çalışmaya
devam ediyor; diğer uygulayıcıların tamamlandığı bilgisi Rubar'dan geldi.

## Teslim edilenler

- Başlangıçtaki ana işlem doğrudan kayıt seçer. Kayıt incelendikten sonra yeni
  YouTube 16:9 projesi açılır. İptal edilen dosya seçimi mevcut projeyi değiştirmez.
  Boş proje, örnek proje, ses örneği ve URL aktarımı erişilebilir kalır.
- Editörün sol araçları yatay taşmaya saklanmaz. Inspector açılıp kapanabilir;
  varsayılan görünüm önizlemeye daha çok yer ayırır. Yayın paneli genişler.
  Başlık çubuğu dar alanlarda satıra geçer; Export erişimi korunur.
- Kayıt ekleme → düzenlemeyi inceleme → yayın taslağı akışı görünür.
  Proje yedeği indirme, yeni proje ve Creator Tools düğmeleri bağlandı.
- Sabit Saved/GPU/hazır etiketleri yerine kayıt durumu, native export erişimi
  ve gerçek zaman çizelgesi altyazısı kullanılır. Ölçülmemiş LUFS, GPU hızı,
  retention ve trend iddiaları kaldırıldı. Landing simülasyonları örnek olarak
  işaretlendi; tamamlanmış landing tema/etkileşim çalışması korundu.
- Post Kit, mevcut yayın metadata sistemiyle birleştirildi. YouTube uzun video
  varsayılan; Shorts/Reels/TikTok seçilebilir. Sekmeler aynı sequence taslağını
  paylaşır; bu durum açıklanır. Alanlar proje/sequence kaydına yazılır ve geçmişle
  birlikte değişir. Boş projeye hazır yayın çıktısı gösterilmez. Başlık ve
  açıklama ayrı kalır; hashtag'ler başlığa otomatik eklenmez. Anahtar sözcükler
  mevcut Unicode destekli, gerçek deşifreye dayanan yardımcıdan alınır.
- Format işlemleri `changeAspectRatio` kullanır; export boyutları da güncellenir.
  Inspector özel boyut/FPS alanları export ayarını eşler. Format + safe-area tek
  commit olur. Toplu görünüm ayarları uzun videoyu kendiliğinden 9:16'ya çevirmez.
  Sequence yeniden adlandırma artık format presetini değiştirmez.
- Demir'in native export doğrulamaları saf `turbo-eligibility.ts` modülüne
  ayrıldı. Sunucu artık browser FFmpeg modülünü config yüklenirken çekmez.
  Tamamlanan native handler ve testleri bu sınırla birlikte teslim edilir.
- Önceden izlenen timeline testinin eksik `virtualized-timeline.ts` bağımlılığı,
  Kaan'ın mevcut tamamlanmış dosyasından teslim paketine alındı.

## Kanıt ve sınırlar

- Temiz tabanlı `codex/creator-pipeline` çalışma kopyasında `tsc --noEmit` geçti.
- Tek worker ile 5 dosya / 51 test geçti; süre 2,35 saniye. Native handler
  kontrolleri mock subprocess kullanır; gerçek encode/GPU performans kanıtı değildir.
- Normal Vite config'iyle localhost sunucusu açıldı. Geçici UI-only config kullanılmadı.
- Tarayıcıda 1280×720 görünüm, YouTube varsayılanı, araçlara erişim ve gerçek
  form düzenleme kontrol edildi. Küçük JSON proje dosyasıyla A taslağının B'ye
  sızmadığı, A'ya dönünce ve sayfa yeniden açılınca korunduğu doğrulandı.
  Bu projede medya dosyası yüklenmedi veya oynatılmadı.
- Ağır build, render, model, ses analizi ve uzun tarayıcı test paketi çalıştırılmadı.
  Mobil/tam klavye erişilebilirliği ve gerçek medya ile export regresyonu ayrıca
  doğrulanmalı. Diğer uygulayıcıların değişiklikleri son toplu entegrasyon bekler.

Bu paket otomatik içerik anlama, gerçek trend araştırması, OAuth veya tek tuş
yayın sisteminin tamamlandığı anlamına gelmez. Creator recipe çekirdeğinin canlı
akışa entegrasyonu ve bu servislerin gerçek uygulaması sonraki ürün işleri.

## Manager entegrasyonu

Teslim dalı: `codex/creator-pipeline`. Kodun aynı kopyası ana çalışma klasöründe
yerel olarak uygulanmıştır; iki kez uygulamayın. Ortak checkout'taki mevcut
değişiklikleri kaybetmeden bu dalın commit'leriyle uzlaştırın. Okan'ın
`preview-audio`, audio bus/DSP, model ve medya çalışmalarına bu UI paketi dokunmadı.
`styles.css`, Timeline ve Preview üzerindeki diğer değişiklikler topluca staged
edilmedi. B002 kabul raporunu gerçek entegrasyondan sonra güncelleyin.

Öncelik: Okan'ın teslimi → Manager birleşimi → son birleşik sürümde kısa davranış
kontrolü → korumalı PR/üretim yayını. Bu belge yeni paralel görev ataması değildir.
