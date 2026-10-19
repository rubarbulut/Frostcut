# FrostCut — Direktör → Manager görev paketi 001

Tarih: 19 Ekim 2026. Gönderen: Codex, teknik direktör.
Alıcı: Antigravity MANAGER. Uygulayıcılar: DEMİR, KAAN, OKAN, BARIŞ.
Rubar bu paketi ve dönüş raporlarını iki ortam arasında iletir.

## Çalışma düzeni

Bu gerçek bir görev dağılımıdır. Codex mimari kararları, öncelikleri, kabul
kriterlerini ve son teknik incelemeyi üstlenir. Manager mevcut işleri takip eder,
görevleri dağıtır, dosya çakışmalarını önler ve kanıtlı tek rapor toplar.
Uygulayıcılar kendi kapsamlarında kodu ve kısa doğrulamasını teslim eder.

Öncelik mevcut özellikleri koruyarak doğruluk ve performansı sağlamlaştırmak.
Bu pakette yeni büyük özellik, kapsamlı yeniden yazım veya arayüz tasarımı yok.
Bir kişi zaten aynı sorunu çözüyorsa yeni bir kopyasını başlatma; mevcut işine
bu kabul kriterlerini ekle. İsimlere önerilen dağılım aşağıdadır; mevcut
uzmanlık/sahiplik farklıysa Manager işi uygun kişiye verir ve eşlemeyi raporlar.

## Manager: dağıtımdan önce

1. Güncel HEAD, dal, staged/unstaged ve untracked dosyaları kontrol et.
   İnceleme anında dal `feat/social-media-hub`, HEAD `880e081` idi; uzaktan
   alınan duruma göre iki yerel commit gönderilmemişti. Bunlar anlık gözlemdir,
   çalışmaya başlamadan yenile. Ortak çalışma ağacında devam eden işler var.
2. Her uygulayıcıdan mevcut görev ve yazdığı dosyaları tek kısa mesajda öğren.
   Başkasının değişikliklerini silme, reset/stash/clean yapma; topluca stage etme.
   Tek dosyada tek aktif yazar olsun. Gerekirse patch veya ayrı worktree kullan;
   yeni worktree'nin mevcut commitlenmemiş kodu kendiliğinden almadığını unutma.
3. Paylaşılan `Preview.tsx`, `EditPreview.tsx`, `model.ts`, `store.ts`, `media.ts`,
   `App.tsx`, `visual-renderer.ts` için yazarı ve entegrasyon sırasını belirle.
   Başka bir görev bu dosyaya ihtiyaç duyarsa değişiklik isteğini sahibine ver.
4. Kullanıcı oyun/animasyon sırasında makineyi yormamamızı istedi. Yerelde gerçek
   encode/render, ASR/model indirme/çıkarım, uzun tarayıcı testi, toplu export veya
   tam build başlatma. Hedefli küçük testler bir worker ile, kontroller sırayla.
   Ortak type-check'i her ajana ayrı ayrı yaptırma; birleşik değişiklikte bir kez
   çalıştır. Bu sınır kullanıcı değiştirene kadar geçerlidir.

## B001-D — DEMİR: Turbo export doğruluğu

Öncelik: en yüksek. Ana dosyalar: `src/turbo-export.ts`,
`src/server/export-plugin.ts`, `src/turbo-export.test.ts`.
`App.tsx` durum göstergesi için küçük entegrasyon değişikliğini Manager sıraya alır.

Gözlem: Turbo yolu normal renderer'dan önce deneniyor. Sunucunun health cevabı
donanımı kontrol etmeden `turbo: true, hardware: true` döndürüyor. Tek klip yolu
çoğunlukla trim/scale/pad/subtitles yapıyor. Çok klip yolu klip dizisini concat
ediyor; timeline başlangıçları, eşzamanlı katmanlar ve klip işleme zinciri korunmuyor.
Başarılı HTTP cevabı bu durumda doğru kurgu üretildiğini kanıtlamaz.

Görev ve mimari karar:

- Önce açık bir destek/uygunluk kontrolü ekle. Semantiği kanıtlanmamış projeleri
  sunucuya kaynak dosya göndermeden mevcut tam renderer'a yönlendir.
- Speed, volume/mute, fade, transform/crop, fill mode, effects/keyframes,
  adjustment/transition, ek ses kanalı, timeline boşluğu ve örtüşen klipleri
  dikkate al. Desteklenmeyen özelliği sessizce atma. İlk teslimde tüm compositor'ı
  native FFmpeg için yeniden yazmak gerekmiyor; doğruluğu koruyan dar kapsam yeterli.
