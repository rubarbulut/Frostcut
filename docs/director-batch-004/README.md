# B004 — Gece çalışma paketi

**Rubar'ın talebi:** Kalan direktör kredisini koruyarak mevcut ekibin bağımsız
ilerlemesi. Bu paket bir uygulama görevidir; yalnızca tasarım raporu yazıp bırakmayın.

**Tek ürün hedefi:** Kullanıcı bir oyun kaydını eklesin; kayıtlı tercihlerinden
YouTube uzun video ve istediği sayıda Shorts taslağı hazırlansın; gerçek kaynak
gerekçeleriyle incelenebilsin; her çıktının düzenlemesi ve yayın metni ayrı
korunsun; gerçek export kuyruğu çalışsın. YouTube yükleme bağlantısı ve hata
yönetimi uygulansın. Hesap kurulumu yoksa bu durum açıkça gösterilsin.

## Herkesin okuma sırası

1. Bu dosya.
2. `06-CONTRACTS.md` — ortak teknik sözleşmeler ve dosya sahipliği.
3. Kendi görev dosyanız:

| Kişi | Goal dosyası | Ana sonuç |
| --- | --- | --- |
| MANAGER | `01-MANAGER.md` | Sağlam taban, gerçek uçtan uca bağlantı, birleşik teslim |
| DEMİR | `02-DEMIR.md` | Güvenilir export artefaktı ve YouTube yükleme/hesap adaptörü |
| KAAN | `03-KAAN.md` | Uydurma sinyal içermeyen, doğru zamanlarda aday seçimi |
| OKAN | `04-OKAN.md` | Kaynak kimliğine bağlı, iptal edilebilir ortak ses analizi |
| BARIŞ | `05-BARIS.md` | Kalıcı profil, anlaşılır inceleme ve çıktı başına yayın taslağı |

4. `07-ACCEPTANCE.md` — bitiş ölçütleri, kontrol matrisi, sonraki aşamalar.

**Çalışma kökü:** `C:/Users/Arenb/Documents/Videoeditor`.
Önceki ürün vizyonu `docs/product-vision.md`; çekirdek sözleşmesi
`docs/creator-recipe.md`. B004 yeni işler için B002/B003 önerilerinin yerine geçer.
Önceki tamamlanmamış gerçek düzeltmeler kaybolmaz; önce mevcut atomik işinizi
bitirip raporlayın. Önceden bitmiş bir modülü sıfırdan yazmak görev değildir.

## Şu an gerçekte bulunan parçalar

19 Ekim 2026 kaynak incelemesindeki durum; ekip eşzamanlı yazdığı için başlamadan
önce yeniden kontrol edin:

- `creator-recipe.ts`: doğrulanmış kaynak snapshot'ından gerçek bağımsız projeler
  üretir. Sahte JSON recipe, eksik dosya ve eski kaynak kabul edilmez.
- `social/candidate-finder.ts`, `audio/asset-audio-profile.ts`,
  `social/RecipeReviewScreen.tsx`: yeni modüller var. Kaynak incelemesinde App
  içinden uçtan uca bağlı değillerdi. Modülün bulunması ürünün bittiği anlamına gelmez.
- `server/youtube-upload.ts` ve `youtube-publisher.ts`: yükleme protokolü taslağı
  var. `server/youtube-plugin.ts` bir **ingest** eklentisidir; OAuth token yöneticisi
  veya gerçek yayın sunucusu olduğu varsayılmayacak.
- Kodda aday önbelleğinin seçenekleri eksik anahtarlaması, `shortCount` için en az
  iki çıktı dayatması, ilk dilime kanıtsız highlight adı verilmesi, assetId tabanlı
  ses cache'i ve yüklemede eksik doğrulama gibi incelenecek somut konular var.
- Recipe ekranının SSR testleri callback'in gerçekten çağrıldığını kanıtlamaz.
  Görünmeyen Export düğmesi ile görünür ama boş işlem aynı şey değildir;
  güncel davranışı okuyup gerçek olay üzerinden doğrulayın.
