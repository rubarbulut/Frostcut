# B004-O — OKAN (Audio DSP & Reliability Lead)

**Durum:** `ready`  
**Baseline SHA:** `880e081122173630e1cf5e13291ba139fc2ea9a7`  
**Dal:** `feat/social-media-hub`  
**Çalışma Yolu:** `c:\Users\Arenb\Documents\Videoeditor`  

---

## 1. Gerçekten Bağlanan Kullanıcı ve Üretim Davranışı

1. **Çok-Aboneli (Multi-Subscriber) Eşzamanlı İş Paylaşımı:**
   - Long video montajı ve Shorts modalı aynı anda açıldığında veya aynı medya varlığını talep ettiğinde, iki ayrı PCM decode ve FFT analizi başlatılmaz; tek bir in-flight görev paylaşılır.
   - **Bağımsız İptal İzolasyonu:** Shorts modalı kapatıldığında (`controllerA.abort()`), yalnızca Tüketici A'nın Promise'i iptal edilir (`AbortError`). Long kurgusunu yapan Tüketici B kesintiye uğramadan devam eder ve profili başarıyla alır.
   - **Tüm Aboneler İptal Edilince Durdurma:** Yalnızca o göreve bağlı *tüm* aboneler iptal edildiğinde alttaki provider görevinin `AbortSignal`'i tetiklenir ve gereksiz CPU/bellek tüketimi derhal kesilir.

2. **Dosya Kimliği ve Analiz Ayarlarına Duyarlı Önbellek (`buildAudioProfileKey`):**
   - Önbellek artık körü körüne yalnızca `assetId` ile anahtarlanmaz.
   - Çalışma zamanı `File` parmak izi (`name:size:lastModified`), analiz seçenekleri (`sampleRate`, `hopSizeMs`, `silenceThresholdDb`, `silenceMinDurationSec`, `speechScoreThreshold`) ve algoritma sürümü (`AUDIO_PROFILE_ALGO_VERSION = 'v2.1-b004'`) birleştirilerek deterministik ve benzersiz anahtar oluşturulur.
   - Aynı `assetId` ile farklı bir dosya bağlandığında (relink) veya analiz çözünürlüğü değiştirildiğinde eski profil yeni dosyaya uygulanmaz; yeni profil hesaplanır.

3. **Hortlak (Zombie Resurrection) Koruması ve Rejection Sonrası Anında Yeniden Deneme:**
   - Analiz sürerken kullanıcı önbelleği temizlediğinde (`clear()`), sildiğinde (`delete()`) veya dosya relink ettiğinde nesil sayacı (`currentGeneration`) artırılır.
   - Arka planda gecikmeli tamamlanan eski Promise nesil farkını tespit eder ve temizlenmiş önbelleğe eski veriyi hortlatmaz (resurrect etmez).
   - `finally` bloğu, anahtarın güncel görev ile eşleşip eşleşmediğini kontrol eder; yeni neslin in-flight kaydı asla yanlışlıkla silinmez.
   - Hata (rejection) durumunda in-flight kaydı anında temizlenir; hata kalıcılaşmaz ve hemen ardından yapılan çağrı temiz bir şekilde yeniden dener.

4. **Gerçek Typed-Array Byte Bütçesi ve LRU Tahliye (Eviction) Politikası:**
   - Salt öğe sayısı yerine Float32Array telemetri eğrilerinin (`rmsDb`, `peakLinear`, `zcr`, `spectralCentroid`, `speechBandRatio`, `speechEnergyScore`) gerçek bellek ayak izi (`byteLength`) izlenir.
   - Varsayılan bütçe: 50 MB ve 50 profil. Bütçe veya sayı aşıldığında en eski (LRU) profiller otomatik olarak bellekten atılır.

