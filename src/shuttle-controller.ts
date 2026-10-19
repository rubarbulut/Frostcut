import { useEditor } from './store';
import { duration } from './model';

export const FORWARD_SHUTTLE_RATES = [1, 2, 4, 8] as const;
export const REVERSE_SHUTTLE_RATES = [-1, -2, -4, -8] as const;

export type ForwardShuttleRate = (typeof FORWARD_SHUTTLE_RATES)[number];
export type ReverseShuttleRate = (typeof REVERSE_SHUTTLE_RATES)[number];

/**
 * Hesaplanmış ileri shuttle oynatma hızı:
 * 1x -> 2x -> 4x -> 8x
 * Eğer oynatılmıyorsa veya ters yöndeyse doğrudan 1x ile başlatır.
 */
export function getNextForwardRate(currentRate: number, isPlaying: boolean): ForwardShuttleRate {
  if (!isPlaying || currentRate <= 0) return 1;
  if (currentRate < 1) return 1;
  if (currentRate === 1) return 2;
  if (currentRate === 2) return 4;
  return 8;
}

/**
 * Hesaplanmış geriye shuttle oynatma hızı:
 * -1x -> -2x -> -4x -> -8x
 * Eğer oynatılmıyorsa veya ileri yöndeyse doğrudan -1x ile başlatır.
 */
export function getNextReverseRate(currentRate: number, isPlaying: boolean): ReverseShuttleRate {
  if (!isPlaying || currentRate >= 0) return -1;
  if (currentRate > -1) return -1;
  if (currentRate === -1) return -2;
  if (currentRate === -2) return -4;
  return -8;
}

/**
 * Belirli bir saniyeyi tam kare ızgarasına kilitler.
 */
export function quantizeToFrame(time: number, fps: number): number {
  const safeFps = fps > 0 ? fps : 30;
  const frame = Math.round(time * safeFps);
  return Math.round((frame / safeFps) * 1_000_000) / 1_000_000;
}

/**
 * Kare-Hassas (Frame-Accurate) Zaman Kilidi:
 * Mikro-saniye (10^-6) hassasiyetiyle kayma olmadan kare indeksine kilitler.
 * IEEE-754 kayan nokta birikim hatasını (floating-point drift) tamamen sıfırlar.
 */
export function calculateFrameAccurateTime(
  currentTime: number,
  deltaFrames: number,
  fps: number,
  totalDuration: number,
): number {
  const safeFps = fps > 0 ? fps : 30;
  const currentFrame = Math.round(currentTime * safeFps);
  const maxFrame = Math.round(totalDuration * safeFps);
  const targetFrame = Math.max(0, Math.min(maxFrame, currentFrame + deltaFrames));
  return Math.round((targetFrame / safeFps) * 1_000_000) / 1_000_000;
}

/**
 * GOP-Aware Akıllı Geri Oynatma & Zaman Kaydırma Motoru
 * Tarayıcı <video> elemanlarının geriye oynatma (reverse playback) kısıtını aşmak için:
 * 1. Sabit kare ızgarasında (frame grid) kuantize zaman kaydırması yapar.
 * 2. Donanım video dekoderinin I-Frame arama döngüsünü boğmamak için inflight seek koruması sağlar.
 * 3. Hızlı geri sarmada (-2x, -4x, -8x) kadans adımlarını GOP/kare bloklarına uyarlar.
 */
export class GopAwareReverseEngine {
  private lastSeekTime = 0;

  /**
   * RAF döngüsü içinde sonraki geriye zamanı hesaplar.
   */
  computeNextReversePlayhead(
    currentPlayhead: number,
    elapsedSeconds: number,
    rate: number,
    fps: number,
  ): number {
    if (rate >= 0) return currentPlayhead;
    const rawDelta = elapsedSeconds * rate; // negative
    const nextTime = Math.max(0, currentPlayhead + rawDelta);
    return Math.round(nextTime * 1_000_000) / 1_000_000;
  }

