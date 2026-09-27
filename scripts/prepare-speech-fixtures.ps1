$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$fixtureRoot = Join-Path $PSScriptRoot '../tests/fixtures/speech-qa'
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
$fixtureRoot = (Resolve-Path -LiteralPath $fixtureRoot).Path
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft David Desktop')
$synth.Rate = 0
$sentences = @(
  'Here is the secret to turning one long video into three short stories.',
  'You do not need a perfect camera. You need a clear idea.',
  'Um, let me start again. The best hook is the moment that makes someone curious.',
  'The best hook is the moment that makes someone curious.',
  'Keep the useful words, cut the long pauses, and let the story move.',
  'Finally, add readable captions. Watch your edit once, then share it with the world.',
  'Here is a simple mistake to avoid. Do not spend the opening ten seconds explaining what your audience already knows.',
  'Start with a useful question instead. What is the one thing someone should remember after watching this short video?',
  'For a cooking story, show the finished meal first. Then explain the small choice that made it taste better.',
  'For a travel story, choose one surprising moment. A quiet conversation can be more interesting than another wide view.',
  'A powerful short has a beginning, a middle, and an ending. Even fifteen seconds can carry a complete thought.',
  'Now listen to the pauses between sentences. A little space sounds natural, but long empty gaps can lose attention.',
  'Keep the important words together when you make a cut. Listen again so the last syllable does not disappear.',
  'Captions should help people follow the story. Give each phrase enough time, and use color to emphasize a useful word.',
  'If a name is wrong in the transcript, correct it before exporting. A small text change can make a big difference.',
  'You can try several versions without losing the original. Compare the opening of each version and choose the clearest one.',
  'The best editing habit is to watch the whole result. Check the sound, check the words, and remove anything distracting.',
  'Your final story does not need to be loud or complicated. It needs to feel clear, complete, and worth watching.'
)
function Caption-Time([double]$seconds) {
  $value = [TimeSpan]::FromMilliseconds([Math]::Round($seconds * 1000))
  return $value.ToString('hh\:mm\:ss\,fff')
}
$concat = [System.Collections.Generic.List[string]]::new()
$captions = [System.Collections.Generic.List[string]]::new()
$cursor = 0.0
& ffmpeg -v error -y -f lavfi -i 'anullsrc=r=22050:cl=mono' -t 1.2 -c:a pcm_s16le (Join-Path $fixtureRoot 'pause.wav')
for ($index = 0; $index -lt $sentences.Count; $index++) {
  $wave = Join-Path $fixtureRoot "line-$index.wav"
  $synth.SetOutputToWaveFile($wave)
  $synth.Speak($sentences[$index])
  $synth.SetOutputToNull()
  $probe = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $wave
  $seconds = [double]::Parse($probe, [System.Globalization.CultureInfo]::InvariantCulture)
  $captions.Add("$($index + 1)`n$(Caption-Time $cursor) --> $(Caption-Time ($cursor + $seconds))`n$($sentences[$index])`n")
  $concat.Add("file 'line-$index.wav'")
  $concat.Add("file 'pause.wav'")
  $cursor += $seconds + 1.2
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $fixtureRoot 'concat.txt'), ($concat -join "`n"), $utf8)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '../public/spoken-demo.srt'), ($captions -join "`n"), $utf8)
& ffmpeg -v error -y -f concat -safe 0 -i (Join-Path $fixtureRoot 'concat.txt') -ac 1 -ar 22050 (Join-Path $fixtureRoot 'golden.wav')
& ffmpeg -v error -y -stream_loop -1 -i (Join-Path $PSScriptRoot '../public/demo.mp4') -i (Join-Path $fixtureRoot 'golden.wav') -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart (Join-Path $PSScriptRoot '../public/spoken-demo.mp4')
$synth.Dispose()
[System.IO.File]::WriteAllText((Join-Path $fixtureRoot 'reference.json'), (@{ source = 'Locally synthesized original QA speech using Windows voices; no recorded person'; english = $sentences; goldenDuration = $cursor } | ConvertTo-Json), $utf8)
Write-Output "Prepared original English speech demo ($([Math]::Round($cursor, 2)) seconds)."
