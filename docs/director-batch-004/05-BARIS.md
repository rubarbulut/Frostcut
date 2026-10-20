# B004-B — BARIŞ goal

## Goal

**Kullanıcının her kayıtta yeniden ayar girmediği kalıcı CreatorProfile formunu,
kanıtı ve gerçek süreleri gösteren erişilebilir recipe incelemesini ve çıktı
başına korunan yayın taslağı akışını tamamla; bütün görünen eylemler gerçek
kontrolcü callback'ine bağlı veya açık sebeple devre dışı olsun.**

Codex'in UI düzeltmelerini koru; yeni landing/baykuş/tema işlerini sıfırdan
tasarlama. Ana sorun artık ekran süslemek değil, kullanıcının kayıt → çıktı
sonucuna anlaşılır ve güvenilir biçimde ulaşması.

## B0 — Kalıcı profil

1. Tek canonical `CreatorProfile` ve `parseCreatorProfile` kullan. İkinci profil
   modeli oluşturma. Ad, dil, oyun, hedef kitle, commentary, uzun/kısa hedefi,
   shortCount ve fillMode gerçek form alanları olsun. Kanal adı OAuth hesabı demek
   değildir. Hesap veya otomatik yayın izni profilden türetilmez.
2. Kayıt/geri yükleme sürümlü ve hataya dayanıklı olsun. Bozuk JSON, eski veri,
   storage kullanılamaması, NaN/Infinity ve sınır dışı girişler anlaşılır hataya
   dönüşür. Gizli alan veya token kaydetme. Mevcut IndexedDB/idb-keyval kullanılabilir.
3. `shortCount=0` geçerlidir; form bunu 2'ye çeviremez. Boş oyun/unspecified
   commentary kullanıcı tercihi olarak korunur; "Action Gameplay" gibi uydurma
   varsayılanı kullanıcının gerçek içeriği diye sunma. Sonraki kayıtta profil geri gelir.

## B1 — Recipe incelemesi ve eylem güvenliği

- Mevcut `RecipeReviewScreen` bileşenini geliştir; App mount ve global kontrolcü
  Manager'a aittir. Public props/callback sözleşmesini erken raporla.
- Tercih edilen öneriler Kaan'ın gerçek proposals + evidence kayıtlarıdır.
  Varsayılan fallback ilk dilime "hook/key highlight", ikinci dilime "mid-video
  highlight" diyemez. `manual`/`equal-parts` etiketi ve eksik analiz durumu kullan.
  Kaan modülü henüz hazır değilken manuel aralık yolunu gerçekten çalıştır.
- Her kartta gerçek saniye, hedef saniye, kaynak aralığı, seçim yöntemi/gerekçesi,
  missing evidence, format ve gerçek caption/metadata/export durumu göster.
  `1/3 hazır` gibi sayı gerçek hazırlanmış nesneye dayanır; config flag'ine değil.
- Seçim ayrı; uygula ayrı. Açılış/kart seçimi store commit, render veya ASR
  başlatmasın. Birden çok çıktı seçme, dışa aktarılacak liste ve iptal erişilebilir olsun.
- Stale recipe veya missing/relinked File anında işlemleri engeller. `Map` yerinde
  değişince sırf React referansı aynı diye eski görünüm hazır kalmasın; Manager'ın
  mediaRevision/source generation sinyalini props olarak kullan.
- Parent callback yokken eylem saklanır/devre dışıdır; boş callback sonrası modal
  kapatıp başarı algısı yaratılmaz. Callback async olabilir: await et, hata varsa
  formu ve seçimi koru; işlem sürerken çift tık/kapama davranışı açık olsun.
  Eski `load(materialized)` fallback'i kaynak File/diğer çıktıları kaybediyorsa
  kaldır veya yalnızca Manager'ın kaynak koruyan adapter'ını kullan.
- Recipe/profile parse hatası sessizce varsayılana düşmez. `alert()` yerine
  form içi hata, focus yönetimi, Escape/backdrop, focus trap ve odağın başlatan
  düğmeye dönmesi. Küçük ekranda araçlar ve ana eylem erişilebilir kalır.

## B2 — Yayın paketi ve UI maliyeti

- `PublishTools`/`SocialPostKit` tek canonical yayın metadata'sını kullanmaya devam
  eder. Mevcut dört platform sekmesinin aynı sequence taslağını paylaştığı gerçeği
  korunur; farklı platform taslakları uygulanırsa veri geçişi ve alan adları açık olur.
- Başlık, açıklama, hashtag ve YouTube tags birbirine karıştırılmaz. Gerçek tags
  alanı eklenecekse canonical şema değişimini Manager yapar. Unicode/Türkçe,
  boş alan ve platform sınırları için hata göster; sessizce kesme/otomatik hashtag
  ekleme yok. Gerçek kaynak atıf/chapters kontrolleri korunur.
- Otomatik başlangıç metni gerçek transcript excerpt/proje adı üzerinden yerel
  taslak olarak sunulur. Yapılmamış trend araştırması `not-researched`; generic
  hook veya rastgele hashtag SEO puanı diye gösterilmez. Ücretli model/API ekleme.
- Yeni UI her harf için büyük Project snapshot/undo üretmesin. Küçük yerel draft
  buffer + güvenli blur/debounce/save yaklaşımıyla panel/sequence değiştirme,
  undo/redo ve reload kayıp/taşma yarışlarını çöz. Debounce eski sequence'e metin
  yazmasın. Son yazılan değer kayboluyorsa formu kapatma/success mesajı verme.
- Boyut/FPS/aspect kontrollerinde tek model helper; geniş videoyu polish düğmesi
  ile kendiliğinden dikeye çevirme. Inspector ve tüm gelişmiş araçlar erişilebilir.

## Dosyalar ve kanıt

Sende: `src/social/RecipeReviewScreen.tsx`, testi/CSS, yeni CreatorProfile formu ve
profile-storage modülü/testi, `PublishTools.tsx`, `SocialPostKit.tsx`,
`workspace-clarity.css`, gerekli dar UI stilleri. `App.tsx`, model/store,
creator-recipe ve queue kontrolcüsünü değiştirme. Ortak `components.tsx` modalına
ihtiyaç varsa Manager'la tek sahip seç veya lokal bileşende uygula.

Gerçek event testleri: kart seçimi sıfır commit; confirm callback tam bir kere
gerçek materialized project ile çağrılır; async hata ekranı korur; Export callback
yoksa yok/devre dışı; blur/debounce ardından A→B→A ve undo/redo; profil restore,
bozuk storage, shortCount 0; stale/relink; dialog klavye/focus. SSR testi yalnızca
metin/markup kanıtıdır. Bir küçük browser testini Manager'ın son birleşik koşusuna
ver; her değişiklikte tüm browser suite'i başlatma.

**Bitti:** gerçek callback'li komponentler, kalıcı profil, kaybolmayan/karışmayan
metadata, okunur hata ve bekleme durumları, API imzaları/commit/test kanıtı
`docs/director-reports/batch-004/baris.md` içinde. App entegrasyonunu Manager yapar.
