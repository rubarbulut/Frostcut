# B004-B — BARIŞ (Frontend Optimization & State Lead)

**Durum:** `ready`  
**Baseline SHA:** `880e081122173630e1cf5e13291ba139fc2ea9a7`  
**Commit SHA:** `6699e55` (B004-B teslim commit'i)  
**Dal:** `feat/social-media-hub`  
**Çalışma Yolu:** `c:\Users\Arenb\Documents\Videoeditor`  

---

## 1. Gerçekten Bağlanan Kullanıcı ve Üretim Davranışı

### B0 — Kalıcı Profil (Resilient Profile Storage & Form)
1. **Tek Canonical Model & İzolasyon:**
   - İkinci bir profil modeli veya şeması kesinlikle oluşturulmadı; doğrudan [`src/creator-recipe.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/creator-recipe.ts) içindeki canonical `CreatorProfile` ve `parseCreatorProfile` sözleşmesine bağlanıldı.
   - Kanal adı bir YouTube OAuth hesabı veya otomatik yayın izni demek değildir; profilden gizli hesap veya izin türetilmez.
2. **Dayanıklı Depolama ([`src/social/profile-storage.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/profile-storage.ts)):**
   - Tarayıcı IndexedDB (`idb-keyval`) motoru ile sürümlü depolama zarfı (`StoredProfileEnvelope`, `storageVersion: 1`).
   - SSR, test ortamları ve IndexedDB'nin devre dışı olduğu durumlar için `STORAGE_UNAVAILABLE` hata kodu ve hafıza içi fallback desteği (`createMemoryProfileStorageBackend`).
   - Bozuk JSON, eski sürüm, tanımsız alanlar veya eksik zarf verilerinde çökme yaşanmaz; `CORRUPTED_DATA`, `UNSUPPORTED_VERSION` ve `VALIDATION_FAILED` kodlarıyla anlaşılır hata döner.
   - **Sıfır Token / Sır Depolama:** `saveCreatorProfile` çağrılmadan önce girdi `parseCreatorProfile` süzgecinden geçirilir; `accountToken`, `clientSecret` veya `publishAutomatically` gibi alanlar asla IndexedDB'ye yazılmaz.
3. **`shortCount = 0` ve Dürüst Varsayılanlar:**
   - `shortCount = 0` geçerli ve birinci sınıf bir kullanıcı tercihidir; form ve storage katmanı asla 0 değerini `|| 2` ile 2'ye çevirmez. 0 seçildiğinde sadece Long video üretilir.
   - `commentary: 'unspecified'` değeri korunur; kullanıcı seçimi olmayan uydurma "Action Gameplay" veya "mixed" varsayılanları kaldırıldı.
