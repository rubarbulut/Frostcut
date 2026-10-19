import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  SlidersHorizontal,
  Captions,
  Wand2,
  Volume2,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useEditor } from '../store';
import { isLocked, isAudioClip, type Clip } from '../model';
import { AEClipHeader } from './AEClipHeader';
import { AETransformControls } from './AETransformControls';
import { AETimeControls } from './AETimeControls';
import { AEAudioControls } from './AEAudioControls';
import { AEEffectsControls } from './AEEffectsControls';
import { AECompositionInspector } from './AECompositionInspector';
import { AECaptionsInspector } from './AECaptionsInspector';
import { AELumetriInspector } from './AELumetriInspector';

export type AEInspectorTab = 'controls' | 'captions' | 'color' | 'audio';

export function AEInspector() {
  const adjustmentSelection = useEditor((s) => s.adjustmentSelection);
  const { project: p, selected } = useEditor(
    useShallow((s) => ({
      project: s.project,
      selected: s.selected,
    })),
  );

  const clip = p.clips.find((c) => selected.includes(c.id));
  const locked = clip ? isLocked(p, clip) : false;
  const isAudio = clip ? isAudioClip(p, clip) : false;

  const [tab, setTab] = useState<AEInspectorTab>('controls');

  // Auto-switch to Color if user selects an adjustment layer
  useEffect(() => {
    if (adjustmentSelection) {
      setTab('color');
    }
  }, [adjustmentSelection]);

  // When a clip is newly selected, if user was on color and deselected layer, move to controls
  useEffect(() => {
    if (clip && !adjustmentSelection && tab === 'color') {
      // Keep on color if adjustments exist, else switch to controls
      if (!p.adjustments?.length) {
        setTab('controls');
      }
    }
  }, [clip?.id]);

  return (
    <aside className="properties-panel ae-inspector-panel">
      {/* Workspace Panel Tab Bar */}
      <div className="ae-panel-tabs">
        <button
          type="button"
          className={`ae-tab-btn ${tab === 'controls' ? 'active' : ''}`}
          onClick={() => setTab('controls')}
          title="Clip Effect Controls & Transform Inspector"
        >
          <SlidersHorizontal size={13} />
          <span>{clip ? 'Effect Controls' : 'Composition'}</span>
          {clip && <span className="ae-tab-dot" />}
        </button>

        <button
          type="button"
          className={`ae-tab-btn ${tab === 'captions' ? 'active' : ''}`}
          onClick={() => setTab('captions')}
          title="Essential Graphics & Subtitles"
        >
          <Captions size={13} />
          <span>Captions</span>
          {p.captions.enabled && <span className="ae-tab-dot active" />}
        </button>

        <button
          type="button"
          className={`ae-tab-btn ${tab === 'color' ? 'active' : ''}`}
          onClick={() => setTab('color')}
          title="Lumetri Color & Cinematic Grading"
        >
          <Wand2 size={13} />
          <span>Lumetri</span>
          {(p.adjustments?.length || 0) > 0 && <span className="ae-tab-dot active" />}
        </button>

        <button
          type="button"
          className={`ae-tab-btn ${tab === 'audio' ? 'active' : ''}`}
          onClick={() => setTab('audio')}
          title="Audio Track Mixer & Levels"
        >
          <Volume2 size={13} />
          <span>Audio</span>
        </button>
      </div>

      {/* Main Tab Content Area */}
      <div className="ae-inspector-content">
        {tab === 'controls' ? (
          clip ? (
            <div className="ae-clip-controls-view">
              <AEClipHeader project={p} clip={clip} locked={locked} />

              <fieldset disabled={locked} className="ae-fieldset">
                {!isAudio && <AETransformControls key={`transform-${clip.id}`} clip={clip} />}
                <AETimeControls key={`time-${clip.id}`} clip={clip} />
                <AEAudioControls key={`audio-${clip.id}`} clip={clip} />
                {!isAudio && <AEEffectsControls key={`effects-${clip.id}`} clip={clip} />}
              </fieldset>
            </div>
          ) : (
            <AECompositionInspector project={p} />
          )
        ) : tab === 'captions' ? (
          <AECaptionsInspector />
        ) : tab === 'color' ? (
          <AELumetriInspector />
        ) : (
          <div className="ae-audio-tab-view">
            {clip ? (
              <>
                <AEClipHeader project={p} clip={clip} locked={locked} />
                <fieldset disabled={locked} className="ae-fieldset">
                  <AEAudioControls clip={clip} />
                </fieldset>
              </>
            ) : (
              <div className="ae-audio-empty-guide">
                <div className="ae-guide-card">
                  <Volume2 size={24} className="guide-icon" />
                  <b>Audio Mixer & Soundstage</b>
                  <p>
                    Select any video or audio clip on the timeline to calibrate its volume,
                    fades, auto-ducking, or run beat detection.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
