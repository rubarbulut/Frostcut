import { useState } from 'react';
import {
  Wand2,
  Scissors,
  Volume2,
  Captions,
  Smartphone,
  Zap,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  ArrowRight,
} from 'lucide-react';
import { useEditor } from './store';
import { isAudioClip, type Project, type Clip } from './model';
import { presetKeyframes, clampMotion, type AnimatedProperty } from './motion';

export interface SmartWorkflowGuideProps {
  onTranscribeRequest?: () => void;
  onSilenceCutRequest?: () => void;
}

export function SmartWorkflowGuide({
  onTranscribeRequest,
  onSilenceCutRequest,
}: SmartWorkflowGuideProps) {
  const { project: p, commit } = useEditor();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !p.clips.length) return null;

  // Status checks for each smart step
  const is916Format =
    (p.settings.aspectRatio === '9:16' ||
      (p.settings.width === 1080 && p.settings.height === 1920)) &&
    !!p.captions.safeArea;

  const isAudioMastered = p.clips.some(
    (c) => c.voiceEnhance || c.autoDuck || (c.properties.volume && c.properties.volume > 1.0),
  );

  const isCaptionsActive = p.captions.enabled;

  const firstClip = [...p.clips].sort((a, b) => a.start - b.start)[0];
  const hasHookAnimation =
    firstClip &&
    firstClip.properties.animation &&
    firstClip.properties.animation !== 'None';

  // Has transcript or silence cuts
  const hasTranscript = p.transcripts.length > 0;

  // 1. Format to 9:16 & Safe Area
  const handleApplyFormat = () => {
    const next = structuredClone(p);
    next.settings.aspectRatio = '9:16';
    next.settings.width = 1080;
    next.settings.height = 1920;
    next.captions.safeArea = true;
    commit(next, 'Format: 9:16 Reels/TikTok with safe margins');
  };

  // 2. Master Audio: -14 LUFS leveling, noise suppression & auto-ducking
  const handleApplyMasterAudio = () => {
    const next = structuredClone(p);
    for (const c of next.clips) {
      if (!isAudioClip(next, c) || c.audioRole === 'voice') {
        c.voiceEnhance = true;
        if (c.properties.volume < 0.85) c.properties.volume = 1.1;
      }
      if (isAudioClip(next, c) && c.audioRole === 'music') {
        c.autoDuck = true;
        c.properties.volume = Math.min(0.35, c.properties.volume || 0.3);
      }
    }
    commit(next, 'Master audio: -14 LUFS speech leveling & auto-ducking');
  };

  // 3. Captions
  const handleApplyCaptions = () => {
    const next = structuredClone(p);
    next.captions.enabled = true;
    if (next.captions.preset === 'Clean') {
      next.captions.preset = 'Bold';
    }
    commit(next, 'Enable dynamic viral captions');
    if (!hasTranscript && onTranscribeRequest) {
      onTranscribeRequest();
    }
  };

  // 4. Hook Punch-In Zoom on first 3 seconds
  const handleApplyHook = () => {
    if (!firstClip) return;
    const next = structuredClone(p);
    const target = next.clips.find((c) => c.id === firstClip.id);
    if (!target) return;

    target.properties.animation = 'Punch In';
    target.keyframes = Object.fromEntries(
      Object.entries(
        presetKeyframes(target, 'Punch In', next.settings.width, next.settings.height),
      ).map(([key, frames]) => [
        key,
        frames.map((f) => ({
          ...f,
          value: clampMotion(key as AnimatedProperty, f.value),
        })),
      ]),
    );

    commit(next, 'Apply attention-grabbing hook punch-in zoom');
  };

  // Master 1-Click Polish
  const handleApplyAll = () => {
    const next = structuredClone(p);

    // 1. 9:16 Format
    next.settings.aspectRatio = '9:16';
    next.settings.width = 1080;
    next.settings.height = 1920;
    next.captions.safeArea = true;

    // 2. Audio Leveling
    for (const c of next.clips) {
      if (!isAudioClip(next, c) || c.audioRole === 'voice') {
        c.voiceEnhance = true;
        if (c.properties.volume < 0.85) c.properties.volume = 1.1;
      }
      if (isAudioClip(next, c) && c.audioRole === 'music') {
        c.autoDuck = true;
        c.properties.volume = Math.min(0.35, c.properties.volume || 0.3);
      }
    }

    // 3. Captions
    next.captions.enabled = true;
    if (next.captions.preset === 'Clean') {
      next.captions.preset = 'Bold';
    }

    // 4. Hook Punch-In
    const primary = [...next.clips].sort((a, b) => a.start - b.start)[0];
    if (primary) {
      primary.properties.animation = 'Punch In';
      primary.keyframes = Object.fromEntries(
        Object.entries(
          presetKeyframes(primary, 'Punch In', next.settings.width, next.settings.height),
        ).map(([key, frames]) => [
          key,
          frames.map((f) => ({
            ...f,
            value: clampMotion(key as AnimatedProperty, f.value),
          })),
        ]),
      );
    }

    commit(next, 'Apply full smart edit workflow polish');

    if (!hasTranscript && onTranscribeRequest) {
      onTranscribeRequest();
    }
  };

  const completedCount = [
    is916Format,
    isAudioMastered,
    isCaptionsActive,
    hasHookAnimation,
  ].filter(Boolean).length;

  return (
    <div className={`smart-workflow-bar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="workflow-bar-header">
        <div className="workflow-title-wrap">
          <Sparkles size={14} className="workflow-wand-icon" />
          <b className="workflow-title">Akıllı Kurgu Asistanı · İlk Adım Önerileri</b>
          <span className="workflow-progress-pill">
            {completedCount}/5 Adım Hazır
          </span>
        </div>

        <div className="workflow-actions-right">
          <button
            type="button"
            className="workflow-master-btn"
            onClick={handleApplyAll}
            title="Tüm profesyonel adımları (9:16, Ses Seviyesi, Altyazı, Hook) tek tıkla uygula"
          >
            <Zap size={12} />
            <span>Tümünü Tek Tıkla Uygula</span>
          </button>

          <button
            type="button"
            className="workflow-icon-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Önerileri Göster' : 'Daralt'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          <button
            type="button"
            className="workflow-icon-btn"
            onClick={() => setDismissed(true)}
            title="Kapat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="workflow-steps-grid">
          {/* Step 1: Sessiz Yerleri Kırp */}
          <div className="workflow-step-card">
            <div className="step-card-head">
              <span className="step-icon-badge scissors">
                <Scissors size={13} />
              </span>
              <span className="step-num">1. Adım</span>
            </div>
            <b className="step-title">Sessiz Yerleri Kırp</b>
            <p className="step-desc">
              Konuşma aralarındaki duraksamaları ve boşlukları keserek videoyu akıcı ve tempolu yapar.
            </p>
            <button
              type="button"
              className="step-action-btn"
              onClick={onSilenceCutRequest}
            >
              <span>Sessizliği Kırp</span>
              <ArrowRight size={11} />
            </button>
          </div>

          {/* Step 2: Arka Plan Sesini Dengele */}
          <div className={`workflow-step-card ${isAudioMastered ? 'completed' : ''}`}>
            <div className="step-card-head">
              <span className="step-icon-badge audio">
                <Volume2 size={13} />
              </span>
              <span className="step-num">2. Adım</span>
              {isAudioMastered && <span className="step-done-badge">✓ Dengelendi</span>}
            </div>
            <b className="step-title">Arka Plan Sesini Kıs & Dengele</b>
            <p className="step-desc">
              Konuşmayı -14 LUFS standardına yükseltir, arkadaki gürültüyü ve müzik varsa otomatik kısar.
            </p>
            <button
              type="button"
              className={`step-action-btn ${isAudioMastered ? 'is-done' : ''}`}
              onClick={handleApplyMasterAudio}
            >
              {isAudioMastered ? (
                <>
                  <Check size={11} />
                  <span>Tekrar Dengele</span>
                </>
              ) : (
                <>
                  <span>Sesi Dengele</span>
                  <ArrowRight size={11} />
                </>
              )}
            </button>
          </div>

          {/* Step 3: Viral Altyazı Ekle */}
          <div className={`workflow-step-card ${isCaptionsActive ? 'completed' : ''}`}>
            <div className="step-card-head">
              <span className="step-icon-badge captions">
                <Captions size={13} />
              </span>
              <span className="step-num">3. Adım</span>
              {isCaptionsActive && <span className="step-done-badge">✓ Aktif</span>}
            </div>
            <b className="step-title">Viral Altyazı Ekle</b>
            <p className="step-desc">
              Kelimeleri otomatik transkribe edip TikTok/Reels tarzı parlayan renkli altyazılar ekler.
            </p>
            <button
              type="button"
              className={`step-action-btn ${isCaptionsActive ? 'is-done' : ''}`}
              onClick={handleApplyCaptions}
            >
              {isCaptionsActive ? (
                <>
                  <Check size={11} />
                  <span>Altyazı Stilleri</span>
                </>
              ) : (
                <>
                  <span>Altyazı Aç</span>
                  <ArrowRight size={11} />
                </>
              )}
            </button>
          </div>

          {/* Step 4: 9:16 Dikey Format */}
          <div className={`workflow-step-card ${is916Format ? 'completed' : ''}`}>
            <div className="step-card-head">
              <span className="step-icon-badge format">
                <Smartphone size={13} />
              </span>
              <span className="step-num">4. Adım</span>
              {is916Format && <span className="step-done-badge">✓ 9:16 Aktif</span>}
            </div>
            <b className="step-title">9:16 Dikey Formata Uyarla</b>
            <p className="step-desc">
              TikTok ve Reels için 1080×1920 ölçeğine ayarlar ve butonların kapamaması için güvenli alanı açar.
            </p>
            <button
              type="button"
              className={`step-action-btn ${is916Format ? 'is-done' : ''}`}
              onClick={handleApplyFormat}
            >
              {is916Format ? (
                <>
                  <Check size={11} />
                  <span>9:16 Ayarlandı</span>
                </>
              ) : (
                <>
                  <span>9:16 Uyarla</span>
                  <ArrowRight size={11} />
                </>
              )}
            </button>
          </div>

          {/* Step 5: Hook Punch-In Zoom */}
          <div className={`workflow-step-card ${hasHookAnimation ? 'completed' : ''}`}>
            <div className="step-card-head">
              <span className="step-icon-badge hook">
                <Zap size={13} />
              </span>
              <span className="step-num">5. Adım</span>
              {hasHookAnimation && <span className="step-done-badge">✓ Hook Hazır</span>}
            </div>
            <b className="step-title">Girişe Hook Punch-In Ekle</b>
            <p className="step-desc">
              İlk 3 saniyeye dikkat çeken 1.15x dinamik zoom ekleyerek izleyiciyi ilk saniyede yakalar.
            </p>
            <button
              type="button"
              className={`step-action-btn ${hasHookAnimation ? 'is-done' : ''}`}
              onClick={handleApplyHook}
            >
              {hasHookAnimation ? (
                <>
                  <Check size={11} />
                  <span>Hook Güncelle</span>
                </>
              ) : (
                <>
                  <span>Hook Ekle</span>
                  <ArrowRight size={11} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
