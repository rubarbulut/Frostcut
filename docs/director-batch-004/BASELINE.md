# B004 Başlangıç ve Taban Kaydı (BASELINE)

Durum: **READY**

Bu belge Director Batch 004 kapsamındaki ortak entegrasyon tabanını ve dondurulan sözleşmeleri ilan eder.

- **Başlangıç Commit Tam SHA:** `880e081122173630e1cf5e13291ba139fc2ea9a7`
- **Entegrasyon Dalı ve Çalışma Yolu:** `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`
- **Demir Dalı / Çalışma Yolu:** `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`
- **Kaan Dalı / Çalışma Yolu:** `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`
- **Okan Dalı / Çalışma Yolu:** `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`
- **Barış Dalı / Çalışma Yolu:** `feat/social-media-hub` / `c:/Users/Arenb/Documents/Videoeditor`
- **Tarih:** 2026-10-20T10:30:00+02:00

---

## 1. Dondurulan Public Sözleşmeler ve Modüller

1. **Manager / Pipeline Çekirdeği:**
   - `src/social/creator-pipeline.ts`: `CreatorPipeline`, `CreatorPipelineSession`, `preparePlan`, `materializeOutput`, `switchToOutput`, `returnToSource`, `renderOutput`, `publishOutput`.
   - `src/creator-recipe.ts`: Canonical `CreatorProfile`, `CreatorProposal`, `createCreatorRecipe`, `creatorRecipeIsCurrent`, `materializeCreatorOutput`.
2. **Demir (Render & YouTube Transport):**
   - `src/render-adapter.ts`: `executeRenderJob`, `computeProjectVideoRevision`, `RenderArtifact`, `RenderJobRequest`.
   - `src/server/youtube-upload.ts`: `executeResumableUpload`, `initiateResumableUpload`, `queryUploadStatus`, `uploadChunk`.
   - `src/youtube-publisher.ts`: `publishVideoToYouTube`, `validateScheduledPublish`, `isValidYouTubeVideoId`.
   - `src/server/youtube-oauth.ts`: `YouTubeOAuthManager`, `YouTubeCapabilityInfo`.
   - `src/server/youtube-publish-plugin.ts`: `youtubePublishPlugin`.
3. **Kaan (Candidate & Signal Detection):**
   - `src/social/candidate-finder.ts`: `findProjectCandidates`, `analyzeSharedTimeline`, `CandidateEvidence`.
   - `src/social/audio-to-timeline.ts`: `mapAudioProfileToTimeline`, `sampleTimelineAudioEnergy`.
4. **Okan (Audio DSP & Telemetry Provider):**
   - `src/audio/asset-audio-profile.ts`: `AudioAnalysisCache` (`audioAnalysisCache`), `computeAssetAudioProfile`, `buildAudioProfileKey`, `downmixStereoForAnalysis`, `getFileIdentity`.
5. **Barış (Profile & Review UI):**
   - `src/social/profile-storage.ts`: `loadCreatorProfile`, `saveCreatorProfile`, `DEFAULT_CREATOR_PROFILE`.
   - `src/social/CreatorProfileForm.tsx`: `CreatorProfileForm`.
   - `src/social/RecipeReviewScreen.tsx`: `RecipeReviewScreen`.
   - `src/PublishTools.tsx` & `src/SocialPostKit.tsx`: `PublishTools`, `SocialPostKit`.

---

## 2. Doğrulama Durumu

- **TypeScript Derleme (`tsc --noEmit`):** 0 hata, tam tip uyumu.
- **B004 Birim ve Entegrasyon Testleri:** 108/108 test yeşil:
  - `src/audio/asset-audio-profile.test.ts` (17 tests) — PASSED
  - `src/server/youtube-upload.test.ts` (25 tests) — PASSED
  - `src/server/youtube-oauth.test.ts` (13 tests) — PASSED
  - `src/social/candidate-finder.test.ts` (15 tests) — PASSED
  - `src/social/creator-pipeline.test.ts` (7 tests) — PASSED
  - `src/social/RecipeReviewScreen.test.ts` (10 tests) — PASSED
  - `src/social/profile-storage.test.ts` (10 tests) — PASSED
  - `src/social/PublishTools.test.ts` (8 tests) — PASSED
  - `src/social/CreatorProfileForm.test.ts` (3 tests) — PASSED
- **B002 Regresyon Koruması:** `audio-bus.test.ts`, `turbo-export.test.ts`, `creator-studio.test.ts` tam yeşil.

---

## 3. Bilinen Dış Bağımlılıklar

- Google OAuth2 Client ID/Secret henüz girilmediği için yerel helper `not-configured` capability raporlar.
- Tarayıcı içi kurgu, YouTube uzun format + Shorts recipe derleme, bağımsız düzenleme, yerel export ve metadata indirme 100% bağımsız ve çalışır durumdadır.