- Health/GPU etiketi gerçek kullanılabilirliği bildirsin. Windows encoder adı
  veya koşulsuz JSON donanım kanıtı değildir. CPU fallback'i GPU başarısı sayma.
- İptal/bağlantı kapanması aktif native alt süreci de durdursun; hata ve geçici
  dosya temizliği yalnızca bu işin kaynaklarını kapsasın. İptal yeni fallback başlatmasın.

Kabul: 10 saniyelik kaynağa 2× hız verildiğinde yanlış 10 saniyelik Turbo çıktı
seçilmemesi; örtüşen iki kanalın concat'e düşmemesi; efekt/ses ayarlarının
kaybolmaması; kapalı motor ve iptal için doğru yönlendirme. Bunları küçük
eligibility/argüman/yaşam döngüsü testleriyle kanıtla; gerçek encode çalıştırma.

## B001-K — KAAN: aktif dekoder penceresi

Öncelik: en yüksek. Ana dosyalar: `src/Preview.tsx`, `src/EditPreview.tsx`,
`src/active-window-decoder.test.ts`. İlgili öneri önizlemesi varsa onu da kapsa.

Gözlem: `getActiveWindowClips` video havuzunu iki elemanla sınırlandırıyor.
Üçüncü eşzamanlı katman, görünür katkısı veya duyulması gereken sesi olsa da
elenebiliyor. Görsel gizlilik ile ses mute kuralları birbirinden farklı.

- Kullanılmayan/uzak kaynakları serbest bırak; fakat gerekli aktif katmanları
  yalnızca sabit iki sayısını tutturmak için çıkarma. Bütçeyi önce pre-roll'a uygula.
- Geçişin iki kaynağı yanında katkı veren diğer aktif katmanları koru.
  Kaynak ses pencerelerinin görsel clip aralığı dışına taşabildiğini dikkate al.
- Gizli video kanalının duyulması gereken sesi ve ses kanallarının mute kuralları
  korunmalı. Yalnızca görüntüyü kapatmak sesi kapatmamalı.
- Seek, hızlı ileri/geri, kaynak değişimi ve unmount sırasında kaynakları temizle.
  Hazır olmayan karşı kaynağın yerine aynı kareyi iki kez kullanıp geçişi doğru
  ilan etme; hata/bekleme durumunu açıkça yönet.

Kabul: aynı anda üç katkı veren video; iki geçiş kaynağı + üçüncü katman;
gizli ama duyulur video; mute edilmiş ses; kesme sınırındaki ses handle'ları;
uzak klip/pre-roll ve kaynak temizliği. Metadata/fake-decoder testleri yeterli;
gerçek görüntü/ses akıcılığı daha sonra doğrulanacak, şimdiden 60 FPS garantisi yok.

## B001-O — OKAN: gerçek ses hattı ve kaynak ömrü

Öncelik: yüksek. Ana dosyalar: `src/audio-bus.ts`, `src/audio-bus.test.ts`,
`src/preview-audio.ts`, `src/preview-audio-output.ts`, `src/AudioTools.tsx`.
Kaan'ın preview dosyalarını paralel değiştirme; gerekiyorsa bağlantı arayüzü ver.

Gözlem: yeni bus kendi AudioContext'ini oluşturup destination'a bağlanıyor;
mevcut preview klipleri başka bir ortak output hattına bağlanıyor. İncelenen
çağrılarda bus girişlerine klip beslemesi görülmedi. Önce güncel kodda doğrula:
UI kontrolünün veya spektrumun varlığı gerçek sesin oradan geçtiğini kanıtlamaz.

- Gerçek kaynak → işlem → master → destination bağlantısını çıkar. UI'nın
  kontrol ettiği bus ile duyulan ses aynı hat üzerinde olsun; tekil ortak context,
  master mute ve gerçek meter davranışını koru. Çift bağlantı/çift ses oluşmasın.
- Varsayılan ayarlar mevcut sesi değiştirmesin. Ek limiter/ducking/EQ'yu sırf
  yeni bus oluşturuldu diye bütün projelere sessizce uygulama.
- AudioContext ve periyodik ölçüm işini panel açıldığı için gereksiz başlatma.
  Pause/unmount/dispose sonrasında boş timer, node veya aktif medya kalmasın.
  `dispose` edilen singleton yeniden kullanılmasın. Hataları sessiz başarı sayma.
- EQ/sidechain kalıcı proje ayarı ve export paritesi gerektiriyorsa kapsamını
  raporla; yalnızca preview bağlantısıyla bütün ses özelliğini tamamlandı sayma.

