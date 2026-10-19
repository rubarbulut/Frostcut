# B004 ortak sözleşmeler

Bu belge uygulama sınırlarını sabitler. Var olan exported tipler esastır;
aşağıdaki yeni alan adları **önerilen contract**'tır, mevcutmuş gibi import
edilmeyecek. Manager baseline'da son tip/modül yolunu bir defa ilan eder.

## Sahiplik

| Alan | Tek yazan |
| --- | --- |
| App, global store, Project doğrulama/sequence şeması, recipe core uyumluluğu, Vite/CI | Manager |
| Pipeline run/queue durumu, output session/source referansları, entegrasyon testleri | Manager |
| YouTube transport/OAuth, publish client, render adapter ve bunların testleri | Demir |
| Candidate finder, evidence, source→timeline adaptörü, aday/cache testleri | Kaan |
| Audio profile/cache/provider/worker, bus/DSP/export ses yolu, audio testleri | Okan |
| Profil formu/storage, review screen, publishing formu ve scoped UI CSS/testleri | Barış |

Bir başkasının alanında değişiklik gerekirse kişi raporuna küçük interface/patch
isteği yazın. Manager birleştirir veya tek sahip atar. Aynı dosyaya iki kişinin
eşzamanlı geniş düzenlemesi yok. Büyük formatlama/rename refactor'ı bu batch'in işi değil.

## 1. Profil ve öneri

Mevcut `CreatorProfile`, `CreatorProposal`, `createCreatorRecipe`,
`creatorRecipeIsCurrent`, `materializeCreatorOutput` canonical kalır.

- `CreatorProposal.ranges` kaynak **timeline saniyesi**. Asset/source saniyesi
  doğrudan verilmez. Her önerinin id'si bir plan içinde benzersizdir.
- Profilde `shortCount` 0–12; en fazla bir long. Hedef süre bir tercih, kartın
  actual seconds değeri gerçek assembly süresidir. Kısıt sağlanamıyorsa eksik
  çıktı ve nedeni gösterilir; boş/rastgele kopya ile liste doldurulmaz.
- Recipe immutable kaynak Project ve gerçek File referanslarına bağlıdır.
  JSON restore recipe için yetki/kimlik kanıtı değildir. Nested desteği eklenmiş
  varsayılmayacak. Uyumsuz durumda açık guard korunur.
- Genel `CreatorProposal` şemasını büyütmek zorunda değilsiniz. `proposalId` ile
  bağlı ayrı evidence kaydı: yöntem `manual | equal-parts | signals`, kullanılan
  gerçek sinyal türleri, timeline aralıkları, unavailable nedenleri, algoritma
  sürümü. Heuristic skor gerçek başarı olasılığı veya SEO puanı değildir.

## 2. Kaynak analizi

- Asset profile zamanları source domain; Kaan'ın adaptörü timeline domain üretir.
  Zaman birimi saniye; sampleRate Hz; signed/finite sınırlar doğrulanır.
- Runtime anahtar: gerçek File kimliği + analizi etkileyen ayarlar + algoritma
  sürümü. AssetId yalnızca proje içi etikettir. Aynı dosya adından güven türetilmez.
- Timeline cache'i kaynak edit/sinyal revizyonu ve analiz seçeneklerini içerir;
  output selection ayrı ve ucuzdur. Long/Shorts için aynı ölçüm yeniden yapılmaz.
- Ortak provider alanları: kaynak identity/revision, options revision, timebase,
  `available | no-audio | missing-source | cancelled | failed`, ölçülmüş telemetry,
  signal/generation. Kesin isimleri Okan/Kaan Manager'a erken ilan eder.
- Signal yokken profil uydurulmaz. Olmayan motion/ASR/reaction modeli varmış gibi
  çağrılmaz. Bir cache entry sayısı sınırlı olsa da byte belleği sınırsız kalamaz.

## 3. Çıktı ve render

- Output başına ayrı project/sequence ve metadata; parent kaydı korunur.
  Source dosyalarını global load temizliğiyle kaybetmeyin. Bir çıktının trim,
  caption veya title değişimi başka çıktıyı değiştirmemeli.
- Render işi immutable output + media references + render settings ile başlar.
  Artefaktın runtime kimliği aynı görüntü/ses revision'ına bağlıdır. Boyut/FPS/
  clip/effect/DSP değişimi artefaktı geçersizleştirir; salt açıklama değişimi encode
  gerektirmez. Persist edilen fingerprint tek başına dosya doğrulama yetkisi değildir.
- Tek encode slot'u. Basit sıra durumları: queued → rendering → rendered;
  cancelled/failed ayrı. Failed/cancelled iş otomatik upload olmaz. Blob/URL/buffer
  sahipliği ve revoke/cleanup bir yerde tanımlanır; kullanımda artefakt erken silinmez.
- Uyumsuz native iş tam renderer'a düşer; efekt/ses/kesme semantiği düşürülmez.
  Preview master mute bir izleme tercihiyse kalıcı render sesini değiştirmez.

