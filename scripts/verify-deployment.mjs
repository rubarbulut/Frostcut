const base = process.env.DEPLOYMENT_URL, sourceCommit = process.env.SOURCE_SHA;
if (!base || !sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit))
  throw new Error('Deployment URL and a real source commit are required');
const target = new URL(base);
if (target.protocol !== 'https:' || !target.hostname.endsWith('.vercel.app'))
  throw new Error('Unexpected deployment origin');
let verified = false;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const response = await fetch(new URL(`_deployment.json?run=${process.env.GITHUB_RUN_ID}`, target), { signal: AbortSignal.timeout(10000) });
    if (response.ok && (await response.json()).sourceCommit === sourceCommit) { verified = true; break; }
  } catch { /* Wait for deployment propagation, never report another revision as passed. */ }
  await new Promise((done) => setTimeout(done, 5000));
}
if (!verified) throw new Error('Published source revision did not become reachable');
for (const asset of ['', 'demo.mp4', 'spoken-demo.srt', 'fonts/NotoSans.ttf',
  'runtime/ffmpeg-core.js', 'runtime/ffmpeg-core.wasm', 'models/blaze_face_short_range.tflite']) {
  const response = await fetch(new URL(asset, target), { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Published asset is unavailable: ${asset} (${response.status})`);
  const type = response.headers.get('content-type') ?? '';
  if (asset && type.includes('text/html')) throw new Error(`An HTML fallback replaced an asset: ${asset}`);
  if (!asset && (response.headers.get('cross-origin-opener-policy') !== 'same-origin' ||
    response.headers.get('cross-origin-embedder-policy') !== 'credentialless'))
    throw new Error('The deployed document is missing the required isolation headers');
}
console.log(`Verified public deployment and assets for ${sourceCommit} at ${base}`);
