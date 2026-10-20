# B004-K — KAAN (Video Architecture & Performance Lead)

**Durum:** `ready`  
**Baseline SHA:** `880e081122173630e1cf5e13291ba139fc2ea9a7`  
**Dal:** `feat/social-media-hub`  
**Çalışma Yolu:** `c:\Users\Arenb\Documents\Videoeditor`  

---

## 1. Gerçekten Bağlanan Kullanıcı ve Üretim Davranışı

1. **`shortCount` Esnekliği (0–12):**
   - Eski `shortCount < 2` minimum zorlaması tamamen kaldırıldı.
   - Kullanıcı profilde `shortCount: 0` seçtiğinde sıfır Shorts adayı ve 1 ana Long kurgusu üretilir.
   - `shortCount: 1` seçildiğinde en fazla 1 adet; `shortCount: 12` seçildiğinde en fazla 12 adet benzersiz aday üretilir.
   - Kaynak video süresi istenen sayıda adaya yetmiyorsa sahte/örtüşen kopya adaylar uydurulmaz; kaç adet sığıyorsa o kadarı dürüstçe döner.
   - Çok kısa kaynak kayıtlar (ör. 8 saniye) çökmeksizin tek parça olarak korunur.

2. **Hedef Süreler ve Hikâye Bütünlüğü (`longTargetSeconds`):**
   - `longTargetSeconds` bir tercih olarak ele alınır. Sırf hedefe uydurmak için kurgunun sonu açıklamasız kesilmez ("curated narrative" veya "lobby removed" gibi uydurma iddialar kaldırıldı).
   - Güvenli long fallback tüm kaynak zaman çizelgesini korur ve `evidence` kaydında hedef süre ile gerçek montaj süresi açıkça karşılaştırılır.

3. **Kanıt Dürüstlüğü ve Şeffaf Evidence Modeli:**
   - Ölçülmemiş uydurma metrikler (sabit 0.1 taban hareket, kesim noktası yakınlığı veya klip hızı) hareket enerjisi olarak kabul edilmez.
   - Yalnızca gerçek kamera/obje takip noktaları (`clip.tracking.points`) veya dış `motionData` varsa hareket puanı verilir.
   - Her adaya bağlı `CandidateEvidence` kaydı sunulur:
     - `method`: `'signals' | 'equal-parts' | 'manual' | 'insufficient-evidence'`
     - `signalsUsed`: `('motion-tracking' | 'audio-activity' | 'user-marker' | 'transcript' | 'none')[]`
     - `unavailableSignals`: Ölçülmeyen eksik sinyallerin listesi
     - `explanation`: Neden bu aralığın seçildiğinin dürüst açıklaması
   - Sinyal yoksa açıkça `equal-parts` (sıralı eşit bölme) çalışır; ilk 60 saniyeye asla sahte "hook" veya "highlight" etiketi vurulmaz.

