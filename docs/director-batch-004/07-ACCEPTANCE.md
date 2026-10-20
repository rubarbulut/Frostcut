# B004 kabul matrisi ve bitiş sınırı

## Bu batch'in sabah görülebilecek sonucu

Kullanıcı YouTube odaklı tek bir akışta profilini seçer/geri yükler, gerçek kaynak
dosyasıyla plan kurar, adayları yöntem/gerekçesiyle inceler, uzun/kısa taslakları
bağımsız düzenler, metadata'sını korur ve gerçek export kuyruğunu kullanır.
Upload motoru/hesap adaptörü kod ve mock protokol testleriyle hazırdır; gerçek
hesap kurulumu ve yayın denemesi yapılmadıysa arayüz bunu açıkça söyler.

"Her kayıt otomatik 10/10 içerik/SEO ve tüm platformlarda yayın" bu batch'in
teslim iddiası değildir. Kanıtsız garanti yerine uçtan uca çalışan ilk pilot istenir.

## Zorunlu davranışlar

| Senaryo | Kabul edilen sonuç | Asıl sahip |
| --- | --- | --- |
| Aynı kayıttan Long + N Shorts | Tek ortak analiz; actual süreler ve canonical materialized projeler | Manager/Kaan/Okan |
| shortCount 0 / 1 / 12 | İstenen üst sınıra uyum; en az 2 zorlaması yok | Kaan/Barış |
| Konuşmasız, sinyalsiz oyun | Sahte hook/reaction yok; manual/equal-parts açıkça seçilir | Kaan/Barış |
| 2x/0.5x trim ve tekrar kullanılan asset | Kaynak profili doğru timeline aralıklarına eşlenir | Kaan/Okan |
| Aynı assetId ile farklı File relink | Eski cache/recipe reddedilir | Okan/Kaan/Manager |
| Cache clear sırasında iş bitmesi | Eski Promise cache'i diriltemez/yeni işi silemez | Okan |
| Aynı kaynağa iki tüketici | Provider bir iş; birinin iptali diğerini bozmaz | Okan |
| Profil kaydet → reload | Sürüm doğrulanır; bozuk storage ile çökmez | Barış |
| İncelemeyi aç/kart seç | Sıfır store mutation, encode veya ASR | Barış |
| Confirm/Export gerçek olay | Geçerli çıktı doğru async callback'e bir kez gider | Barış/Manager |
| A çıktısını değiştir → B → kaynak | İzole edit/metadata; kaynak File'ları hâlâ erişilebilir | Manager/Barış |
| Yazarken sekme/sequence/undo değiştir | Son metin kaybolmaz, yanlış çıktıya yazılmaz | Barış |
| Kaynak/range/efekt değişimi | Eski render upload edilemez | Manager/Demir |
| Salt title/description değişimi | Uygunsa videoyu yeniden encode etmez | Manager/Demir |
| Kuyrukta çift Start/Cancel | Tek encode, geç success/progress ve yarım ZIP yok | Manager/Demir |
| Eksik helper/OAuth config | Not-configured; editör/metadata/local export kullanılabilir | Demir/Manager |
| 308/Range yok/bozuk/kısmi | Kabul edilmiş byte esas; veri atlama ve sonsuz retry yok | Demir |
| Son yanıt kaybı / session'da tamamlanmış upload | Mevcut session sorgusu, ikinci insert yok | Demir |
| Upload beklemesinde abort / 401 / 403 / 404 | Sınırlı doğru hata/iptal; otomatik sahte başarı yok | Demir |
| Geçmiş schedule / belirsiz timezone | İstekten önce doğrulama hatası | Demir/Barış |
| Preview DSP / export DSP farkı | Ortak hesap veya görünür unsupported/preflight durumu | Okan/Manager |
| Native desteklenmeyen edit | Özellik atlama yerine tam renderer/fail açık davranışı | Demir |
| Yeni klip/format/metadata düzenleme | Mevcut undo, altyazı, hız, ses, sekme erişimi korunur | Herkes/Manager |

## Hafif doğrulama düzeni

- Kişi yalnızca kendi değişen üretim yollarına ilişkin küçük testleri tek worker
  ile çalıştırır. Örnek: `node node_modules/vitest/vitest.mjs run <ilgili-dosya>
  --maxWorkers=1 --no-file-parallelism`. Gerçek dosya yolunu rapora yazın.
