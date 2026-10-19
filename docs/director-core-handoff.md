# Codex çekirdek teslimi — Creator Recipe v1

Durum: çekirdek incelemeye hazır; arayüze veya yayına bağlı değil.
Dal: `codex/creator-pipeline` — GitHub'a gönderildi.
Teslim commit: `ca19e872e95e330644b2ccdfd9b4cc7152808f98`.
Başlangıç commit: `880e081122173630e1cf5e13291ba139fc2ea9a7`.

Kaynak ve tam açıklama:

- `C:/Users/Arenb/.codex/worktrees/creator-pipeline/Videoeditor/src/creator-recipe.ts`
- Aynı yerde `src/creator-recipe.test.ts` ve `docs/creator-recipe.md`.
- https://github.com/rubarbulut/Frostcut/commit/ca19e872e95e330644b2ccdfd9b4cc7152808f98

## Manager için

Önce B002 açıklarını kapatıp raporla. Yeni çekirdeğin dört dosyalık commit'i,
main veya nested dalının tamamını birleştirmeden ayrı incelenebilir. Kirli ortak
çalışma ağacına körlemesine cherry-pick/reset yapma; mevcut işlerin korunmasını
ve aynı model sürümüyle entegrasyonu kontrol et. Bu dosyalar Codex'e aittir;
ikinci ve uyumsuz bir profil/çıktı planı modeli yazmayın.

Barış'ın sonraki profil/inceleme ekranı şu sözleşmeyi kullanacak:

```ts
// version:1, id, name, language, game, audience,
// commentary: 'unspecified' | 'spoken' | 'game-audio' | 'mixed',
// longTargetSeconds, shortTargetSeconds, shortCount,
// fillMode: 'fit' | 'crop' | 'blur-background'
const profile = parseCreatorProfile(formValue);
const recipe = createCreatorRecipe(project, mediaFiles, profile, proposals);
const current = creatorRecipeIsCurrent(recipe, project, mediaFiles);
const draft = materializeCreatorOutput(recipe, project, mediaFiles, outputId);
```

Her proposal: `{id, name, kind:'youtube-long'|'youtube-short', ranges:[{start,end}],
reason}`. Range'ler kaynak **timeline** saniyeleridir. Her klibin kendi source
start/speed dönüşümünü gerçek edit assembly yapar. Kaynağı belirtilmeyen sahte
highlight/trend sonucu üretmeyin. Gerçek analiz ve manuel seçim aynı sözleşmeyi
kullanabilir; içerik analizi bu commit'te yapılmıyor.

## Gerçekte yapılan

- Aynı kaynak snapshot'ından çok kanallı uzun/kısa gerçek taslaklar; speed,
  trim, altyazı, ses ve efekt/motion verilerinin mevcut edit yoluyla korunması.
- Orijinal editten bağımsız çıktı projeleri, geniş/dikey boyut ve fill mode.
- Edit veya gerçek File kimliği değişince eski planın reddi. Aynı dosya adı yetmez.
- Kilit/boş aralık/desteklenmeyen trailing gap ve nested kaynak için açık hata.
- Eski publishing/chapters metadata'sının yeni kesilmiş taslağa hazırmış gibi
  taşınmaması; orijinalde korunması. Üretilen projenin gerçek model doğrulaması.
- On iki test383ms ve odaklı TypeScript kontrolü geçti. Gerçek encode/model/
  tarayıcı testi, upload veya ücretli araştırma yapılmadı.

Tam depo type-check'i başarılı olarak raporlanmıyor: base880e081'de takip edilen
`virtualized-timeline.test.ts`, henüz yalnızca orijinal çalışma ağacında untracked
olan `virtualized-timeline.ts` dosyasını import ediyor. Manager bu dosya/test
birlikteliğini görev sınırında Git'e alıp ortak entegrasyonda doğrulamalı.

Profilin kalıcı saklanması ve recipe'nin yeniden yüklemede güvenli kurulması henüz
yok. Recipe sahipliği oturum içidir; JSON kopyası render/yayın izni veya geçerli
kaynak bağı oluşturmaz. Hedef süre tercih, `seconds` ise gerçek taslak süresidir.
Şu an yalnızca YouTube pilot çıktıları var; Reels/TikTok/OAuth/SEO/thumbnail ve
gerçek yayın daha sonraki görevlerdir. Bu teslim tek tuş ürününün tamamı değildir.