4. **Kaynak Zamanı → Timeline Dönüşümü ([`src/social/audio-to-timeline.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/audio-to-timeline.ts)):**
   - Okan'ın `AssetAudioProfile` profilleri kaynak saniyesi (source domain) cinsindendir.
   - Her klibin `sourceStart`/`sourceEnd` kesişimi alınarak `timeline = clip.start + (sourceTime - clip.sourceStart) / clip.properties.speed` formülüyle timeline saniyesine eşlenir.
   - Hız değişimleri (0.5x, 2x) süre ölçeklemesiyle yönetilir (2x hızda timeline süresi yarıya iner).
   - Aynı kaynak dosyasının timeline'da birden çok klipte kullanılması desteklenir; kaynak vurgusu her iki klipteki ilgili timeline anlarına yansıtılır.
   - Muted track'ler ve volume = 0 olan klipler `isAudible: false` olarak işaretlenir ve enerji hesaplamasında sessiz kabul edilir.
   - Okan'ın `AssetAudioProfile` nesnesi asla mutasyona uğratılmaz; saf fonksiyonel dönüşüm yapılır.

5. **Ayrıştırılmış Önbellek Mimarisi (Analysis Cache vs Proposal Cache):**
   - Ağır tek geçişli timeline analizi (`analyzeSharedTimeline`) ile hafif aday seçimi (`findProjectCandidates`) ayrıldı.
   - Yalnızca `shortCount` veya hedef süreler değiştiğinde pahalı ham analiz tekrarlanmaz; `WeakMap` üzerinden anında (0 ms) yeniden kullanılır.
   - Dosya relink (`sourceFiles` boyutu/tarihi değişimi) veya `mediaRevision` artışı durumunda önbellek otomatik geçersiz kılınır.
   - `AbortSignal` ile kooperatif iptal desteklenir; iptal edilen analiz önbelleği kirletmez.

6. **Codex Sözleşmesine Tam Uyum:**
   - Üretilen tüm `ranges: [{ start, end }]` aralıkları ham timeline saniyeleridir.
   - `createCreatorRecipe` ve `materializeCreatorOutput` fonksiyonlarına doğrudan beslenerek 16:9 ve 9:16 çıktılara dönüştürülebilir.

---

## 2. Public API ve Zaman Birimleri

### Modül: `src/social/candidate-finder.ts`
```ts
export function findProjectCandidates(
  project: Project,
  options?: CandidateFinderOptions,
): CandidateFinderResult;

export function analyzeSharedTimeline(
  project: Project,
  options?: CandidateFinderOptions,
): SharedMediaTimelineAnalysis;
```
* **Zaman Birimleri:**
  - `start`, `end`, `duration`: Timeline saniyeleri (`number`, finite).
  - `longTargetSeconds`, `shortTargetSeconds`, `minShortSeconds`, `maxShortSeconds`: Saniye.
  - `sampleInterval`: Saniye (varsayılan: 0.5s).

### Modül: `src/social/audio-to-timeline.ts`
```ts
export function mapAssetProfilesToTimeline(
  project: Project,
  profiles: ReadonlyMap<string, AssetAudioProfile> | readonly AssetAudioProfile[],
): ProjectTimelineAudioMapping;

export function mapSourceRangeToClipTimeline(
  sourceStart: number,
  sourceEnd: number,
  clip: Clip,
  isAudible: boolean,
): TimelineAudioRegion | null;

export function isClipAudibleOnTimeline(
  project: Project,
  clip: Clip,
): boolean;
```
* **Zaman Birimleri:**
  - Girdi `sourceStart`, `sourceEnd`: Kaynak medya saniyesi.
  - Çıktı `start`, `end`: Proje timeline saniyesi.
  - `profile.hopSizeMs`: Milisaniye (50 ms).

---

## 3. Değiştirilen ve Eklenen Dosyalar

| Dosya | Durum | Açıklama |
| :--- | :--- | :--- |
| [`src/social/candidate-finder.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/candidate-finder.ts) | Güncellendi | B004-K kanıt dürüstlüğü, shortCount 0-12, segmented cache, abort desteği |
| [`src/social/audio-to-timeline.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/audio-to-timeline.ts) | Yeni | Kaynak saniyesi → timeline dönüşüm motoru (0.5x/2x, multi-clip, mute/hidden) |
| [`src/social/candidate-finder.test.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/social/candidate-finder.test.ts) | Güncellendi | B004-K test matrisi (15/15 test) |

---

## 4. Çalışan Test Komutu, Sayı, Süre ve Fixture Türü

```bash
npx vitest run src/social/candidate-finder.test.ts --maxWorkers=1 --no-file-parallelism
```

```text
 RUN  v5.0.2 C:/Users/Arenb/Documents/Videoeditor

 ✓ src/social/candidate-finder.test.ts (15 tests) 39ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  10:15:18
   Duration  655ms
```

### Kaan'ın Tüm Testleri (Regresyonsuz):
```bash
npx vitest run src/social/candidate-finder.test.ts src/active-window-decoder.test.ts src/shuttle-controller.test.ts --maxWorkers=1 --no-file-parallelism
```
```text
 ✓ src/active-window-decoder.test.ts (17 tests) 187ms
 ✓ src/social/candidate-finder.test.ts (15 tests) 31ms
 ✓ src/shuttle-controller.test.ts (14 tests) 11ms

 Test Files  3 passed (3)
      Tests  46 passed (46)
   Duration  2.00s
```

* **Fixture Türü:** Sentetik proje modelleri, `AssetAudioProfile` veri yapıları, motion tracking noktaları ve in-memory sahte `File` nesneleri. Gerçek video decode ve model çıkarımı yapılmamıştır.

---

## 5. Çalıştırılmayan Kontroller

- Fiziksel GPU üzerinde gerçek 4K/60fps video akışından canlı optical flow çıkarımı (direktör direktifi gereği bu aşamada çalıştırılmadı).
- Canlı browser UI etkileşim testleri (Barış'ın `RecipeReviewScreen` bileşenine aittir).

---

## 6. Bilinen Kalan Hata / Dış Bağımlılık

- Kaan'a ait dosyalarda hiçbir hata veya TypeScript uyarı/hatası bulunmamaktadır (`npx tsc --noEmit` Kaan dosyalarında %100 temizdir).

---

## 7. Manager'ın Yapacağı Küçük Bağlantı

- `App.tsx` veya yeni `creator-pipeline.ts` içerisinden `findProjectCandidates(project, { shortCount, shortTargetSeconds, audioProfiles })` fonksiyonu çağrılmalıdır.
- Elde edilen `proposals` ve `evidence` haritası doğrudan Barış'ın `RecipeReviewScreen` bileşenine props olarak aktarılabilir.
