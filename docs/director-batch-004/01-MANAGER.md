# B004-M — MANAGER goal

## Goal

**Mevcut ekip modüllerini ve Codex UI teslimini kaybetmeden birleştir; kayıt →
profil → kanıtlı adaylar → recipe incelemesi → bağımsız düzenlenebilir çıktılar →
gerçek export kuyruğu → hesap durumunu doğru gösteren YouTube yayın hazırlığı
akışını uygulamada erişilebilir, geri alınabilir ve iptal edilebilir hâle getir.**

Bu bir koordinasyon + uygulama görevidir. Başka kişilere yalnızca rapor yazdırıp
sonunda yeniden Director'dan mimari istemek kabul edilmez. Ortak kaynakların ve
uygulamanın son bağlantısının sahibi sensin.

## M0 — Çalışmaları güvenceye al ve tabanı ilan et

1. `git status`, dal/HEAD, değiştirilmiş ve untracked dosyaları envanterle.
   B002/B003 raporlarını güncel kaynakla karşılaştır. Başlıkta 62, tabloda 80 gibi
   tutarsız test toplamlarını kanıt sayma. Okan'ın en son teslimini koru.
2. Kişisel başlangıç raporlarıyla atomik değişikliklerin tamamlandığını teyit et.
   Bir kişinin aktif patch'ini ortadan keserek snapshot/branch geçişi yapma.
   Yeni UI, baykuş, ses ve recipe dosyaları için sahipliği kaydet.
3. `codex/creator-pipeline` dalını oku. Ortak klasörde zaten bulunan aynı
   değişiklikleri yeniden uygulama; mevcut yeni App/landing eklerini koruyarak
   uzlaştır. Eski nested-sequences dalını topluca merge etme.
4. Tamamlanan işleri açık dosya listeleriyle checkpoint commit'lerine al; sırları,
   kişisel başvuru bilgilerini, `.git` içeriğini, node_modules ve medya fixture'larını
   yanlışlıkla ekleme. Geliştirme dalına push edilebilir.
5. `BASELINE.md`: tam SHA, tarih, dal, kişi başına gerçek çalışma yolu, dosya
   sahipliği, kısa başlangıç testi, bilinen başlangıç hataları. Kişi dallarını
   örneğin `codex/b004-demir`, `codex/b004-kaan`, `codex/b004-okan`,
   `codex/b004-baris` olarak aynı SHA'dan ayır. Bağımlılıkları her kopyaya kurma;
   mevcut kurulumu güvenli biçimde yeniden kullan.

M0 beklerken ortak sözleşmeleri hazırlayabilirsin. Bütün kişileri belirsiz bir
"Manager bekleniyor" durumunda saatlerce bırakma; kaynaktaki somut engeli ve
bağımsız başlanabilecek parçayı kişi raporuna yaz.

## M1 — Tek kontrolcü ve doğru kaynak sahipliği

- Yeni `src/social/creator-pipeline.ts` gibi küçük, test edilebilir bir kontrolcü
  yaz; ikinci recipe motoru yazma. Var olan çekirdeğe ve kişi adaptörlerine bağla.
- Tek `runId`/generation + `AbortController` kullan. Çift tık ikinci iş başlatmasın.
  İptalden/yeniden başlatmadan sonra geç dönen analiz, export veya progress güncel
  işi değiştirmesin. İptal, pause veya modal kapatma bir başarılı render sayılmaz.
- Kaynak proje snapshot'ı ile düzenlenen çıktı birbirinden ayrı olsun. Mevcut
  `store.load(materialized)` kullanılınca kaynak registry/URL temizliğinin ne
  yaptığını incele: kullanıcı kaynak videoya geri dönebilmeli; diğer Short'un
  dosyaları kaybolmamalı. Mevcut sequence modelini kullan veya açık session sahibi
  ile File referanslarını tut. Yükleme sonrası kaynağı sessizce kaybetmek kabul edilmez.
- Kaynak/profil/range değişimi planı geçersizleştirsin. Output'u seçmek veya modal
  açmak kaynak analizi baştan çalıştırmasın. Dosya relink kimliğini `File` üzerinden
  kontrol et; aynı isim ve assetId aynı dosya demek değildir.