- Bütünleşik `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
  Manager tarafından tek final kontrolde çalıştırılır. Yeni merge/type hatası
  varsa düzeltip ilgili kontrolü yeniden çalıştırmak gerekebilir; yeşili tekrar
  tekrar üretmek için aynı komutu döndürmeyin.
- Küçük sahte source File/JSON/PCM ve mock HTTP uygundur. Bunlar gerçek codec,
  fiziksel GPU, insan konuşması kalitesi veya Google OAuth yayın kanıtı değildir.
- Bir kısa browser davranış testi gerçek form ve callback'in olay yolunu kapsar.
  Medya gerekiyorsa yalnızca mevcut çok küçük fixture, tek worker, kısa ve sınırlı
  akış. Render/model gerektiren uzun mevcut suite'ler bu gece çalıştırılmaz.
- Büyük build, uzun video karşılaştırması, ASR ve gerçek kanal upload'u için
  `docs/director-reports/batch-004/manual-qa.md` içinde komut/fixture/beklenen
  sonuç hazırlayın; çalıştırmadıysanız açıkça yazın.
- Mevcut bulut PR Quality/TestSprite akışı korunur. Son birleşik HEAD kanıtı
  tutulur; hata saklamak için senaryo kaldırma, assertion gevşetme, required check
  silme veya eski başarılı run'ı yeni sürüme mal etme yok.

## Her uygulayıcının teslim şablonu

```md
# B004-<kod> — <isim>
Durum: working | ready | blocked-external
Baseline SHA / dal / çalışma yolu:
Commit SHA'ları:
Gerçekten bağlanan kullanıcı/üretim davranışı:
Public API ve zaman birimleri:
Değiştirilen dosyalar:
Çalışan test komutu, sayı, süre, fixture türü:
Çalıştırılmayan kontroller:
Bilinen kalan hata / dış bağımlılık:
Manager'ın yapacağı küçük bağlantı / PR:
```

Manager raporu ayrıca bütünleştirme SHA'sı, UI ekran kanıtı, gerçek kalan manuel
adımlar ve draft PR/check URL'lerini içerir. "Bitti" yalnızca modül dosyası
yazıldığında değil, kendi goal'ünün zorunlu davranışları kanıtlandığında kullanılır.

## P0 bitince — kontrollü devam sırası

Önce aynı kapsamdaki sınır/iptal/regresyonları kapatın. Ardından sahibi belli
aşağıdaki P1'lere geçilebilir; P0 entegrasyonunu bekletmeyin:

1. Demir: minimum yerel OAuth capability/kurulum ve metadata/schedule validation.
2. Barış: review klavye/focus ve küçük ekran iyileştirmesi; buffered metadata
   kaydının undo/reload yarışlarını tamamlamak.
3. Okan: preview/export ortak saf DSP ve byte-limitli analiz akışının sağlamlaştırılması.
4. Kaan: konuşma sınırı ve kullanıcı marker'ı önceliği; ölçümsüz semantik iddia yok.
5. Manager: tüm bağımlılıkların izlenmiş olduğu temiz checkout/draft PR ve sabah
   manuel QA paketi. Hesap gerektirmeyen işler tamamlanmış olmalı.

## Sonraki ayrı ürün fazları — bu gece başlatılmayacak

- **İçerik anlama:** gerçek ölçüm/işaretçi/transcript ve isteğe bağlı görsel olay
  toplama; oyun türü, bağlam/payoff ve değerlendirme datası. Klasik DSP tek başına
  oyun hikâyesini anlıyor sayılmaz.
- **Paketleme:** gerçek içerik vaadine dayanan başlık/kapak varyantları; kendi
  karelerinden thumbnail, gerçek kaynaklı/tarihli trend araştırma provider'ı.
  Bedava ve kota sınırsız servis varsayılmaz.
- **Gerçek yayın pilotu:** kullanıcı Google projesini/hesabını kurduktan ve hedef
  video/görünürlük/beyanları seçtikten sonra tek özel test upload'u; işlenme ve
  gerçek API sonuçlarını doğrulama. Önceden yapılmış gibi raporlanmaz.
- **Çoklu platform ve öğrenme:** Reels/TikTok resmi entegrasyonlarının ayrı
  capability/izin sınırları; gerçek sonuç metriklerini output/metadata revision'ına
  bağlama. Desktop paketleme ancak ölçülmüş darboğaz gerekçesiyle değerlendirilir.

Bu fazlar ürün yönünü korur; beş kişinin aynı gece yeni özellik yarışı açması için
izin değildir. Gece hedefi ilk gerçek, güvenilir YouTube üretim pilotudur.
