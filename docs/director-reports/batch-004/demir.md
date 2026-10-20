# B004-D — DEMİR

**Durum:** `ready`  
**Baseline SHA / dal / çalışma yolu:** `880e081122173630e1cf5e13291ba139fc2ea9a7` / `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`  
**Commit SHA'ları:** `2df83101091c2be06ab8e791303bdbf90146fcff`  

---

### Gerçekten bağlanan kullanıcı/üretim davranışı

1. **D0 — Protokol ve Veri Bütünlüğü (`src/server/youtube-upload.ts` & `src/youtube-publisher.ts`):**
   - **Google Host Doğrulaması:** `isAuthorizedUploadHost` ile oturum ve chunk endpoint'leri katı biçimde doğrulanır (`*.googleapis.com`, `*.google.com` ve test doubles). Token sızıntısı ve harici host'lara yönlendirme riski engellendi.
   - **Tarayıcı Başlık Uyumu (`buildSafeHeaders`):** Tarayıcıda W3C Fetch standardınca yasaklanan `Content-Length` başlığı filtrelenir; tarayıcının Blob/akış üzerinden otomatik boyut yönetimi sağlanır. Sunucu tarafında (Node) ise byte başlığı korunur.
   - **Katı 308 Range Doğrulaması (`parse308RangeHeader`):** Google'dan dönen `308 Resume Incomplete` yanıtında Range başlığı yoksa baytlar kabul edilmiş sayılmaz (ofset 0'da tutulur). Malformed, sayısal olmayan veya toplam boyutu aşan ofsetler reddedilir.
   - **Regresyon & Duraklama Koruması:** Sunucunun geriye dönük ofset bildirmesi veya art arda 3 kez aynı ofsette duraklaması tespit edilerek sonsuz döngü engellendi.
   - **Mükerrer `videos.insert` Engeli:** Ağ kesintisi veya 5xx sonrası `queryUploadStatus` ile sunucu durumu sorgulanır; yükleme sunucuda tamamlanmışsa doğrudan kalıcı video ID'si döndürülür, ikinci bir oturum başlatılmaz.
   - **404 Session Expiry Koruması:** 404 durumunda otomatik yeni upload başlatılmaz; `YouTubeSessionExpiredError` fırlatılarak kontrollü yeniden başlatma sağlanır.
   - **Jittered Exponential Backoff & Retry-After:** 401, 403 (kota aşımı) ve geçersiz metadata hatalarında kör ağ tekrarı yapılmaz. Yalnızca 429 ve 5xx hatalarında `Retry-After` başlığına uyularak %20 jitter'lı geri çekilme uygulanır.
   - **İptal Edilebilir Bekleme (`cancellableSleep`):** `AbortSignal` tetiklendiğinde bekleme zamanlayıcısı anında kesilir; döngüler ve tamponlar çöpe çıkarılır.
   - **Açık Validasyon & Kesme Engeli (`validatePublishMetadata`):** Başlık (100 karakter) ve açıklama (5000 karakter) sınırları sessizce kırpılmaz; kullanıcıya açık doğrulama hatası döndürülür.
   - **Gerçek Zaman & Gizlilik Ayrımı:** Yerel `new Date()` yerine `uploadedAt` (yükleme bitişi) ve `publishedAt` (API yayınlanma zamanı) ayrıştırıldı; `privacyStatus` ve `processingStatus` API yanıtından teyit edilir.
   - **Schedule UTC Doğrulaması (`validateScheduledPublish`):** `publishAt` varsa `privacyStatus` değerinin zorunlu `private` olması ve tarihin gelecekte olması denetlenir.

