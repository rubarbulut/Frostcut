import { useState } from 'react';
import {
  Sparkles,
  Zap,
  Flame,
  Mic,
  GraduationCap,
  Gamepad2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useEditor } from './store';
import { type Project, type CaptionPreset } from './model';
import { suggestCuts, type CutOptions } from './ai';
import { createShortSequences, switchSequence } from './sequences';
import { CAPTION_PALETTES } from './CaptionAppearance';
import { captionAppearance } from './caption-style';

export type LongToShortsPresetId = 'hormozi' | 'aesthetic' | 'podcast' | 'gaming';

interface MagicPreset {
  id: LongToShortsPresetId;
  title: string;
  badge: string;
  icon: typeof Flame;
  targetLength: number; // 25 = 15-30s, 45 = 30-60s
  pacing: string;
  paletteId: string;
  captionPreset: CaptionPreset;
  description: string;
  highlights: string[];
}

const PRESETS: MagicPreset[] = [
  {
    id: 'hormozi',
    title: 'Hormozi / Viral TikTok',
    badge: 'MAX RETENTION',
    icon: Flame,
    targetLength: 25,
    pacing: 'Hyper',
    paletteId: 'tiktok-viral',
    captionPreset: 'Bold',
    description: 'High-energy punchy clips with explosive pop subtitles, zero dead pauses, and instant hook delivery.',
    highlights: ['9:16 Portrait Reframe', 'TikTok Pop Captions', 'Hyper Pacing', '15–30s Fast Cuts'],
  },
  {
    id: 'aesthetic',
    title: 'Aesthetic Educator',
    badge: 'HIGH VALUE',
    icon: GraduationCap,
    targetLength: 45,
    pacing: 'Natural',
    paletteId: 'frost-glacier',
    captionPreset: 'Clean',
    description: 'Cinematic, thoughtful narrative segments with elegant typography and natural conversational rhythm.',
    highlights: ['9:16 Portrait Canvas', 'Clean Minimalist Type', 'Natural Pacing', '30–60s Deep Thought'],
  },
  {
    id: 'podcast',
    title: 'Podcast Clean Dialogue',
    badge: 'BALANCED AUDIO',
    icon: Mic,
    targetLength: 45,
    pacing: 'Natural',
    paletteId: 'amber-podcast',
    captionPreset: 'Bold',
    description: 'Speaker clarity, audio leveling, and focused topic discussions extracted from longer conversations.',
    highlights: ['Speaker Focused', 'Typewriter Subtitles', '-14 LUFS Audio Leveling', '30–60s Story Arc'],
  },
  {
    id: 'gaming',
    title: 'Gaming & Reaction Dynamic',
    badge: 'INTENSE ACTION',
    icon: Gamepad2,
    targetLength: 25,
    pacing: 'Hyper',
    paletteId: 'neon-cyber',
    captionPreset: 'Brainrot',
    description: 'Rapid reaction moments, intense emotion peaks, and fast-paced visual storytelling.',
    highlights: ['Bounce Animation', 'Color Glow', 'Hyper Pacing', '15–30s Hook Clips'],
  },
];

export function LongToShortsModal({
  onClose,
  onNotify,
}: {
  onClose: () => void;
  onNotify: (msg: string) => void;
}) {
  const p = useEditor((s) => s.project);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const seek = useEditor((s) => s.seek);

  const [selectedPresetId, setSelectedPresetId] = useState<LongToShortsPresetId>('hormozi');
  const [clipCount, setClipCount] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);

  const activePreset = PRESETS.find((pr) => pr.id === selectedPresetId) ?? PRESETS[0];

  async function handleGenerateShorts() {
    if (!p.clips.length) {
      onNotify('Add footage to the timeline before generating Shorts.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Build CutOptions from selected Magic Preset
      const cutOpts: CutOptions = {
        goal: 'Short-form clips',
        count: clipCount,
        length: activePreset.targetLength,
        pacing: activePreset.pacing,
        reorder: false,
        composite: false,
        sensitivity: activePreset.pacing === 'Hyper' ? 70 : 45,
      };

      // 2. Discover best highlight moments
      const suggestions = suggestCuts(p, cutOpts).filter((s) => s.type === 'highlight');

      if (!suggestions.length) {
        onNotify('No suitable highlights found. Try another preset or transcribe footage first.');
        setIsProcessing(false);
        return;
      }

      const chosenSuggestions = suggestions.slice(0, clipCount);

      // 3. Apply palette styling to project captions
      const pal = CAPTION_PALETTES.find((item) => item.id === activePreset.paletteId);
      let nextProject = structuredClone(p);

      if (pal) {
        nextProject.captions.preset = activePreset.captionPreset;
        nextProject.captions.appearance = {
          ...captionAppearance(nextProject.captions),
          color: pal.color,
          accent: pal.accent,
          outlineColor: pal.outlineColor,
          outline: pal.outline,
          boxColor: pal.boxColor,
          boxOpacity: pal.boxOpacity,
          animation: pal.animation,
        };
      }

      // 4. Create independent portrait Shorts sequences
      nextProject = createShortSequences(nextProject, chosenSuggestions);

      // Switch to the first newly created short sequence
      const createdSeqId = nextProject.sequences?.at(-1)?.id;
      if (createdSeqId) {
        nextProject = switchSequence(nextProject, createdSeqId);
      }

      commit(nextProject, `Generate ${chosenSuggestions.length} Shorts (${activePreset.title})`, true);
      select([]);
      seek(0);
      onClose();
      onNotify(`🎉 Created ${chosenSuggestions.length} viral Shorts with "${activePreset.title}" styling!`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window wide long-to-shorts-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <Sparkles className="text-amber-400" size={20} />
            <h2>Long-Form to Shorts Studio</h2>
          </div>
          <button className="icon tiny modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="modal-intro">
          Transform your long horizontal video into ready-to-publish vertical Shorts in one click. Pick a viral style recipe below:
        </p>

        {/* 4 Visual Magic Preset Cards */}
        <div className="magic-presets-grid" role="radiogroup" aria-label="Shorts style presets">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = preset.id === selectedPresetId;
            return (
              <div
                key={preset.id}
                className={`magic-preset-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedPresetId(preset.id)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedPresetId(preset.id);
                  }
                }}
              >
                <div className="preset-card-top">
                  <div className="preset-badge">{preset.badge}</div>
                  {isSelected && <CheckCircle2 className="preset-check" size={17} />}
                </div>

                <div className="preset-icon-row">
                  <div className={`preset-icon-box ${preset.id}`}>
                    <Icon size={22} />
                  </div>
                  <h3>{preset.title}</h3>
                </div>

                <p className="preset-desc">{preset.description}</p>

                <div className="preset-features-list">
                  {preset.highlights.map((h, i) => (
                    <span key={i} className="preset-feature-pill">
                      ✓ {h}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Clip Count Selector */}
        <div className="long-to-shorts-options">
          <div className="options-row">
            <span className="options-label">How many Shorts to create:</span>
            <div className="count-selector-group">
              {[3, 5, 8, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`count-pill ${clipCount === num ? 'active' : ''}`}
                  onClick={() => setClipCount(num)}
                >
                  {num} Shorts
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <span className="subtle">
            <Zap size={14} />
            Original video stays preserved in its own sequence.
          </span>
          <div className="footer-actions">
            <button type="button" className="text-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary generate-shorts-btn"
              disabled={isProcessing}
              onClick={handleGenerateShorts}
            >
              {isProcessing ? 'Analyzing & Cutting…' : (
                <>
                  Generate {clipCount} Shorts <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
