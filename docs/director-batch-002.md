# Direktör batch 002 — ilk teslimin düzeltmeleri ve YouTube pilotuna hazırlık

Alıcı: Antigravity MANAGER. Rubar bu belgeyi iletir. 19 Ekim 2026.
Durum: uygulanacak. Bu belge mevcut kod incelemesine dayanır; aşağıdaki eksikler
kapanmış veya yeni gerçek medya kabul testleri yapılmış sayılmaz.

## Manager'ın yapacağı

- B001 raporu geldi; `incelemeye hazır` kabul edildi, `onaylandı` değil. Özellikle
  testlerin raporda ileri sürülen davranışı gerçekten çalıştırıp çalıştırmadığını
  kontrol edin. HEAD/diff ve dosya sahiplerini yeniden doğrulayın.
- Dört kişiye aşağıdaki görevleri verin. B001-D/K/O/B sahipliğini koruyun.
  Önceden düzeltilmiş madde varsa tekrar yazmak yerine gerçek kod/test kanıtını gösterin.
- Model indirme/çıkarım, gerçek medya encode/decode, uzun browser suite veya tam
  build yok. Küçük testleri `--maxWorkers=1 --no-file-parallelism` ile sırayla
  çalıştırın. Bir ortak type-check yeterli. Test sayısı performans ölçümü değildir.
- Çalışma ağacındaki diğer dosyaları topluca stage/reset/stash/clean etmeyin.
  Commit/patch görev sınırında olsun. Codex'in `creator-recipe` dosyaları ayrıdır.

## B002-D — DEMİR: Turbo uygunluğu ve native işin gerçek yaşam döngüsü

Sahip olunan dosyalar B001-D ile aynı. Şu açıkları ele alın:

1. Mevcut uygunluk kontrolünde `fadeIn/fadeOut`, opacity, track mute/hidden,
   `audioDetached/autoDuck` gibi gerçek ses/görüntü davranışları kontrol edilmiyor.
   Kaynak dizisinin sırası ile timeline sırası da farklı olabilir: kontrol sıralı
   kliplerle yapılıyor, sunucu orijinal diziyi concat ediyor. Önce yalnızca birebir
   desteklenen kapsamı kabul eden muhafazakâr koşul kurun; desteklenmeyeni normal
   renderer'a bırakın. 50 ms gap toleransı sessiz timeline değişikliği yaratabilir.
   Crop fill'in pad-fit ile, özel export kalite ayarlarının sabit6M ile aynı
   olduğunu varsaymayın. Eksik/uyuşmayan kaynak ve NaN/Infinity reddedilmeli.
2. Sunucuya doğrudan POST geldiğinde aynı kapsam kontrolünü uygulayın; yalnızca
   istemci kontrolüne güvenmeyin. Kaynak adlarını/ID'lerini geçici dizin dışına
   dosya yazdıracak path parçaları olarak kullanmayın.
3. `req.on('close')` normal gövde okuma tamamlanmasında da tetiklenebilir; bunu
   doğrudan kullanıcı iptali saymayın. Normal tamamlanan istek, gerçekten kopan
   istemci, gövde okuma sırasında iptal, çalışan child iptali ve response kapanması
   ayrı test edilsin. İptalden sonra spawn/fallback olmasın. Her spawn'ın error
   olayı ve tek seferlik response/cleanup sahipliği ele alınsın.
4. `-encoders` çıktısı codec'in derlendiğini gösterir, çalışan GPU'yu kanıtlamaz.
   Sağlık durumunu buna göre adlandırın; doğrulanmamış GPU için hazır etiketi
   vermeyin. Seçilen encoder ile fallback argümanları gerçekten uyumlu olsun;
   yalnızca `h264_mf` dizgesini değiştiren fallback diğer encoder'ları çözmez.

Kanıt: gerçek eligibility fonksiyonu ve gerçek HTTP handler, fake child/fs ile
çalıştırılmalı. Test içinde farklı bir handler/koşul yazarak doğrulamayın. Gerçek
FFmpeg/encode başlatmayın. Kapsamı basitleştirmek, yanlış çıktıyı kabul etmekten
iyidir; tam native compositor bu görevin şartı değil.

## B002-K — KAAN: dekoder seçim maliyeti ve gerçek önizleme davranışı

1. Aktif tüm katkı veren katmanları koruyan değişiklik yön olarak doğru. Ancak
   şu an her playhead sorgusunda her klip için tekrar `createClipAudioPlan` ve
   komşu/speech araması yapılıyor. Projeye bağlı indeks/planı immutable edit başına
   oluşturun; playhead tick'inde yeniden kurmayın. Audio window handle'ları,
   mute/hidden ayrımı ve orijinal katman sırası aynı kalsın.
2. Metadata havuz testi tek başına React decoder unmount/src temizliğini, pending
   seek iptalini veya gerçek geçiş kaynağına erişimi kanıtlamıyor. Üretim seçim/
   yaşam döngüsü kodunu çağıran kısa fake-media testleri ekleyin. Üç katmanı
   korurken ihtiyaç dışı pre-roll ve uzak decoder'ları bırakın.
3. `EditPreview` aynı görsel/ses kurallarını kullansın. Geri oynatma sırasında
   sürmekte olan seek'e yeni seek bindirmeyin; global tek throttle'ın birbirinden
   bağımsız kaynakların ilerlemesini engellemediğini doğrulayın.
4. Üst yorumdaki MAKSİMUM2 / garanti60FPS gibi artık doğru olmayan ifadeleri
   düzeltin. Gerçek medya/cihaz QA'sını hâlâ bekliyor olarak raporlayın.

