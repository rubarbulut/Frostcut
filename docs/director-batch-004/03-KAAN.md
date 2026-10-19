# B004-K — KAAN goal

## Goal

**Gerçek kaynak kanıtından veya açıkça etiketlenmiş manuel/eşit bölme seçiminden,
istenen sayıda ve geçerli sürelerde uzun/Shorts önerileri çıkar; hız/trim/tekrar
kullanılan kliplerde zamanları doğru eşleştir; aynı analizi tekrar yaptırma ve
kanıt yokken highlight/semantik kalite uydurma.**

Mevcut `src/social/candidate-finder.ts` başlangıçtır. Decoder çalışmalarını
koru; bu gece yeni decoder motoru veya tam video hareket analizi yazmak öncelik değil.

## K0 — Aday doğruluğu ve kanıt dürüstlüğü

1. `shortCount` için mevcut en az iki çıktı dayatmasını kaldır. Profil 0 ise sıfır,
   1 ise en fazla bir, 12 ise en fazla 12. Kaynak yetmiyorsa daha az aday + neden;
   çoğaltılmış/örtüşen sahte adaylarla sayıyı doldurma. Çok kısa kayıtları destekle.
2. `longTargetSeconds` ve Short hedef/min/max seçeneklerinin gerçekten kullanıldığını
   doğrula. Hedef bir tercih; tutturulamadığında gerçek süre ve fark görünür.
   Hedefe sığdırmak için açıklamasız olarak hikâyenin sonunu kesme. İlk güvenli
   long fallback kaynak kurguyu korur; "curated narrative/lobby removed" iddiası yok.
3. Sabit taban hareket/enerji sayıları, clip speed ve klip sınırı bir kamerada
   ölçülmüş hareket değildir. Tracking/beat/marker varsa hangi kaynaktan ve hangi
   timebase'den geldiğini doğrula; eksik sinyale veri varmış gibi skor verme.
4. `reason` yalnızca gerçekten kullanılan kanıtı anlatsın: kullanıcı işaretçisi,
   ölçülmüş audio activity, gerçek tracking, transcript sınırı veya manual/equal
   segment. Boss/victory gibi başlık sözcüğü oyundaki olayı doğrulamış sayılmaz.
   Audio peak tek başına insan tepkisi veya kaliteli Short kanıtı değildir.
5. Kanıt azsa `insufficient-evidence` sonucu ve açık seçim yöntemi sun. Otomatik
   fallback eşit bölmeyse türü/gerekçesi bunu söylemeli. İlk 60 saniye kendiliğinden
   hook veya highlight değildir. Profilde konuşmasız oyun desteğini koru.

## K1 — Kaynak zamanı → timeline

- Okan'ın asset profilleri **kaynak saniyesi** taşır. Kendi adaptöründe her klibin
  sourceStart/sourceEnd kesişimini al; `timeline = clip.start +
  (sourceTime - clip.sourceStart) / clip.properties.speed`. Aralık sonunu da aynı
  şekilde dönüştür. 0.5x/2x, tekrar kullanılan aynı asset, detached audio, muted/
  hidden track ve kaynakta bulunmayan aralıkları ele al. Okan'ın profilini mutasyonla
  timeline saniyesine çevirmek yasak; bir asset birçok klipte kullanılabilir.
- Gerçek konuşma transcript'i varsa cümle/kelime sınırlarını kaynak dönüşümüyle
  kullan. Başlangıç/sonun ortadan kelime veya payoff kestiğini kesin semantik bilgi
  olmadan tespit etmiş gibi davranma; kullanıcı incelemesi işareti bırak.
- Uygunluğu recipe çekirdeğiyle sınayarak sıfır uzunluk, NaN/Infinity, ters/boş/
  kaynak dışı ve trailing gap aralıklarını engelle. Nested kaynak mevcut çekirdekte
  desteklenmiyorsa açık hata; yeni destek varmış gibi flatten etme.
- Eşit bölme modunda bütün kullanılabilir aralıklar sıralı kaplanır; son kısa
  parça açıkça sunulur. Siyah iç boşluk korunacaksa açıklanır; sessizce hikâye
  atlaması yapılmaz. Highlight modunda örtüşme kontrolü ve tekrar aday elemesi vardır.

## K2 — Gerçek cache ve performans

- Şu anki `WeakMap<Project, Analysis>` bütün seçenekleri temsil etmiyor.
  sampleInterval, kaynak sinyal revizyonları, yöntem ve analizi etkileyen ayarları
  cache kimliğine al. Salt kısa çıktı sayısı değişince pahalı ham sinyal taraması
  yeniden yapılmasın; analiz cache'i ile aday seçim cache'ini ayır.
- Yeni `File`/relink, kaynak edit, seçenek ve sinyal değişimi doğru invalidation
  yapmalı. Aynı ad/assetId yeniden kullanımı eski sinyale düşmemeli.
- İç döngülerde her örnek için bütün klip ve tracking noktalarını yeniden taramayı
  önle: klip aralıkları için indeks/ilerleyen cursor ve tracking için uygun erişim.
  Yeni büyük dependency veya yaklaşık sonuç için kalite düşürme yok.
- Signal/iş generation destekle; iptal edilen analiz geç dönünce cache'e/güncel
  kuyruğa yazmasın. Long ve Shorts bir analiz snapshot'ını paylaşır.
- Sentetik metadata fixture'ının 20 ms sürmesi 15 dakikalık videonun 20 ms'de
  incelendiği anlamına gelmez. Raporda fixture büyüklüğü, yapılan işlem ve decode
  bulunmadığı yazılır; sert milisaniye garantisi yerine tarama sayısı/cache hit kanıtı.

## Dosyalar ve kanıt

Sende: `src/social/candidate-finder.ts`, testi, yeni `audio-to-timeline.ts` ve
kanıt/sinyal adaptörleri, kendi analiz contract ekleri. `creator-recipe.ts`,
model/store/App ve Okan'ın audio profilini değiştirme. Mevcut Preview/EditPreview/
shuttle iyileştirmelerinde ancak bu işin neden olduğu somut regresyonu düzelt;
geniş yeni performans refactor'ı yapma.

Küçük test matrisi: shortCount 0/1/2/12, hiç sinyal yok, tek aday, çok kısa klip,
long hedefi kısa/uzun, iki farklı cache option seti, aynı assetId farklı dosya,
0.5x/2x trim, aynı asset iki klipte, gap/overlap, muted/hidden/detached audio,
abort sonrası sonuç ve gerçek `createCreatorRecipe` + materialize ile uyum.
Gerçek uzun medya decode/benchmark yok.

**Bitti:** Manager aynı girdiyle gerçek proposals + açık kanıt/missing-signal
durumu alabilir; Barış düzgün etiketler; en az iki aday zorlaması yok; kısa test
kanıtları ve tam API imzaları `docs/director-reports/batch-004/kaan.md` içinde.