Kabul: route/bağlantı testleri, master mute, tek çıktı, pause/dispose temizliği,
gerçek bus girişiyle ilişkili ölçüm, mevcut volume/enhance davranışının korunması.
Node test doubles kullan; gerçek ses, model veya FFmpeg işi başlatma.

## B001-B — BARIŞ: inspector sürükleme işlemi

Öncelik: yüksek. Ana dosyalar: `src/inspector/AEScrubber.tsx`,
`src/inspector/AETransformControls.tsx`, `src/inspector/AEEffectsControls.tsx`.
Gerekirse küçük ve bağımsız bir testlenebilir drag controller çıkar.

Gözlem: AEScrubber'da RAF sınırı var; fakat AETransformControls'daki changeProp
hâlâ save → commit çağırıyor. Dolayısıyla RAF tek başına her karede proje/history/
autosave yazımını önlemiyor. `PR_403_RAPORU.md` içindeki tek commit ve performans
rakamları gözlenen koddan veya bağımsız ölçümden henüz doğrulanmış sayılmamalı.

- Pointer hareketinde yalnızca geçici preview değişsin; sürükleme sonunda tek
  kalıcı commit oluşsun. Son RAF beklerken bırakılan son değer kaybolmasın.
- Pointercancel/Escape iptal semantiğini belirleyip uygula; unmount'ta listener,
  capture ve RAF temizlensin. Kilitli klip değişmesin, typed input çalışsın.
- Gesture sırasında dışarıdan gelen yeni proje/undo/selection değişikliği eski
  snapshot ile ezilmesin. Transform/effect/keyframe değerlerini koru.
- Raporu gerçek kanıta göre düzelt. Ölçülmemiş 60 FPS, sıfır GC, yüzde kazanç veya
  bundle/TTI rakamlarını sonuç olarak sunma. Büyük benchmark açma.

Kabul: çok sayıda pointermove → en fazla frame başına geçici güncelleme, tek undo
adımı, son değerin korunması, iptal/unmount, klavye girişi ve dış edit çakışması.
Mantığı kısa testlerle doğrula. Lazy-loading iddiası varsa gerçek import zincirini
göster; yalnızca manualChunks eklenmesi lazy-loading kanıtı değildir.

## Teslim ve entegrasyon

Manager her görev için şu bilgileri tek bir raporda toplar:

| Alan | Beklenen içerik |
| --- | --- |
| Kimlik / sahip | B001-D/K/O/B, gerçek uygulayıcı |
| Başlangıç ve teslim | Dal, base HEAD, görev commit SHA veya yalnızca o göreve ait patch |
| Değişiklik | En çok üç cümle; hangi davranış düzeldi? |
| Dosyalar | Gerçek değiştirilen dosyalar ve ortak dosya sahibi |
| Kanıt | Tam kısa komut, sonuç ve kapsam; çalıştırılmadıysa açıkça yaz |
| Açık işler | Gerçek medya/tarayıcı QA, performans ölçümü, mimari karar veya hata |

Raporu `docs/director-reports/batch-001.md` olarak yaz; durumları
`bekliyor / çalışıyor / incelemeye hazır / düzeltme gerekli` şeklinde belirt.
Tamamlanmamış işi hazır gösterme, test sayısı veya gerçek PR numarası uydurma.

Commitler görev sınırında ve açık dosya listesiyle olsun. Başka ajanın staged
değişikliğini commitine katma. Hiçbir kontrolün durumunu taklit etme veya korumayı
atlama. Dört ayrı tam suite/build çalıştırmak yerine bağımlılıklar birleşince
Manager bir kısa ortak kontrol yapar. Test başarısı gerçek medya kalitesi veya
ölçülmüş hız kanıtı değildir.

Bu paketi uyguladıktan sonra yeni kapsam eklemek yerine raporu Rubar üzerinden
Codex'e ilet. Main'e birleştirme ve üretim yayını, bu paketin son teknik incelemesi
sonrasına kalsın; Rubar'dan her küçük kod değişikliği için tekrar onay isteme.

## Ayrı geliştirme dalı hakkında

Codex'in `codex/nested-sequences` dalı bağımsız, tamamlanmamış bir çalışmadır.
Şu anki preview/audio/render değişiklikleriyle uzlaştırılmadan birleştirilmesin.
P2 veya nested sequences bu görev paketinin teslimiyle tamamlanmış sayılmaz.
Kullanıcının özel hesap bilgilerini, e-postasını veya kimlik teyitlerini bu
rapora ya da herkese açık repoya eklemeyin.