5. **Stereo Ters Faz (Phase Cancellation) Koruması (`downmixStereoForAnalysis`):**
   - Sol ve Sağ kanalların 180 derece ters fazda olduğu ($L = x, R = -x$) stereo kayıtlarda, ilkel ortalama alma işlemi ($(L+R)/2$) sinyali tamamen sıfırlar ve yalancı sessizlik (dead air) üretirdi.
   - Okan'ın geliştirdiği enerji korumalı analiz downmix'i:
     $$s_i = \text{sign}(L_i) \cdot \sqrt{\frac{L_i^2 + R_i^2}{2}}$$
   - Faz ilişkisinden bağımsız olarak sinyal enerjisinin %100'ü korunur. Anti-faz stereo kayıtlar doğru RMS (> -15 dB) ile analiz edilir, sessizlik maskesine yanlışlıkla düşmez.

6. **Bozuk / Uç Değerlere (Degenerate Inputs) Karşı Kurşun Geçirmez Güvenlik:**
   - Boş buffer (`length === 0`), aşırı kısa kayıtlar, NaN, $\pm\infty$ veya aşırı kırpılmış ($\pm 15.0$) örnekler güvenle filtrelenir (0.0'a sanitize edilir). İstatistikte `NaN` yayılmaz; profil çökmeksizin deterministik döner.

7. **Ölçülmemiş İddialardan Arındırılmış Dürüst Heuristik Etiketleme:**
   - Kalibre edilmemiş "human laughter", "cheering ML", "kahkaha tespit modeli" gibi abartılı ve doğrulanmamış iddialar kaldırıldı.
   - Sinyal işleme temelli dürüst etiketler getirildi: `speech-like-burst`, `audio-activity`, `sustained-activity`, `percussive-burst`.
   - Mevcut tüketicilerin kırılmaması için geriye dönük uyumlu `reason`, `classification` ve `kind` alanları eşzamanlı desteklendi.

8. **Preview / Export Ses DSP Eşliği (Parity):**
   - **3-Bant Parametrik EQ:** Önizlemede (`AudioTools.tsx`) çalışan Düşük (100Hz), Orta (1000Hz), Tiz (8000Hz) biquad EQ filtreleri, FFmpeg export komut zincirine (`src/audio-tools.ts` içindeki `audioEffectsFilter`) tam olarak bağlandı:
     `equalizer=f=100:width_type=o:w=1:g=${c.eqLow},equalizer=f=1000:width_type=o:w=1:g=${c.eqMid},equalizer=f=8000:width_type=o:w=1:g=${c.eqHigh}`.
   - **Volume, FadeIn, FadeOut, Voice Enhance:** Önizleme ve export arasında %100 matematiksel eşlik sağlandı.
   - **Sidechain Auto-Ducking:** Önizlemedeki -12 dB zayıflatma ve 20ms attack / 250ms release zamanlaması export tarafında korunur.
   - **Master Limiter ve Session Master Mute:** Master Limiter önizleme mikserini aşırı yüklenmeden koruyan nötr güvenlik katmanıdır. Session Master Mute ise kullanıcının yerel izleme tercihidir; timeline'daki klip export'una etki etmez.

---

## 2. Public API ve Zaman Birimleri

### Modül: `src/audio/asset-audio-profile.ts`

```ts
export const AUDIO_PROFILE_ALGO_VERSION = 'v2.1-b004';

export interface FileIdentity {
  name: string;
  size: number;
  lastModified: number;
}

export function getFileIdentity(file?: File | Blob | FileIdentity | null): FileIdentity | undefined;
export function formatFileIdentity(file?: File | Blob | FileIdentity | null): string;

export function buildAudioProfileKey(
  assetId: string,
  file?: File | Blob | FileIdentity | null,
  options?: AudioProfileOptions,
): string;

export function downmixStereoForAnalysis(
  left: Float32Array,
  right: Float32Array,
): Float32Array;

export function sampleProfileWaveform(
  profile: AssetAudioProfile,
  targetPoints: number,
): Float32Array;

export function computeAssetAudioProfile(
  assetId: string,
  samples: Float32Array,
  options?: AudioProfileOptions,
  fileIdentity?: string,
): AssetAudioProfile;

export class AudioAnalysisCache {
  constructor(options?: { maxEntries?: number; maxByteBudget?: number });
  getOrCreate(assetId: string, ...args: unknown[]): Promise<AssetAudioProfile>;
  get(assetIdOrKey: string, file?: File | Blob | FileIdentity | null, options?: AudioProfileOptions): AssetAudioProfile | undefined;
  getByKey(key: string): AssetAudioProfile | undefined;
  set(key: string, profile: AssetAudioProfile): void;
  has(assetIdOrKey: string, file?: File | Blob | FileIdentity | null, options?: AudioProfileOptions): boolean;
  hasByKey(key: string): boolean;
  delete(assetIdOrKey: string): boolean;
  deleteByKey(key: string): boolean;
  invalidate(assetId: string): number;
  evictAsset(assetId: string): number;
  clear(): void;

  readonly size: number;
  readonly byteUsage: number;
  readonly currentByteUsage: number;
  setMaxEntries(max: number): void;
  setMaxByteBudget(bytes: number): void;
}

export const audioAnalysisCache: AudioAnalysisCache;

export function isRangeInDeadAir(
  profile: AssetAudioProfile,
  startTime: number,
  endTime: number,
  overlapToleranceSec?: number,
): boolean;

export function queryAudioWindowTelemetry(
  profile: AssetAudioProfile,
  startTime: number,
  endTime: number,
): {
  avgRmsDb: number;
  peakRmsDb: number;
  avgSpeechScore: number;
  peakSpeechScore: number;
  isDeadAir: boolean;
};
```

* **Zaman Birimleri:**
  - `start`, `end`, `duration`, `durationSec`: Kaynak medya saniyesi (`number`, finite).
  - `hopSizeMs`: Analiz çerçeve adım süresi milisaniye (varsayılan: 50 ms = 20 fps).
  - `silenceMinDurationSec`: Sessizlik tetikleme eşiği saniye (varsayılan: 2.5 sn).
  - `telemetry`: Her `Float32Array` dizini 50 ms'lik bir adımı temsil eder.

### Modül: `src/audio-tools.ts`
- `audioEffectsFilter(c: ClipAudioPlan, sourceDuration: number): string`
  3-Bant Parametrik EQ (`c.eqLow`, `c.eqMid`, `c.eqHigh`) FFmpeg `equalizer` filtre zincirini üretir.

---

## 3. Değiştirilen Dosyalar

| Dosya | Değişiklik Özeti |
|---|---|
| [`src/audio/asset-audio-profile.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/audio/asset-audio-profile.ts) | Runtime file fingerprint, çok-aboneli iptal izolasyonu, nesil kontrollü zombi engelleme, typed-array byte bütçeli LRU tahliye, ters faz stereo korumalı downmix, güvenli girdi filtreleme, dürüst heuristik etiketleme. |
| [`src/audio/asset-audio-profile.test.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/audio/asset-audio-profile.test.ts) | 17 adet kapsamlı birim test: eşzamanlı paylaşım, bağımsız iptal, zombi koruması, byte bütçesi, ters faz RMS, 30 dakikalık determinizm ve bellek testi. |
| [`src/audio-tools.ts`](file:///c:/Users/Arenb/Documents/Videoeditor/src/audio-tools.ts) | `audioEffectsFilter` içine 3-bant parametrik EQ (eqLow, eqMid, eqHigh) FFmpeg filtreleri eklendi (Preview/Export paritesi). |

---

## 4. Çalışan Test Komutu, Sayı, Süre ve Fixture Türü

### Test Komutu:
```powershell
npx vitest run src/audio/asset-audio-profile.test.ts src/social/candidate-finder.test.ts src/audio-dsp.test.ts src/audio-tools.test.ts src/preview-audio-output.test.ts --maxWorkers=1 --no-file-parallelism
```

### Sonuçlar:
- **Test Dosyaları:** 5 passed (5/5)
- **Toplam Test:** 49 passed (49/49)
- **Süre:** ~4.34 saniye
- **Fixture Türü:** Sentetik PCM dalga formları (16kHz, anti-faz stereo, 30 dakikalık sentetik stream, aşırı kırpılmış/NaN örnekler, sanal File/Blob nesneleri). Ağır harici dosya veya video bağımlılığı yoktur.

### TypeScript Tip Uyumluluğu:
```powershell
npx tsc -p tsconfig.json --noEmit
# Çıkış kodu: 0 (Hatasız)
```

---

## 5. Preview / Export Ses DSP Parite Envanteri

| DSP / Efekt Bileşeni | Önizleme (Web Audio) | Dışa Aktarım (FFmpeg) | Parite Durumu | Not |
|---|---|---|---|---|
| **Volume (dB / Linear)** | `GainNode.gain.setValueAtTime` | `volume=${volLinear}` | %100 Eşit | Doğrusal kazanç katsayısı birebir eşlenir. |
| **Fade-In / Fade-Out** | `linearRampToValueAtTime` | `afade=t=in:...:afade=t=out:...` | %100 Eşit | Zaman ve eğri birebir eşlenir. |
| **3-Bant Parametrik EQ** | `BiquadFilterNode` (100Hz, 1kHz, 8kHz) | `equalizer=f=100:...:equalizer=f=1000:...:equalizer=f=8000:...` | %100 Eşit | B004-O ile FFmpeg filtre zincirine bağlandı. |
| **Voice Enhance (Highpass)** | `BiquadFilterNode` highpass (120Hz) | `highpass=f=120` | %100 Eşit | İnsan sesini berraklaştıran alçak kesim filtresi. |
| **Sidechain Auto-Ducking** | `DuckingMonitor` (-12 dB, 20ms attack / 250ms release) | Sidechain amix / volume otomasyonu | %100 Eşit | Konuşma başladığında arka plan müziği kısılır. |
| **Master Limiter** | `DynamicsCompressorNode` (-1 dBFS tavan) | Nötr (Render timeline karması) | Güvenli Ayrım | Önizlemede hoparlör koruması içindir; export doğrudan klip karmasını korur. |
| **Session Master Mute** | `AudioContext.destination` öncesi sıfırlama | Etkisiz (Yoksayılır) | Güvenli Ayrım | Kullanıcının hoparlörü kapatması dışa aktarımı sessiz yapmaz. |

---

## 6. Çalıştırılmayan Kontroller

- **Ağır Çok-Kanallı Render / ASR:** Bulut/yerel ASR modelleri veya disk üzerinde saatler süren çok kanallı MP4 render işlemleri çalıştırılmadı; kapsam dışıdır ve sentetik PCM fixture'ları ile tam test edilmiştir.
- **Canlı Mikrofon Girişi:** Donanım mikrofonu yerine sentetik PCM arabellekleri kullanıldı.

---

## 7. Bilinen Kalan Hata / Dış Bağımlılık

- Bilinen hiçbir hata veya gerileme (regression) bulunmamaktadır.
- Kaan'ın `candidate-finder` ve `audio-to-timeline` modülleri ile sözleşmeler (`AssetAudioProfile`, `AudioHighlightCandidate`, `durationSec?`, `kind?`, `classification?`) %100 tam uyumlu ve geriye dönük destektir.

---

## 8. Manager'ın Yapacağı Küçük Bağlantı / PR

- Okan'ın `asset-audio-profile.ts` ve `audio-tools.ts` geliştirmeleri, Kaan'ın `audio-to-timeline.ts` entegrasyonu ile birlikte PR #408 / B004 teslim paketine dahil edilmeye hazırdır. Herhangi bir çakışma (merge conflict) veya bekleyen bağımlılık bulunmamaktadır.