Sahiplik: Preview/EditPreview, decoder/clock yardımcıları ve ilgili testler.
Ortak audio hook için Okan'la tek bağlantı arayüzü kararlaştırın; dosyasını yazmayın.

## B002-O — OKAN: boş bus yerine gerçek kaynak bağlantısı

1. B001 raporu kaynakların bus'a girdiğini söylüyor; güncel `preview-audio.ts`
   hâlâ gain'i doğrudan ortak output.input'a bağlıyor. Önce gerçek klipten çıkan
   düğümün hangi bus girişine gittiğini kanıtlayın. UI bus'ının constructor'ının
   çalışması veya sahte analizör dalgası, gerçek ses bağlantısının kanıtı değil.
2. Tek AudioContext kullanın. Voice/music/SFX rolleri ve mevcut gain/enhance
   zinciri korunmalı, bir kaynak iki kez destination'a bağlanmamalı. Master mute
   ve gerçek peak/spectrum aynı duyulan hattı izlemeli. Bir kaynak için ikinci
   MediaElementSource oluşturmayın; route değişimini mevcut düğümle yönetin.
3. Bypass varsayılanı gerçekten nötr olmalı: yalnızca sidechain'i kapatmak,
   varsayılan master limiter sesi değiştiriyorsa yeterli değil. Ek işleme açıkça
   seçilmediyse legacy ses davranışını koruyun. Panel açılması tek başına context/
   timer açmasın; unmount/pause/dispose/re-create kontrollü olsun.
4. Hook ve gerçek route builder'ı fake WebAudio graph ile test edin. Düğümlerin
   oluşturulması testi yerine source → processor → master → destination yolları,
   tek bağlantı, mute ve detach/cleanup doğrulansın. Export paritesi henüz yoksa
   yeni EQ/ducking'in yayına uygulanabildiğini ilan etmeyin.

Sahiplik: B001-O dosyaları. Kaan'a rol/source bağlantısı için küçük arayüz verin.

## B002-B — BARIŞ: gesture'ın kendisini test et, aynı klip editini koru

1. `inspector.test.ts` yeni kontrollerde pointer davranışını üretim bileşeninden
   çağırmak yerine store'a doğrudan setPreviewClip/commit yapıyor. Bu, scrubber'ın
   iptal/RAF/tek commit protokolünü kanıtlamaz. Üretimde de kullanılan küçük bir
   gesture controller çıkarın veya gerçek handler'ları fake pointer/RAF ile çağırın.
2. AETransformControls getNextClip güncel proje settings'ini okusa da `original`
   klibi temel alıyor. Gesture sırasında aynı klibin başka özelliği/keyframe'i
   değişirse eski klip nesnesi o editi ezebilir. Gerçek güncel hedefi bulun;
   klip silindiyse, kilitlendiyse, proje/sequence/selection değiştiyse gesture'ı
   iptal edin veya açıkça güvenli birleştirin. Başka klipteki editin korunması
   testi bu aynı-klip yarışının kanıtı değil.
3. Final RAF flush, hiç hareket etmeden pointerup, Escape, pointercancel,
   unmount, typed input Enter+blur ve pointer kimliği/capture temizliğini sınayın.
   Gereksiz undo adımı ve typed-input çift commit oluşmasın. Yeni UI tasarımı yok.
4. Rapor test adlarını değil gerçekten yürütülen yolu anlatsın; ölçülmemiş
   performans rakamlarını doğrulanmadı olarak belirtin.

Sahiplik: scrubber, transform/effects inspector ve ilgili gerçek-controller testleri.

## Sonraki YouTube pilotu için hazırlık — kod çakışması yaratmadan

B002 düzeltmesi biten kişi Manager'a rapor verip aşağıdaki küçük tasarımı hazırlar;
geniş yeni modül veya dış servis işi başlatmaz:

- Demir: normal export'tan elde edilen gerçek Blob'un YouTube resumable upload'a
  nasıl verileceği; OAuth, görünürlük, iptal/yeniden deneme ve gerçek video ID'si.
- Kaan: tek kayıttan uzun/kısa adaylarının hangi gerçek mevcut zaman/veriyle
  önerilebildiği; konuşmasız oyunlarda eksik kanıt ve paylaşılan analiz maliyeti.
- Okan: kaynak başına tekrar kullanılacak ses analizi ve sessizlik/tepki ölçümünün
  sınırları. Ses yükselmesini otomatik iyi highlight diye etiketlemeyin.
- Barış: bir defalık kanal profili ve uzun/kısa taslaklarını tek inceleme ekranı.
  Codex tarif çekirdeğini kullanacak; ikinci profil/plan modeli yazmayın.

Her hazırlık en fazla10 satır: gerçek mevcut kaynaklar, eksik bağımlılık, önerilen
dosyalar, kabul kanıtı. Ücretli API, medya upload'ı, hesap yetkilendirmesi veya
yayın yok. Codex sözleşmeyi/testli çekirdeği teslim edince sonraki uygulama paketi
gelecek. Ana yol haritası veya P2 bu paketle kapanmaz.

## Teslim

Tek dosya: `docs/director-reports/batch-002.md`. Her görev için sahip, base/teslim
SHA veya görev patch'i, dosyalar, düzeltilen somut davranış, tam komut/sonuç ve
çalıştırılmayan QA yazılsın. Dört ayrı tam build/suite yok. Kodda bulunmayan
entegrasyonu rapora olmuş gibi yazmayın. Main/üretim son direktör incelemesini bekler.