- Session recipe'sini JSON serialize edip yeniden açınca geçerli kabul etme.
  Kalıcı olan profil ve proje/output metadata'sıdır. Kaynaklar yeniden bağlandıktan
  sonra recipe yeniden kurulabilir; kaynak yokken hazır/renderable etiketi verilmez.

## M2 — App'e gerçek bağlantı

1. `App.tsx` içinde tek anlaşılır ana işlem: kaydı ekle → profil/çıktı tercihleri
   → planı hazırla → aday incelemesi. Barış'ın bileşenlerini gerçek callback'lerle
   mount et. Kullanıcı varsayılan olarak YouTube uzun formatta kalır.
2. Kaan'ın gerçek adaylarını kullan; sinyal yoksa elle aralık veya açık etiketli
   eşit parçalara bölme sun. UI'nın ilk 60 saniyeyi highlight diye uydurmasına izin verme.
3. `materializeCreatorOutput` çıktıları gerçek editörde açılmalı. Kaynağa geri
   dönüş, iki çıktı arasında geçiş ve metadata izolasyonu çalışmalı. Tek undo
   istenen kullanıcı işlemini geri almalı; açılış/inceleme undo üretmemeli.
4. `BatchExport`/export yolunu yeniden kullan. Aynı anda **bir** encode. Kuyruk
   seçili çıktıları, gerçek sürelerini, eksik kaynakları ve hatayı gösterir.
   İptal edilen kuyruktan sahte tamamlandı veya yarım ZIP indirmesi çıkmaz.
5. Render artefaktı kendi output revision/ayarlarıyla eşleşir. Metadata değişince
   gereksiz encode tekrarı yapılmaz; görüntü/ses/range değişince eski video upload
   edilemez. Yeniden encode etmeden güvenli metadata düzeltme yolu tanımla.
6. Demir'in capability/hesap adaptörünü bağla. Vercel'de yerel helper/OAuth backend
   yoksa bunu açıkça göster; çalışan tarayıcı düzenleme/export yolunu bozma.

## M3 — Birleştirme ve teslim

- Her kişinin P0 commit'ini kendi sırayla birleştir; P1 yüzünden bitmiş pilotu
  bekletme. Her merge'de tüm büyük suite'i tekrar başlatma. Yeni hata varsa ilgili
  küçük testi çalıştır; en sonda tek bütünleşik type-check ve hedefli test grubu.
- `07-ACCEPTANCE.md` matrisi gerçek olaylar üzerinden doğrulansın. En az bir küçük
  UI akışını Playwright/uygun browser aracıyla çalıştır; sadece SSR ve store testiyle
  "uçtan uca çalışıyor" deme. Ağır medya testi sabah koşulacak komut olarak kalabilir.
- Yeni UI erişim adları ve test seçicileri uyumlu olsun. Mevcut TestSprite/Quality
  kontrolleri korunur. Son draft PR HEAD'i için mevcut bulut CI kullanılabilir;
  TestSprite entegrasyonu varsa bir son koşu, sürekli tekrar yok. Eski yeşil PR
  sonucu yeni kodun kanıtı olarak kullanılmaz. Kota yoksa dürüstçe raporla.
- Main protection, zorunlu TestSprite kontrolü ve Vercel ayarlarına müdahale etme.
  Draft PR oluşturduysan URL'yi rapora yaz; main merge/deploy kullanıcı uyurken yok.

## Dosya alanın

`App.tsx`, `store.ts`, `model.ts`, `sequences.ts`, `creator-recipe.ts` uyumluluk
düzeltmeleri, `CreatorTools.tsx`, `BatchExport.tsx`, `batch-plan.ts`, `vite.config.ts`,
ortak sözleşme dosyası, yeni pipeline kontrolcüsü, entegrasyon testleri ve CI.
Diğer sahibin modülüne ihtiyaç varsa arayüz isteği yaz; iki kişi aynı dosyayı yazmasın.

**Bitti ölçütü:** erişilebilir pilot, kaynak/çıktı izolasyonu, iptal ve stale
koruması, korunmuş B002 düzeltmeleri, tam SHA'lı yeşil/engelli kanıt, temiz teslim
dalı ve `docs/director-reports/batch-004/manager.md`. Kullanıcıdan gereken gerçek
Google kurulumu/son yayın eylemi tek kısa sabah listesinde; diğer kod işleri bitmiş.