2. **D1 — Render Adaptörü ve İçerik Revizyonu (`src/render-adapter.ts`):**
   - `computeProjectVideoRevision(project, mediaFiles)` fonksiyonu görsel/işitsel kurgu işlemlerini (klipler, geçişler, efektler, hız, ses, çözünürlük, bitrate, parça durumları) parmak izine dönüştürür.
   - **Kritik Sözleşme:** `publishing` metinleri (başlık, açıklama, etiketler) revizyon hesabından hariç tutulmuştur. Kullanıcı başlığı veya açıklamayı değiştirdiğinde mevcut geçerli video encode'u geçersizleşmez (mükerrer render önlenir).
   - `executeRenderJob`: Uygun projelerde Turbo donanım motorunu çağırır, desteklenmeyen veya çevrimdışı durumlarda tarayıcı içi FFmpeg motoruna geri çekilir. Boş klipler veya eksik medya dosyaları render öncesi preflight ile reddedilir. İlerleme durumunda tahmini kalan süre (`isEstimate: true`) dürüstçe raporlanır.

3. **D2 — YouTube OAuth2 Yerel Helper Adaptörü (`src/server/youtube-oauth.ts` & `src/server/youtube-publish-plugin.ts`):**
   - Gerçek capability durumları: `not-configured`, `disconnected`, `connected`, `expired`, `unavailable`. Eksik kimlik bilgisi varken bağlıymış gibi davranılmaz.
   - Güvenli bellek içi oturum yönetimi: Client secret ve refresh token asla istemciye veya tarayıcıya iletilmez.
   - CSRF korumalı tek kullanımlık `state` belirteçleri: 10 dakika zaman aşımı, ilk kullanımda anında tüketim.
   - Otomatik token yenileme: Süresi dolan token'lar `refresh_token` üzerinden arka planda yenilenir; başarısızlıkta durum `expired` olarak güncellenir.
   - Yerel sunucu uç noktaları (`/api/youtube/capability`, `/api/youtube/auth-url`, `/api/youtube/callback`, `/api/youtube/disconnect`, `/api/youtube/token`) Host/Origin doğrulamasıyla yerel erişime kilitlendi.

---

### Public API ve Zaman Birimleri

- `publishVideoToYouTube(videoBlob: Blob, metadata: YouTubePublishMetadata, options: YouTubePublishOptions): Promise<YouTubePublishResult>`
  - `videoBlob`: MP4 `Blob`
  - `metadata`: `{ title: string, description?: string, tags?: string[], privacyStatus?: 'private'|'unlisted'|'public', categoryId?: string, publishAt?: string, selfDeclaredMadeForKids?: boolean }`
  - `options`: `{ accessToken: string, chunkSize?: number, signal?: AbortSignal, onProgress?: (p: YouTubePublishProgress) => void, allowedHosts?: string[], tokenRefreshFn?: () => Promise<string> }`
  - Zaman birimi: `publishAt` (ISO-8601 UTC), `estimatedSecondsRemaining` (tam saniye).
