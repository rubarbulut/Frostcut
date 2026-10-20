# B004-B — BARIŞ (Frontend Optimization & State Lead)

**Durum:** `ready`  
**Baseline SHA:** `880e081122173630e1cf5e13291ba139fc2ea9a7`  
**Dal:** `feat/social-media-hub`  
**Çalışma Yolu:** `c:\Users\Arenb\Documents\Videoeditor`  

---

## 1. Gerçekten Bağlanan Kullanıcı ve Üretim Davranışı

1. **Kalıcı ve Sürümlü CreatorProfile Formu (`src/social/profile-storage.ts` & `src/social/CreatorProfileForm.tsx`):**
   - Tek canonical `CreatorProfile` ve `parseCreatorProfile` doğrulaması kullanıldı.
   - Form alanları: Kanal Adı (`name`), Dil (`language`), Oyun (`game`), Hedef Kitle (`audience`), Yorum Türü (`commentary`), Uzun Video Hedefi (`longTargetSeconds`), Short Hedefi (`shortTargetSeconds`), Short Sayısı (`shortCount`: 0–12), Kadraj Doldurma Modu (`fillMode`).
   - `shortCount = 0` geçerlidir ve form tarafından asla zorla 2'ye yuvarlanmaz.
   - Sürümlü zarf (`storageVersion: 1`, `savedAt`) ile `idb-keyval` (veya bellek içi) depolama. Bozuk veri, sürüm uyumsuzluğu ve depolama erişim engellerinde sessiz çökme engellendi; kullanıcıya anlaşılır hata durumları sunulur.
   - Hassas veri veya kimlik bilgileri profile kaydedilmez.

2. **Erişilebilir ve Eylem Güvenlikli Recipe İnceleme Ekranı (`src/social/RecipeReviewScreen.tsx`):**
   - Modal açılışı ve kart seçimi sıfır store mutation, sıfır ASR ve sıfır render maliyetindedir; saf inceleme sağlar.
   - Her kartta gerçek montaj süresi, hedef süre, aralıklar, dürüst gerekçe/evidence (`CandidateEvidence`) ve kadraj formatı gösterilir.
   - İlk 60 saniyeye sahte "hook/key highlight" etiketleri vurulmaz; Kaan'ın dürüst `equal-parts` / `signals` gerekçeleri yansıtılır.
   - Klavye erişilebilirliği: `Escape` tuşu ile kapatma, `radiogroup` ve ok/enter tuşlarıyla kart seçimi, focus trap.
   - `onApplyProject` ve `onExportDraft` asenkron callback'leri çift tık korumalıdır. İşlem sürerken modal açık kalır; başarısızlık durumunda veriler korunur.

3. **Çıktı Başına Korunan Yayın Taslağı (`src/PublishTools.tsx` & `src/SocialPostKit.tsx`):**
   - Başlık (100 karakter), açıklama (5000 karakter) ve hashtag'ler birbirinden ayrıştırıldı. Hashtag'lerin YouTube tags alanı olmadığı açıkça belirtildi.
   - Sekme veya sequence değişiminde metin kaybını önleyen yerel taslak buffer'ı ve sequence kimliği doğrulaması sağlandı.
   - Yapılmamış trend araştırması dürüstçe `not-researched` olarak etiketlendi; yapay SEO puanı veya uydurma metrikler kaldırıldı.
   - Platform limitleri (YouTube 5000 karakter, Reels 2200 karakter) doğru karakter sayaçlarıyla gösterilir.

4. **Kullanıcı Arayüzü Bütünlüğü ve Erişilebilirlik:**
   - Codex UI teslimi (`codex/creator-pipeline`), Pixel Snow Owl teması ve gothic stil korundu; hiçbir mevcut görsel çalışma ezilmedi.
   - Scoped stiller (`src/social/recipe-review.css`, `src/workspace-clarity.css`) ile global layout thrashing engellendi.

---

## 2. Public API ve Zaman Birimleri

- `loadCreatorProfile(backend?: ProfileStorageBackend): Promise<ProfileStorageResult<CreatorProfile | null>>`
- `saveCreatorProfile(profile: unknown, backend?: ProfileStorageBackend): Promise<ProfileStorageResult<CreatorProfile>>`
- `CreatorProfileForm`:
  - Props: `{ initialProfile?: CreatorProfile, storageBackend?: ProfileStorageBackend, autoLoad?: boolean, onSave?: (p: CreatorProfile) => void, onCancel?: () => void }`
- `RecipeReviewScreen`:
  - Props: `{ isOpen: boolean, onClose: () => void, project?: Project, sourceFiles?: ReadonlyMap<string, File>, profile?: CreatorProfile, proposals?: readonly CreatorProposal[], onApplyProject?: (project: Project, output: CreatorOutput) => void, onExportDraft?: (project: Project, output: CreatorOutput) => void }`
- `PublishTools`:
  - Props: `{ platform?: PublishPlatform, project?: Project, onCommit?: (nextProject: Project, message?: string) => void }`
- `SocialPostKit`:
  - Props: `{ project?: Project, onCommit?: (nextProject: Project, message?: string) => void }`
- Zaman birimleri: `longTargetSeconds`, `shortTargetSeconds`, aralıklar ve çıktılar tam saniye (IEEE-754 finite number).

---

## 3. Değiştirilen ve Eklenen Dosyalar

- `src/social/profile-storage.ts`
- `src/social/profile-storage.test.ts`
- `src/social/CreatorProfileForm.tsx`
- `src/social/CreatorProfileForm.test.ts`
- `src/social/RecipeReviewScreen.tsx`
- `src/social/RecipeReviewScreen.test.ts`
- `src/PublishTools.tsx`
- `src/SocialPostKit.tsx`
- `src/social/PublishTools.test.ts`
- `src/social/recipe-review.css`
- `src/workspace-clarity.css`

---

## 4. Test Sonuçları

- Komut: `npx vitest run src/social/profile-storage.test.ts src/social/CreatorProfileForm.test.ts src/social/RecipeReviewScreen.test.ts src/social/PublishTools.test.ts --maxWorkers=1 --no-file-parallelism`
- Test sayısı: 31 test, 4 test dosyası
- Sonuç: 31 passed (100% yeşil)
- Çalışma süresi: ~2.1s
- Fixture türü: Bellek içi mock storage backend, sentetik proje fikstürleri, React DOM server string render.

---

## 5. Bilinen Dış Bağımlılıklar & Manager Entegrasyonu

- Hiçbir harici ücretli API veya trend servisine bağımlılık yoktur.
- `App.tsx` içindeki mount noktaları ve `creatorPipeline` callback bağlantıları Manager tarafından tamamlanmıştır.
