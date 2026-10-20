# YouTube Data API v3 Yerel Entegrasyon ve Kurulum Kılavuzu

**Görev:** B004-D  
**Sahip:** 1. DEMİR (Graphics & Render Pipeline Lead)  
**Tarih:** 2026-10-20  

FrostCut video düzenleyicisi, Google YouTube Data API v3 Resumable Upload protokolü üzerinden doğrudan YouTube'a güvenli ve kesintisiz video aktarımını destekler.

---

## 1. Google Cloud Projesi ve OAuth2 İstemcisi Hazırlığı

1. [Google Cloud Console](https://console.cloud.google.com/) adresine gidin ve yeni bir proje oluşturun.
2. **API'ler ve Hizmetler > Kitaplık** (APIs & Services > Library) menüsüne gidin:
   - **YouTube Data API v3** servisini arayın ve projeniz için **Etkinleştir** (Enable) butonuna tıklayın.
3. **OAuth İzin Ekranı** (OAuth consent screen) yapılandırması:
   - Kullanıcı türünü **Harici** (External) seçin.
   - İzin verilen kapsam (Scope) olarak:
     `https://www.googleapis.com/auth/youtube.upload` ekleyin.
   - Test kullanıcıları listesine kendi Google hesabınızı ekleyin.
4. **Kimlik Bilgileri** (Credentials) oluşturun:
   - **Kimlik Bilgisi Oluştur > OAuth 2.0 İstemci Kimliği** (OAuth client ID) seçin.
   - Uygulama türü: **Web Uygulaması** (Web application).
   - Yetkili Yönlendirme URI'leri (Authorized redirect URIs):
     `http://localhost:5173/api/youtube/callback`
5. Oluşturulan **İstemci Kimliği** (Client ID) ve **İstemci Gizli Anahtarı** (Client Secret) değerlerini not edin.

---

## 2. Ortam Değişkenleri (.env)

Proje kök dizinindeki `.env` dosyanıza şu değişkenleri ekleyin (veya `.env.example` dosyasını kopyalayın):

```env
# YouTube Data API v3 OAuth Credentials
YOUTUBE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-your_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:5173/api/youtube/callback
```

> **Güvenlik Notu:** `YOUTUBE_CLIENT_SECRET` ve yenileme belirteçleri (refresh tokens) yalnızca sunucu belleğinde tutulur; asla tarayıcıya veya istemci paketine sızdırılmaz.

---

## 3. Yetkilendirme Akışı ve Durumlar

Yerel sunucu (`/api/youtube/*`) şu yetenek durumlarını sağlar:

- **`not-configured`**: Ortam değişkenlerinde Client ID / Secret tanımlanmamış. Bu durumda yerel MP4 export ve dosya indirme özellikleri kesintisiz çalışmaya devam eder.
- **`disconnected`**: Kimlik bilgileri tanımlı fakat kullanıcı henüz oturum açmamış. `/api/youtube/auth-url` ile tek tıkla yetkilendirme başlatılır.
- **`connected`**: Aktif geçerli OAuth oturumu mevcut. Render edilen MP4 Blob'ları doğrudan parçalı resumable yükleme ile YouTube'a gönderilebilir.
- **`expired`**: Erişim belirtecinin süresi dolmuş. Sistem otomatik yenilemeyi (refresh token) dener; yenilenemezse yeniden bağlanma istenir.

---

## 4. Yayınlama ve Zamanlama (Schedule) Kuralları

- **Resumable Upload Chunk Büyüklüğü:** Google standardı gereği $256 \text{ KiB}$ katları olmak zorundadır. FrostCut varsayılan olarak $5 \text{ MB}$ ($20 \times 256 \text{ KiB}$) parçalar kullanır.
- **İleri Tarihli Yayın (`publishAt`):** YouTube Data API v3 kuralı uyarınca zamanlanmış videoların `privacyStatus` değeri zorunlu olarak `private` olmalıdır. Geçmişe dönük zamanlama kabul edilmez.
