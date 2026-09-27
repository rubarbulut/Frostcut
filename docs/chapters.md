# Transcript chapters

Open **Creator tools → Chapters** with footage on the timeline.

- **Add chapter** creates the first marker at zero. Later markers use a free
  playhead position or the midpoint of the largest gap. Edit the time and title.
- **Transcript structure** proposes boundaries from wording changes and pauses;
  it is a non-model option with no download. It does not pretend to be AI inference.
- **Semantic topics · local AI** downloads a multilingual text embedding model on
  demand and computes embeddings locally in a dedicated worker. The model is not
  loaded by opening the panel. Cancel or closing the panel terminates the worker.
- Maximum chapter count is a limit, not a promise to invent extra sections. The
  minimum duration limits spacing. Boundaries follow changes in the original
  edited transcript, including cuts, hidden tracks, caption corrections and speed.
- Titles are short extracts from representative transcript groups, not generated
  claims. Review titles and boundaries. Inspect the transcript excerpt/reason.

**Save chapters** applies the list to the current sequence as an undoable edit.
Jump controls become available for the saved list. Each sequence keeps its own
chapters; equal parts/Shorts do not inherit stale absolute chapter positions.
Project save/open preserves the lists. Changes in content or timing flag the list
for review; style-only edits do not. Review every time, then explicitly confirm
the list against the current edit and save it again.

## Outputs and publishing

Saved, current chapters can be exported as JSON or chapter WebVTT. WebVTT escapes
title markup and ends each chapter at the next chapter or the sequence end. These
are sidecar files; this delivery does not embed chapter metadata inside an MP4.

YouTube text uses whole-second timestamps. It requires a first timestamp of 00:00,
at least three chapters and at least 10 seconds per chapter, including the last,
as specified by [YouTube's chapter documentation](https://support.google.com/youtube/answer/9884579?hl=en).
These format checks do not guarantee channel eligibility for the feature.

In **Publish**, append saved chapters to the description. Appending again replaces
the attached block instead of duplicating it. If chapter text/times or the timeline
change, saving/copying/downloading that metadata is blocked until the chapter list
is reviewed and appended again. Text you entered manually is not automatically
interpreted as chapter metadata. **Keep description as manual text** explicitly
removes automatic tracking and preserves the editable description.

## Model and bounded processing

Uses [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2),
revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`, quantized `q8`, WASM with
one CPU thread. The listed quantized ONNX file is about
[118 MB](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/tree/2c4055b12046f11709e9df2c122e59ffbdc2f900/onnx),
plus tokenizer/runtime files; browser caching applies. No transcript or video is
sent for inference. No GPU is required and no media frames are decoded.

The [upstream model](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
is Apache-2.0 licensed and produces 384-dimensional multilingual sentence
embeddings. It was trained with a 128-token sequence limit. Oversized groups are
split at word/code-point boundaries and all parts contribute to a weighted vector;
text tails are not silently truncated. This is an engineering aggregation choice,
not an upstream guarantee of chapter quality.

Analysis accepts at most 3,000 transcript groups and stores at most 100 chapters.
Adjacent group windows are compared by cosine distance (AI) or keyword overlap
(structure); brief pauses alone do not force new chapters. There is no LLM title
generation, video-scene analysis or translation in this feature.

## Evidence and outstanding checks

- Ten chapter/lifecycle unit tests passed in 590 ms. They verify controlled
  embedding boundaries, non-model behavior, cuts/speed mapping, full-character
  splitting, invalidation, per-sequence persistence, schema rejection, exports,
  metadata updates and worker cancellation/errors.
- Existing sequence/equal-parts/creator regression tests also passed in the focused
  23-test run (926 ms). Mocked worker/vector tests verify orchestration/algorithms;
  **they do not verify the actual ONNX model or real chapter quality**.
- Real inference, model download/cache behavior, cancellation during actual load,
  browser UI/navigation/downloads, mobile layout and final production build are
  pending under the user's gaming constraint. The model has not been downloaded
  or run by the agent in this delivery.

Later review: use a real multi-topic Turkish transcript; compare suggested starts
and extracted titles against the source; review/correct/save; download and inspect
TXT/VTT/JSON; change a cut and confirm stale export is blocked; refresh/append
chapters in publishing; save/reopen and switch sequences. Verify cancel releases
the actual worker and cached subsequent runs stay local.
