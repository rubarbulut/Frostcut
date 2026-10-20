# B004-D — DEMİR goal

## Goal

**Mevcut gerçek MP4 export çıktısını doğru revision ile eşleştiren, Google'ın
resumable protokolünü veri kaybetmeden uygulayan, iptal/tekrar/ağ hatasında
yinelenen video üretmeyen ve eksik hesap kurulumunu dürüstçe bildiren YouTube
yayın adaptörünü tamamla.** Gerçek kanala bu gece yükleme yapma.

`README.md`, `06-CONTRACTS.md`, `07-ACCEPTANCE.md` önce okunacak. B003 yükleyicisini
yeniden yazma; üretim fonksiyonlarını inceleyip aşağıdaki açıkları kapat.

## D0 — Zorunlu protokol ve veri bütünlüğü

1. Güncel kaynakta `uploadChunk` ve `queryUploadStatus` isteklerinin auth
   başlıklarını ve browser/server sınırını incele. Bearer token doğru Google
   isteklerinde bulunmalı; keyfi upload URL'sine veya redirect'e sızmamalı.
   Browser'da yasak `Content-Length` başlığını ayarlamaya güvenme. Sunucuya özel
   Node import'u istemci bundle'ına taşınmasın.
2. 308 cevabındaki `Range` **Google'ın kabul ettiği** byte sınırıdır. Range yokken
   gönderdiğini otomatik kabul edilmiş sayma. Eksik, bozuk, gerileyen, payload'u
   aşan veya ilerlemeyen offset'i açık politika ile işle. Sonsuz retry/skip olmasın.
   Son parça dışında chunk büyüklüğü 256 KiB katı ve tutarlı olsun.
3. Ağ isteği başarısız olduğunda durum sorgusuyla gerçek offset'i bul; tamamlanmış
   session cevabını yeni `videos.insert` başlatarak çoğaltma. 404 session expiry
   otomatik yeni videoya dönüşmesin: kontrollü yeniden başlatma gerektirsin.
4. Sınırlı retry, exponential backoff/jitter, uygun `Retry-After`, iptal edilebilir
   bekleme ve toplam deneme sınırı. 401/403/invalid metadata gibi hataları körlemesine
   ağ retry'si yapma. 401 yenilemesi varsa tekil refresh ve en fazla bir kontrollü
   yeniden istek; token sağlayıcısı yoksa anlaşılır hesap hatası.
5. İptal bütün fetch/bekleme/ilerleme döngülerini sonlandırmalı. İptalden sonra
   yeni session, chunk veya success callback'i yok. Aynı iş için çift Start yok.
6. `publishVideoToYouTube` başlık/açıklamayı sessizce kesmesin; geçersiz input'u
   kullanıcıya döndürsün. Sonuç privacy'si istenen değerden uydurulmasın; API
   yanıtı veya doğrulanmış sorgu esas alınsın. Yerel `new Date()` yayınlandı zamanı
   değildir: yükleme tamamlandı zamanı ile gerçek yayın zamanını ayır.
7. Başarı için gerçek API videoId gerekir. Upload tamamlanması video işlemesinin
   tamamlandığı veya public yayımlandığı anlamına gelmez. UI için ayrı durum döndür.
   `selfDeclaredMadeForKids` gibi içerik beyanını kullanıcı adına sabitleme.

## D1 — Export artefaktı ve adaptör

- Mevcut native ve browser renderer seçenekleri korunur. B002-D eligibility ve
  cancellation düzeltmelerini, `turbo-eligibility.ts` saf sınırını geri bozma.
- Manager'a küçük render adaptörü ver: doğrulanmış output project + File haritası
  + signal alır; gerçek render fonksiyonunu çağırır; Blob, MIME, boyut, gerçek
  output/revision/ayar kimliği döndürür. Çözünürlük/bitrate düşürerek hız kazanma yok.
