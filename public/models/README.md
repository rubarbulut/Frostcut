# Auto Reframe model

`blaze_face_short_range.tflite` is Google's MediaPipe BlazeFace short-range face detector, float16, downloaded from the [official model distribution](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite).

The [model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf) describes its training/evaluation and limitations. It works best for close, visible faces; distant faces, occlusion and large rotations can fail. FrostCut reports detection coverage, holds the previous crop on missing detections, and requires review before applying editable position keyframes.

MediaPipe Tasks Vision 0.10.32 is Apache-2.0 licensed. Its WASM runtime is copied from the installed npm package to `public/runtime/vision` by `npm install`. Upstream: [MediaPipe](https://github.com/google-ai-edge/mediapipe), [web task guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js).

Models are loaded only when the user requests analysis. Source frames stay on the device.

Bundled model SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.
