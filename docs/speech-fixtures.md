# Speech QA material

`public/spoken-demo.mp4` contains 148 seconds of original narration synthesized locally with Windows Microsoft David Desktop. It includes hooks, pauses and a repeated sentence. `scripts/prepare-speech-fixtures.ps1` rebuilds it and its phrase-timed SRT. Word times in the supplied SRT are estimates. The **Try a spoken demo** project deliberately changes one occurrence of “captions” to “captains” for correction practice, and labels that choice. It is not presented as a model error.

`tests/fixtures/languages/manifest.json` attributes each QA clip to its source row:

- English, Portuguese, French, German, Turkish and Polish: [Google FLEURS](https://huggingface.co/datasets/google/fleurs), Conneau et al. (2022), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Spanish: [PolyAI MINDS-14](https://huggingface.co/datasets/PolyAI/minds14), Gerz et al. (2021), CC BY 4.0. FLEURS Spanish could not be retrieved through the dataset viewer because its row group exceeds the server limit.

Audio was converted to AAC and placed over the existing local typography video for editor testing. The `tr_tr-noisy` variant adds pink noise at amplitude 0.025. `scripts/prepare-language-fixtures.mjs` rebuilds these derivatives. No user media is uploaded. Models download from Hugging Face; recognition runs in the browser.

The checked-in QA reports contain one fixed clip per language and are smoke tests, not representative accuracy benchmarks. Word error rate is calculated after removing case and punctuation; references may format numbers or apostrophes differently, and the MINDS reference may omit spoken material. Always review captions before publishing.