- Abort olmuş, sıfır byte, eski output veya başarısız encode artefaktı upload'a
  geçemez. Metadata değişimi video revision'ından ayrı ele alınabilsin. Tüm videoyu
  gereksiz Uint8Array kopyalarına çevirmeden `Blob.slice`/akış kullan.
- Progress gerçek kabul edilmiş byte veya renderer ilerlemesinden gelsin. ETA
  tahmin olarak etiketlenir; motor adından sabit FPS/saniye garantisi çıkarılmaz.

## D2 — OAuth/hesap adaptörü, dış kurulum olmadan tamamlanacak kısım

P0 bitmeden büyük hesap ekranı yapma. Sonra minimum yerel helper entegrasyonunu
hazırla: örneğin yeni `src/server/youtube-publish-plugin.ts` ve
`src/server/youtube-oauth.ts`. Vite'a kaydı **Manager** yapar.

- Gerçek capability durumları: `not-configured`, `disconnected`, `connected`,
  `expired`, `unavailable`. Eksik client id/secret iken çalışanmış gibi davranma.
- Tek açık server OAuth akışı; sabit doğrulanmış redirect URI, rastgele tek
  kullanımlık `state`, süre sınırı ve callback hata/iptal kontrolü. Gereken en dar
  YouTube scope'larını belgelerden doğrula. Browser'a client secret veya refresh
  token gönderme; `VITE_` değişkeni, repo, proje JSON'u, log veya localStorage'a yazma.
- İlk pilotta güvenli session belleği yeterli; yeniden başlatmada reconnect
  gerekirse açıkça bildir. Güvenli secret storage yokken kalıcı oturum sözü verme.
  Yerel endpoint'lerde beklenen Host/Origin, request doğrulaması ve token sızıntısı
  sınırı olsun. Geniş CORS veya Vercel'den localhost'a keyfi köprü açma.
- `.env.example` ve kısa kurulum belgesi yalnızca boş örnekler içerir. Gerçek
  Google hesabı, consent screen veya credential oluşturma kullanıcıya kalabilir;
  kod ve fake provider sözleşmesi eksiksiz hazırlanır. Sunucu yokken tarayıcı
  editörü ve yerel metadata export'u kullanılabilir kalır.
- Schedule UI'sı için gelecek zaman + timezone → UTC doğrulaması; `publishAt`
  kullanımı private durum gerektirir. Geçmiş zamanın anında yayına dönüşmesine
  izin verme. Bu gece gerçek schedule isteği gönderme.

## Dosya sahipliği ve test

Sende: `src/server/youtube-upload.ts`, testi, `src/youtube-publisher.ts`, yeni
publish/OAuth helper ve testleri, yeni render-adapter modülü, YouTube kurulum belgesi.
`media.ts`, `model.ts`, App, Vite ve ortak store'u değiştirme. Render çekirdeğinde
zorunlu düzeltme varsa Manager'a küçük sözleşme/patch isteği ver.

Küçük fake HTTP/provider ve fake clock ile gerçek üretim fonksiyonlarını sınayan
testler: kısmi 308, Range yok, bozuk/out-of-bounds Range, kayıp son cevap ama
sunucuda tamamlanmış upload, retry beklerken abort, 401/403/404/429/5xx, izinli
olmayan upload host'u, çift başlatma, metadata sınırı, API privacy sonucu,
OAuth state mismatch/tekrar kullanım/eksik config. Gerçek token ve video yok.

**Bitti:** D0+D1 gerçek API'ye takılmadan çalışır; D2 uygulanmış/konfigürasyon
bekleyen kısmı açıkça ayrılır; public API imzaları Manager'a yazılır; kısa testler
ve commit SHA'ları `docs/director-reports/batch-004/demir.md` içinde bulunur.

Resmi kaynaklar `06-CONTRACTS.md` sonunda; eski quota veya API audit varsayımını
hafızadan taşımak yerine ilgili güncel sayfayı kontrol et.