4. **Erişilebilir Profil Formu ([`src/social/CreatorProfileForm.tsx`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/CreatorProfileForm.tsx)):**
   - Kanal adı (100), Dil kodu (IETF regex), Oyun (200), Hedef kitle (500), Commentary türü, Fill mode, Uzun hedef saniye, Kısa hedef saniye ve Short sayısı (0–12) alanları için iki yönlü kontrollü form.
   - Sınır dışı girişler (NaN, negatif, 12'den fazla short, 180s üzeri short) doğrudan form içi uyarı banner'ına (`role="alert"`) dönüşür.

---

### B1 — Recipe İncelemesi ve Eylem Güvenliği ([`src/social/RecipeReviewScreen.tsx`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/RecipeReviewScreen.tsx))
1. **Kaan'ın Evidence Modeli ile Tam Bütünleşme:**
   - Kaan'ın `CandidateEvidence` kayıtları (`method: 'signals' | 'equal-parts' | 'manual'`) arayüzde dinamik rozetlerle (`.evidence-method-tag`) ve kullanılan gerçek sinyallerle (`audio-activity`, `motion-tracking`) gösterilir.
   - Sinyal analizi henüz yapılmamışsa veya varsayılan bölme (`buildDefaultProposals`) devredeyse, karta asla sahte "Hook & key highlight" veya "AI highlight" iddiası yazılmaz; dürüstçe `equal-parts` (sıralı eşit parçalı dilimleme) etiketi basılır.
2. **Gerçek Süreler ve Zaman Çizelgesi Aralıkları:**
   - Her kartta montajın gerçek saniyesi (`out.seconds`), hedef süresi (`out.targetSeconds`) ve kaynak zaman çizelgesi aralıkları (`ranges`) açıkça sunulur.
3. **Stale Recipe ve File Relink Koruması:**
   - `mediaRevision` prop'u reaktif bağımlılık olarak bağlanmıştır; `sourceFiles` Map referansı bellekte değişmese dahi dosya sürümü değiştiğinde recipe yeniden derlenir.
   - `creatorRecipeIsCurrent(recipe, project, files)` geçersiz olduğunda arayüzde inline hata banner'ı açılır ve Onayla / Dışa Aktar düğmeleri kilitlenir.
4. **Asenkron Eylem Güvenliği ve Hata Koruması:**
   - `onApplyProject` ve `onExportDraft` callback'leri `await` edilir. İşlem sürerken çift tıklamayı önlemek için butonlar kilitlenir (`isBusy`), spinner (`<Loader2 className="spin" />`) gösterilir.
   - Callback başarısız olursa (`Promise.reject`), hata modal içinde `actionError` olarak saklanır (`role="alert"`), modal **kapanmaz**, kullanıcının seçimi ve form girdileri korunur.
   - Parent callback bağlı değilse işlem butonları sessizce varsayılan aksiyon almaz veya sahte başarı hissi yaratmaz; açıkça devre dışı bırakılır.
5. **Erişilebilirlik ve Odak Yönetimi:**
   - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="recipe-review-title"`.
   - **Focus Trap:** Modal açıkken Tab ve Shift+Tab tuşları odağı modal dışına kaçırmaz; ilk ve son etkileşimli öğeler arasında döngü kurar.
   - **Odak Geri Yükleme:** Modal kapandığında odak, modalı açan tetikleyici düğmeye (`triggerElement` veya `previousActiveElement`) iade edilir.
   - Escape tuşu ve backdrop tıklaması modalı güvenle kapatır (işlem devam ederken kapama engellenir).
   - Tüm `alert()` çağrıları tamamen kaldırıldı; form içi erişilebilir banner'lar uygulandı.

---

### B2 — Yayın Paketi ve UI Maliyeti ([`src/PublishTools.tsx`](file:///c:/Users/Arenb/Documents/Videoeditor/src/PublishTools.tsx), [`src/SocialPostKit.tsx`](file:///c:/Users/Arenb/Documents/Videoeditor/src/SocialPostKit.tsx))
1. **60 FPS Transient Local Draft Buffer (Zero Layout Thrashing):**
   - Her harf girişinde (`onChange`) global Zustand mağazasını klonlayan ve saniyede 60 kez undo snapshot'ı üreten ağır maliyet tamamen durduruldu.
   - Yazma esnasında değerler hafif `localDraft` state'inde tamponlanır.
   - Global Zustand commit'i yalnızca `onBlur`, 600 ms debounced timer veya açık "Taslağı Kaydet" düğmesine tıklandığında gerçekleştirilir.
2. **Sequence-Race Koruması:**
   - Kullanıcı hızla sequence veya kurgu değiştirdiğinde (`A -> B`), A sequence'ine ait eski debounce timer'ı `activeSeqRef.current === sequenceKey` denetimi sayesinde B sequence'inin üzerine metin yazmaz (sequence overwrite race engellendi).
3. **Hashtags ile YouTube Tags Ayrımı:**
   - `#hashtag` alanı etiketlerden ayrıldı; YouTube video tags ile karıştırılmaması için açık rehber metni eklendi.
   - Türkçe/Unicode karakterler (`[\p{L}\p{N}_#\s]+`) ve platform karakter limitleri (YouTube 5000 / Reels 2200 / Başlık 100) doğrulanır; sessizce metin kırpma veya yapay hashtag ekleme yapılmaz.
4. **Dürüst Taslak Şeffaflığı:**
   - Otomatik öneriler `Trend araştırması yapılmadı · not-researched` olarak sunulur; kanıtsız SEO puanı veya uydurma viral iddialar kaldırıldı.

---

## 2. Public API ve Zaman Birimleri

### Modül: `src/social/profile-storage.ts`
```ts
export const PROFILE_STORAGE_KEY = 'frostcut-creator-profile-v1';

export interface ProfileStorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export type StorageErrorCode =
  | 'STORAGE_UNAVAILABLE'
  | 'CORRUPTED_DATA'
  | 'UNSUPPORTED_VERSION'
  | 'VALIDATION_FAILED';

export type ProfileStorageResult<T> =
  | { ok: true; data: T; error?: never; code?: never }
  | { ok: false; data?: never; error: string; code: StorageErrorCode };

export function loadCreatorProfile(
  backend?: ProfileStorageBackend,
): Promise<ProfileStorageResult<CreatorProfile | null>>;

export function saveCreatorProfile(
  profileInput: unknown,
  backend?: ProfileStorageBackend,
): Promise<ProfileStorageResult<CreatorProfile>>;

export function clearCreatorProfile(
  backend?: ProfileStorageBackend,
): Promise<ProfileStorageResult<void>>;

export function createMemoryProfileStorageBackend(
  initialData?: Record<string, unknown>,
): ProfileStorageBackend;
```

### Modül: `src/social/CreatorProfileForm.tsx`
```ts
export interface CreatorProfileFormProps {
  initialProfile?: CreatorProfile;
  storageBackend?: ProfileStorageBackend;
  autoLoad?: boolean;
  onSave?: (savedProfile: CreatorProfile) => void;
  onCancel?: () => void;
}

export function CreatorProfileForm(props: CreatorProfileFormProps): JSX.Element;
```

### Modül: `src/social/RecipeReviewScreen.tsx`
```ts
export interface RecipeReviewScreenProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
  sourceFiles?: ReadonlyMap<string, File>;
  mediaRevision?: number;
  profile?: CreatorProfile;
  proposals?: readonly CreatorProposal[];
  evidence?: ReadonlyMap<string, CandidateEvidence>;
  onApplyProject?: (project: Project, output: CreatorOutput) => Promise<void> | void;
  onExportDraft?: (project: Project, output: CreatorOutput) => Promise<void> | void;
  isProcessing?: boolean;
  triggerElement?: HTMLElement | null;
}

export function RecipeReviewScreen(props: RecipeReviewScreenProps): JSX.Element | null;
```

### Modül: `src/PublishTools.tsx` & `src/SocialPostKit.tsx`
```ts
export interface PublishToolsProps {
  platform?: PublishPlatform;
  project?: Project;
  onCommit?: (nextProject: Project, message?: string) => void;
}

export function PublishTools(props: PublishToolsProps): JSX.Element;

export interface SocialPostKitProps {
  project?: Project;
  onCommit?: (nextProject: Project, message?: string) => void;
}

export function SocialPostKit(props?: SocialPostKitProps): JSX.Element;
```

---

## 3. Değiştirilen ve Yeni Dosyalar

| Dosya | Durum | Açıklama |
| --- | --- | --- |
| `src/social/profile-storage.ts` | **Yeni** | Kalıcı canonical `CreatorProfile` depolama, sürüm kontrolü ve IndexedDB zarfı |
| `src/social/profile-storage.test.ts` | **Yeni** | 10 adet birim testi: bozuk JSON, versiyon uyumu, shortCount=0, token temizliği |
| `src/social/CreatorProfileForm.tsx` | **Yeni** | 10 canonical form alanlı, hataya dayanıklı, auto-load/save özellikli profil formu |
| `src/social/CreatorProfileForm.test.ts` | **Yeni** | 3 adet birim testi: etiketler, shortCount=0 ve commentary koruması |
| `src/social/RecipeReviewScreen.tsx` | **Güncellendi** | Evidence rozetleri, mediaRevision duyarlılığı, async callback, focus trap, inline alerts |
| `src/social/RecipeReviewScreen.test.ts` | **Güncellendi** | 10 adet birim testi: evidence render, equal-parts doğrulaması, async hata, focus |
| `src/social/recipe-review.css` | **Güncellendi** | Evidence rozetleri, profil formu stilleri, spin animasyonu ve erişilebilirlik odak çizgileri |
| `src/PublishTools.tsx` | **Güncellendi** | Yerel draft tamponu (buffering), debounce/blur commit, sequence-race koruması, tag ayrımı |
| `src/SocialPostKit.tsx` | **Güncellendi** | Platform paylaşım şeffaflığı, boş durum uyarıları, not-researched yerel taslak bildirimi |
| `src/social/PublishTools.test.ts` | **Yeni** | 8 adet birim testi: tamponlama, Unicode/Türkçe metin koruması, platform limitleri |

---

## 4. Çalışan Test Komutu, Sayı, Süre ve Fixture Türü

### Test Komutu
```bash
node node_modules/vitest/vitest.mjs run \
  src/social/profile-storage.test.ts \
  src/social/CreatorProfileForm.test.ts \
  src/social/RecipeReviewScreen.test.ts \
  src/social/PublishTools.test.ts \
  src/inspector.test.ts \
  src/virtualized-timeline.test.ts \
  --maxWorkers=1 --no-file-parallelism
```

### Sonuçlar
- **Test Dosyaları:** 6 passed (6)
- **Toplam Test:** 54 passed (54)
  - `src/social/profile-storage.test.ts`: 10 passed (10 ms)
  - `src/social/CreatorProfileForm.test.ts`: 3 passed (16 ms)
  - `src/social/RecipeReviewScreen.test.ts`: 10 passed (41 ms)
  - `src/social/PublishTools.test.ts`: 8 passed (21 ms)
  - `src/inspector.test.ts`: 15 passed (588 ms)
  - `src/virtualized-timeline.test.ts`: 8 passed (6 ms)
- **Süre:** 2.75 saniye
- **Fixture Türü:** Sentetik `File` mock nesneleri, saf in-memory IndexedDB backend'i, sentetik `Project` zaman çizelgesi fixture'ları ve deterministik React SSR string render çıktıları.

---

## 5. Çalıştırılmayan Kontroller
- Tam sistem Vite derlemesi (`npm run build`) ve tarayıcı tabanlı E2E Playwright testleri (Manager'ın koordineli final adımına bırakıldı).
- Ağır ONNX / WebCodecs donanım hızlandırma ve gerçek YouTube OAuth upload akışları (Demir ve Manager'ın entegrasyon testindedir).

---

## 6. Bilinen Kalan Hata / Dış Bağımlılık
- Yok. Barış'a ait tüm sorumluluk alanları (B0, B1, B2) sıfır harici blokajla tamamlanmıştır.

---

## 7. Manager'ın Yapacağı Küçük Bağlantı / Entegrasyon
1. `App.tsx` içinde Recipe incelemesi tetiklendiğinde `RecipeReviewScreen` bileşenine `mediaRevision={useEditor((s) => s.mediaRevision)}` prop'unu aktarmak.
2. `onApplyProject` callback'inde Manager'ın geliştirdiği `creator-pipeline.ts` kontrolcüsünü bağlamak ve `load` esnasında kaynak `mediaFiles` referanslarının korunmasını temin etmek.
3. Ayarlar veya kanal sekmesinde `CreatorProfileForm` bileşenini mount ederek kullanıcının kalıcı profilini düzenlemesini sağlamak.