- Codex UI teslim dalı `codex/creator-pipeline`; UI `e636f90`, native sınır
  düzeltmesi `306ea2d`, eksik viewport modülü `9fb596e`. Aynı UI kodu ortak
  klasöre de uygulandı. Kör cherry-pick ile iki kere eklemeyin. Yeni baykuş/landing
  ve ekip değişikliklerini eski App kopyasıyla ezmeyin.

## Gece çalışma kuralları

- Rubar uyuyor; rutin kararlar ve geri alınabilir yerel işler için onu beklemeyin.
  Eksik hesap/anahtar varsa adaptörü, hata ekranını ve mock testlerini tamamlayın;
  yalnızca o dış bağımlılığı sabaha bırakın. Diğer işleri durdurmayın.
- Bu paket dört ayrı uygulayıcı + bir Manager içindir. Yeni alt ekipler veya
  paralel test ordusu açmayın. Director'a tekrar tekrar geniş code review göndermeyin.
- Kullanıcının hafif çalışma sınırı devam eder. Uzun video render/decode,
  ASR/model indirme/çalıştırma, ağır benchmark, dört eşzamanlı `tsc`, büyük yerel
  browser suite ve bağımlılık yeniden kurulumu yok. Küçük fixture ve tek worker
  ile ilgili kısa testler; bütünleşik type-check'i Manager bir kez çalıştırır.
- Kredi/para harcayan araştırma, yeni ücretli servis ve otomatik kota tüketimi yok.
  Gerçek trend verisi yoksa durum `not-researched`; uydurma trend/SEO puanı yok.
- Bu gece gerçek kanala video yüklemeyin/yayımlamayın, gerçek yayın takvimi
  oluşturmayın, hesap izinleri/branch protection/üretim ayarlarını değiştirmeyin.
  Bunlar hazırlanan ürünün ayrı kullanıcı işlemleridir. Kod ve yerel/mock doğrulama
  tamamlanacak; bu sınır bütün işi durdurma gerekçesi değildir.
- Aktif B004'ü birleştiren hedef dalda commit/push ve uygun draft PR hazırlanabilir.
  Main merge veya production deployment otomatik yapılmaz. Kalite kapısı gevşetilmez.

## Başlama ve ortak dosya çakışmasını önleme

İlk olarak kişi başına `docs/director-reports/batch-004/<isim>.md` açın
(`manager`, `demir`, `kaan`, `okan`, `baris`). Mevcut göreviniz, devam eden atomik
patch ve `baseline-ready` durumunuzu yazın. Tek ortak raporu beş kişi düzenlemeyin.

**Koordinasyon raporları daima ortak kökte:**
`C:/Users/Arenb/Documents/Videoeditor/docs/director-reports/batch-004/`.
Kendi worktree'nizde kod yazsanız bile başlangıç/API/durum raporunu bu ortak
yola güncelleyin; aksi hâlde Manager diğer daldaki dosyayı göremez. Raporlara
token/log dökmeyin. Manager hazır raporları son teslim dalında sürümleyebilir.

Manager başlangıç snapshot'ını ve çalışma yollarını
`docs/director-batch-004/BASELINE.md` içinde ilan eder. Bu kayıt gelmeden önce
mevcut işinizin son atomik patch'ini bitirin; ardından kendi modülünüzü okuyun,
eksik senaryoları ve test fixture'larını hazırlayın. Ortak kaynaklarda yeni geniş
değişikliğe başlamayın. Manager da yalnızca belge yazıp diğerlerini beklemeyecek:
taban inceleme, sözleşme ve bütünleştirme kontrolcüsü tasarımını ilerletecek.

Tercih edilen düzen: Manager'ın aynı baseline SHA'dan ayırdığı kişi başına
çalışma kopyası/dalı. Çalışan ortak checkout'ta branch değiştirmek, toplu stash,
reset, clean veya başka kişinin işini geri almak yasak. Ayrı kopya kurulamıyorsa
`06-CONTRACTS.md` dosya sahipliği uygulanır; ortak dosyaları yalnızca Manager yazar.

Her kişi küçük anlamlı commit'lerle ilerler. Rapor: SHA, gerçek bağlanan davranış,
test komutu/sonucu, çalıştırılmayan test, kalan dış bağımlılık. Bütün iş bitince
aynı kapsamın hata/iptal sınırlarını kapatın; ilgisiz yeni ürün başlatmayın.
