# B004-O — OKAN goal

## Goal

**Mevcut tek AudioContext/bus davranışını koruyarak kaynak dosya kimliğine bağlı,
ayar değişiminde doğru yenilenen, aynı analizi paylaşan, bellek/iptal sınırları
olan bir ses profili sağlayıcısını gerçek analiz hattına bağla; ölçülmemiş insan
tepkisi/LUFS iddialarını kaldır ve preview–export ses farklarını açıkça yönet.**

Önce devam eden B002/B003 atomik işini bitirip başlangıç raporuna yaz. Önceki
audio graph düzeltmelerini geri alma. Mevcut `audio/asset-audio-profile.ts`
başlangıçtır; ikinci FFT/cache sistemi kurma.

## O0 — Cache kimliği, uçuşta işler ve bellek

1. `AudioAnalysisCache` şu an yalnızca assetId ile profil/inFlight paylaşıyor.
   Aynı id ile relink edilen başka gerçek File ve değişen sampleRate/hop/threshold/
   algoritma sürümü ayrı kimlik olsun. Eski profil yeni dosyaya uygulanmasın.
   Runtime File kimliği ile kalıcı doğrulanmamış fingerprint'i ayır.
2. Aynı File + aynı ayarı eşzamanlı isteyen Long ve Shorts tek provider/decode/
   analiz işini paylaşsın. Bir tüketicinin iptali diğerinin ihtiyacını yanlışlıkla
   kesmesin; bütün tüketiciler bitince gerçek iş durabilsin. Üretim çağrılarını
   sayan testle göster; sadece Map'e değer koymak kanıt değil.
3. `clear/delete/relink` uçuşta iş sürerken gerçekleşirse eski Promise daha sonra
   cache'i tekrar dolduramasın. `finally` yeni nesil aynı anahtarın inFlight kaydını
   silmesin. Rejection sonrasında tekrar deneme mümkün olsun. Maksimum öğe sayısı
   yanında gerçek typed-array byte bütçesi ve eviction politikası olsun.
4. Uzun kaydın tamamının çoklu PCM kopyasını tutma. Mevcut extraction/worker yolunu
   kullan veya parça akışı adaptörü ekle; iptal/süre/üst bellek sınırı koy. Gerçek
   kaynak çözümleyici henüz bağlı değilse sağlayıcı arayüzü ve küçük fixture ile
   tamamla; bunu "gerçek video analizi bitti" diye raporlama.

## O1 — Ölçüm doğruluğu ve anlam sınırı

- sampleRate/hop/pencere seçenekleri finite/pozitif ve sınırlı; boş, çok kısa,
  tamamen sessiz, clipped, NaN örnekli ve son kısmi frame verileri açık davranışa sahip.
- Stereo ters faz örneği ortalama downmix ile yalancı sessizlik üretmesin.
  Analiz için enerji/tepe hesabı ile gerçek playback downmix'ini ayır; kaynağın
  sesini değiştirme. Dönüşümler ve dönen interval'ler kaynak süresini aşmasın.
- RMS/FFT/spectral band/ZCR skorları kalibre edilmiş insan konuşması olasılığı
  değildir. `laughter`, `cheer`, `human reaction` gibi kesin etiketler için gerçek
  sınıflandırıcı kanıtı yoksa `audio-activity`/`speech-like heuristic` olarak açık
  belirt; mevcut tüketicileri uyumlu adaptörle taşı. Sayısal skor confidence yüzdesi
  diye UI'ya verilmez. Konuşmasız oyunda sessiz bölüm mutlaka gereksiz değildir.
- Profil immutable kaynak-zamanlıdır. Kaan timeline dönüşümünü kendi adaptöründe
  yapar; speed/trim'e göre kaynak profilini yeniden hesaplatma. Eksik ses dosyası
  veya video silent track'i için unavailable/no-audio, uydurma sıfır profil değil.

## O2 — Gerçek bağlantı ve preview/export paritesi

- Mevcut `analyze-source`/audio extraction yolunun uygun yerine profil provider'ını
  bağla; aynı kaydın waveform, silence ve aday işlerinin kopya decode yaptırdığı
  yerleri sayarak azalt. ASR veya model başlatma; mevcut transcript varsa kullan.
- B002 graph garantileri: tek MediaElementSource, tek destination, rol değişimi,
  master mute, neutral bypass, pause/unmount sonrası timer/RAF temizliği korunur.
- Preview-only bus EQ/ducking/limiter ayarları export'a yansımıyorsa varsayılan
  export onları varmış gibi kabul edemez. Önce somut farkı envanterle; mevcut
  serialize edilebilir clip DSP yolu ile paylaşılabilen hesap/parametreyi bağla.
  Model değişikliği gerekiyorsa şemasını Manager'a ver, iki kişi model yazmasın.
- Bu gece tüm DSP parity tamamlanamıyorsa ilgili ayarı yayın/export preflight'ında
  görünür uyarı veya desteklenmeyen seçenek olarak işaretle; sessiz kalite kaybı ve
  "tam ses eşliği" iddiası yok. Oynatma için session master mute'un render'a yanlış
  kalıcı etki yapmaması gerekir; izleme tercihi ile kurgu ayarını ayır.

## Dosya sahipliği ve kanıt

Sende: `src/audio/asset-audio-profile.ts`, ilgili test, yeni profil worker/provider,
`audio-bus.ts`, `preview-audio.ts`, `preview-audio-output.ts`, `audio-dsp.ts`,
`audio-analysis.ts`, AudioTools ve gerekirse `media.ts` ses yolu. `media.ts` gibi
ortak dosyayı değiştireceksen Manager'a önceden hangi bölüm olduğunu raporla;
Demir bu dosyayı yazmayacak. App/store/model ve candidate-finder sahibi başkası.

Küçük sentetik PCM ve fake provider ile cache eşzamanlılık, seçenek değişimi,
relink, clear sırasında biten eski iş, rejection retry, byte eviction, abort,
stereo karşı faz, frame tail ve finite veri testleri. Mevcut audio graph kısa
testlerini koru. Saf nötr/volume/fade matematiği için küçük PCM karşılaştırması
yeterli; uzun MP4 export veya ASR testi yok.

**Bitti:** gerçek provider bağlantısı ya da sınırı açık adaptör; Kaan'a sabit public
imzalar; doğru cache/iptal kanıtı; hangi preview ayarının export'a taşındığı listesi;
`docs/director-reports/batch-004/okan.md` içinde commit ve test sonuçları.