## 4. Kontrolcü ve inceleme UI

- Tek runId/generation; idempotent başlatma, AbortSignal ve geç sonucu reddetme.
  Şematik durumlar: idle → preparing → reviewing → rendering → rendered →
  uploading → uploaded/processing → scheduled/published. cancelled, failed,
  not-configured ve stale ayrı durumlar. Gerçekte uygulanmamış ileri durum yok.
- Profil/öneri incelemesi yan etkisiz. Gerçek onApply/onExport/onPublish adapter'ı
  yoksa düğme hazır gösterilmez. Async callback başarısızsa ekran/veri korunur.
- Barış'ın UI props'u `sourceProject`, File map + media revision, canonical
  profile/proposals/evidence, job/error/capability ve async callback'leri açıkça
  alır. Store fallback'i yalnızca aynı güvenli davranışı garanti ediyorsa kalır.
- Kullanıcı preview oynatma hızı render zamanlaması değildir. UI/selection değişimi
  analiz/re-encode tetiklemez; gerçek kaynak değişimi bunu gerektiği ölçüde yapar.

## 5. Yayın ve metadata

- `PublishingMetadata` canonical; çıktı/sequence sahipliği açık. YouTube tags
  ile hashtag ayrı. Şema değişikliğini Manager doğrulama ve eski kayıt uyumuyla yapar.
- Kimlik bilgileri bu şemanın/profilin/proje export'unun parçası değildir.
  İlk capability connected olsa bile upload/publication aynı şey değildir.
- Rendered video + seçili metadata + açık hedef channel/account bir yayın işine
  bağlanır. Çift tık/retry aynı run için yeni insert üretemez. Google tamamlandı
  cevabı kaybolduysa önce mevcut session sorgulanır. Session kimliği hassas iş verisi
  sayılır; log/proje JSON'unda sızdırılmaz. Kalıcı resume yoksa varmış gibi söylenmez.
- Kullanıcı beyanları ve görünürlük açık seçilir; metadata sessizce kesilmez.
  API yanıtı başarı/visibility kaynağıdır. Yükleme tarihi gerçek yayın tarihi değildir.
- Hesap kurulumu/ücretli research yoksa adaptör not-configured/not-researched döner.
  Elle metadata indirme ve yerel export çalışır. Otomatik giriş veya gerçek kanal
  yüklemesi bu geceki doğrulama yolu değildir.

## 6. Git, rapor ve kalite kapısı

- Tek kaynak baseline SHA ve kişi başına çalışma yolu `BASELINE.md`.
  Git dal/kopya yönetimini Manager yapar. Ortak dirty tree'de kör cherry-pick,
  reset/clean, başkasının WIP'ini silme veya `git add .` ile bilinmeyen her şeyi
  toplama yok. Kişi kendi explicit dosyalarını stage eder; küçük commit/push.
- Kaynakta bulunan untracked modül, GitHub'da teslim edilmiş modül değildir.
  Yeni import'ların bütün bağımlılıkları teslim commit'inde izlenmiş olmalı.
- Her kişi kendi raporuna: durum (working/ready/blocked-external), tam SHA,
  public API, değişen davranış, komut/test sayısı, gerçek/sentetik fixture,
  yapılmayan ağır test ve dış bağımlılık. Manager raporu birleştirir.
- Test sayısı hedef değildir. Gerçek üretim controller/handler ve hata sınırı
  sınanır. SSR, mock provider ve gerçek browser kanıtı ayrı etiketlenir.

## 7. Güncel birincil API kaynakları

19 Ekim 2026'da Director tarafından açılıp kontrol edildi; uygulayıcı ihtiyaç
duyduğu ayrıntıyı aynı resmi belgelerden yeniden doğrular.

- [YouTube resumable protokolü](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol):
  session URI, auth başlıkları, 308/Range, eksik Range, offset sorgusu, session expiry,
  backoff ve final chunk dışındaki 256 KiB katı kuralı. Daha çok chunk daha hızlı
  demek değildir; gereksiz HTTP isteklerini çoğaltmayın.
- [videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert):
  görünürlük varsayıma bırakılmaz; uygulama açık değer gönderir. Hafızadan eski
  API proje/audit veya kota kısıtını kesin güncel kural diye yazmayın.
- [Video status/publishAt](https://developers.google.com/youtube/data/reference/rest/v3/videos):
  publishAt için private ve geçmişte yayınlanmamış video koşulları; geçmiş bir
  tarih anında yayına yol açabilir. Yerel zaman → UTC ve gelecek tarih doğrulanır.
- [OAuth web-server akışı](https://developers.google.com/identity/protocols/oauth2/web-server):
  secret sunucu sınırı, redirect URI, state/CSRF doğrulaması ve refresh davranışı.

Bu bağlantılar hesap kurulmuş veya gerçek yayın denenmiş olduğu anlamına gelmez.