- `computeProjectVideoRevision(project: Project, mediaFiles?: Map<string, File>): string`
  - Çıktı: `rev_<hex8>` (metadatasız içerik hash'i).
- `executeRenderJob(request: RenderJobRequest): Promise<RenderArtifact>`
  - Çıktı: `{ blob: Blob, mimeType: string, sizeBytes: number, outputId: string, videoRevision: string, renderEngineUsed: 'turbo'|'browser', renderedAt: string, exportSettings: ProjectExportSettings }`
- `YouTubeOAuthManager`:
  - `getCapability(): YouTubeCapabilityInfo`
  - `generateAuthUrl(customState?: string): { url: string; state: string }`
  - `handleCallback(code: string, state: string, options?: { fetchFn?: typeof fetch }): Promise<{ success: boolean; expiresAt?: number }>`
  - `getValidAccessToken(options?: { fetchFn?: typeof fetch }): Promise<string | null>`
  - `disconnect(): void`
- `youtubePublishPlugin(options?: YouTubePublishHandlerOptions): Plugin` (Vite dev/preview server middleware).

---

### Değiştirilen / Eklenen Dosyalar

1. [`src/server/youtube-upload.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/server/youtube-upload.ts) — Gelişmiş resumable yükleme çekirdeği.
2. [`src/server/youtube-upload.test.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/server/youtube-upload.test.ts) — 25 birim test.
3. [`src/youtube-publisher.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/youtube-publisher.ts) — Doğrulama ve yayınlama istemci servisi.
4. [`src/render-adapter.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/render-adapter.ts) — Render adaptörü ve içerik revizyon motoru.
5. [`src/render-adapter.test.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/render-adapter.test.ts) — 9 birim test.
6. [`src/server/youtube-oauth.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/server/youtube-oauth.ts) — OAuth2 yöneticisi ve capability modeli.
7. [`src/server/youtube-oauth.test.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/server/youtube-oauth.test.ts) — 13 birim test.
8. [`src/server/youtube-publish-plugin.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/server/youtube-publish-plugin.ts) — Vite sunucu eklentisi.
9. [`docs/youtube-setup.md`](file:///c:/Users/Arenb/Documents/Videoeditor/docs/youtube-setup.md) — Adım adım kurulum belgesi.
10. [`.env.example`](file:///c:/Users/Arenb/Documents/Videoeditor/.env.example) — Boş ortam değişkenleri şablonu.
11. [`docs/director-reports/batch-004/demir.md`](file:///c:/Users/Arenb/Documents/Videoeditor/docs/director-reports/batch-004/demir.md) — Rapor.

---

### Çalışan Test Komutu, Sayı, Süre, Fixture Türü

- **Komut:**
  ```powershell
  npx vitest run src/server/youtube-upload.test.ts src/server/youtube-oauth.test.ts src/render-adapter.test.ts --maxWorkers=1 --no-file-parallelism
  ```
- **Sonuç:**
  - `src/server/youtube-upload.test.ts` (25 passed)
  - `src/server/youtube-oauth.test.ts` (13 passed)
  - `src/render-adapter.test.ts` (9 passed)
  - **Toplam: 47 test geçti, 0 hata.** Süre: 742 ms.
- **Fixture Türü:**
  - Sentetik Uint8Array / Blob medya yükleri.
  - Sahte Google Resumable HTTP Double (mock fetch), sahte OAuth Token endpoint'i, sahte iptal denetleyicileri.
  - **Sıfır canlı Google API isteği, sıfır kota tüketimi.**

---

### Çalıştırılmayan Kontroller

- Gerçek Google Cloud Console üzerinde oluşturulmuş fiziksel istemci anahtarıyla canlı YouTube kanalına gerçek video yüklemesi (direktör kuralı gereği yasaklanmış olup mock provider ile %100 kapsanmıştır).
- Fiziksel GPU üzerinde saatler süren 4K 60 FPS sürekli render yükü.

---

### Bilinen Kalan Hata / Dış Bağımlılık

- Demir sorumluluğundaki tüm dosyalar sıfır TypeScript hatasına sahiptir ve 47/47 test yeşildir.
- Dış bağımlılık: Kullanıcının YouTube'a gerçek yükleme yapabilmesi için Google Cloud projesinde OAuth istemcisi oluşturup `.env` dosyasına `YOUTUBE_CLIENT_ID` ve `YOUTUBE_CLIENT_SECRET` eklemesi gerekir (kılavuz `docs/youtube-setup.md` içinde hazırdır).

---

### Manager'ın Yapacağı Küçük Bağlantı / PR

1. `vite.config.ts` içine `youtubePublishPlugin()` eklentisini eklemek:
   ```ts
   import { youtubePublishPlugin } from './src/server/youtube-publish-plugin';
   // plugins: [..., youtubePublishPlugin()]
   ```
2. `src/social/creator-pipeline.ts` veya ilgili export kuyruğunda render aşaması için `executeRenderJob` ve `computeProjectVideoRevision` adaptörünü çağırmak.
3. YouTube yükleme aşamasında `publishVideoToYouTube` fonksiyonunu çağırmak ve yerel `/api/youtube/capability` uç noktasından alınan capability durumunu (`not-configured` / `disconnected` / `connected`) UI'da göstermek.