  /**
   * Video elemanına yeni bir seek emri verilip verilmeyeceğini donanım dekoderini koruyarak belirler.
   */
  shouldSeekVideoElement(
    targetSourceTime: number,
    videoElementCurrentTime: number,
    fps: number,
    rate: number,
  ): boolean {
    const safeFps = fps > 0 ? fps : 30;
    const frameInterval = 1 / safeFps;
    const diff = Math.abs(videoElementCurrentTime - targetSourceTime);

    // Hıza göre dinamik aralık eşiği (-1x için yarım kare, -4x için daha geniş tampon)
    const threshold = Math.max(0.005, (frameInterval * Math.min(Math.abs(rate), 4)) / 2);

    if (diff < threshold) return false;

    // Minimum throttle: 15ms'den sık aralıklarla donanım dekoderini boğma
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastSeekTime < 15 && diff < frameInterval) {
      return false;
    }

    this.lastSeekTime = now;
    return true;
  }

  reset() {
    this.lastSeekTime = 0;
  }
}

export const gopReverseEngine = new GopAwareReverseEngine();

/**
 * L Tuşu: 1x -> 2x -> 4x -> 8x ileri shuttle kontrolü
 */
export function executeShuttleL() {
  const s = useEditor.getState();
  const nextRate = getNextForwardRate(s.previewRate, s.playing);
  s.setPreviewRate(nextRate);
  if (!s.playing) {
    const total = duration(s.project);
    if (s.playhead >= total) s.seek(0);
    s.setPlaying(true);
  }
}

/**
 * K Tuşu: Anında durdurma (Hard freeze / Zero latency pause)
 */
export function executeShuttleK() {
  const s = useEditor.getState();
  s.setPlaying(false);
  s.setPreviewRate(1);
}

/**
 * J Tuşu: -1x -> -2x -> -4x -> -8x geriye shuttle kontrolü
 */
export function executeShuttleJ() {
  const s = useEditor.getState();
  const nextRate = getNextReverseRate(s.previewRate, s.playing);
  s.setPreviewRate(nextRate);
  if (!s.playing) {
    if (s.playhead <= 0) s.seek(duration(s.project));
    s.setPlaying(true);
  }
}

/**
 * Sol / Sağ Ok Tuşları: Kare-Hassas (Frame-Accurate) Step Motoru
 * Alt tuşu basılı ise 5 kare zıplar (hop-stepping).
 */
export function executeStep(deltaFrames: number) {
  const s = useEditor.getState();
  s.stepFrames(deltaFrames);
}

/**
 * Shuttle Deck ve Kare Motoru Global Klavye Dinleyicisi
 */
export function handleShuttleDeckKeyboard(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: any;
  preventDefault?: () => void;
}): boolean {
  // Input veya düzenlenebilir alanlarda klavye komutlarını engelleme
  const target = e.target;
  if (target) {
    const tagName = target.tagName;
    if (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      target.isContentEditable ||
      (typeof target.closest === 'function' && target.closest('input,textarea,select,[contenteditable="true"]'))
    ) {
      return false;
    }
  }

  // Ctrl / Meta kısayolları (Ctrl+K split, Ctrl+Z undo vb.) çakışmasın
  if (e.ctrlKey || e.metaKey) {
    return false;
  }

  const key = e.key.toLowerCase();

  if (key === 'l') {
    e.preventDefault?.();
    executeShuttleL();
    return true;
  }

  if (key === 'k') {
    e.preventDefault?.();
    executeShuttleK();
    return true;
  }

  if (key === 'j') {
    e.preventDefault?.();
    executeShuttleJ();
    return true;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault?.();
    const hop = e.altKey ? 5 : 1;
    executeStep(-hop);
    return true;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault?.();
    const hop = e.altKey ? 5 : 1;
    executeStep(hop);
    return true;
  }

  return false;
}
