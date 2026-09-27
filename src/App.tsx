import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Snowflake,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Scissors,
  Sparkles,
  Upload,
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Save,
  ChevronDown,
  Check,
  X,
  Play,
  FileVideo,
  MessageSquareText,
  WandSparkles,
  LoaderCircle,
  Cat,
  Settings2,
  Plus,
  Home,
  Keyboard,
  Flame,
} from 'lucide-react';
import { Modal, Field, Range } from './components';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import {
  useEditor,
  registerMedia,
  mediaFiles,
  mediaUrls,
  audioWaveforms,
  saveProject,
  restoreProject,
} from './store';
import {
  createProject,
  presets,
  languages,
  type Preset,
  type Project,
  type Transcript,
  type Suggestion,
  type Operation,
  addMedia,
  applyOperations,
  validateProject,
  duration,
  timecode,
  uid,
  clipEnd,
  clipDuration,
  isLocked,
  isAudioClip,
} from './model';
import { inspectMedia, extractAudio, exportMp4 } from './media';
import {
  makeDemoWords,
  suggestCuts,
  silenceFromSamples,
  mapSilences,
  promptOperations,
  type CutOptions,
} from './ai';
import { transcribe, parseSrt } from './transcription';
import Preview from './Preview';
import Timeline, { deleteSelected, splitSelected } from './Timeline';
import { MediaPanel, TranscriptPanel, PropertiesPanel } from './Panels';
import CaptionEditor from './CaptionEditor';
import TranscriptionSetup from './TranscriptionSetup';
import { resolveQuality, recommendedQuality, transcriptionModels } from './transcription-config';
import LandingPage from './LandingPage';
import { MediaImporterModal } from './importer/MediaImporterModal';
import './importer/importer.css';
import { SequencePicker } from './SequencePicker';
import { ExportDestination } from './ExportDestination';
import { createShortSequences } from './sequences';
import { EqualParts } from './EqualParts';
import { StyleMemoryCutSuggestion } from './StyleMemoryTools';
import { analyzeSource, measuredSilences } from './analyze-source';
import { speechSafeSilences } from './highlights';
import { estimatedMegabytes, videoBitrate } from './export-settings';
import { EditPreview, OperationsPreview } from './EditPreview';
import CreatorTools from './CreatorTools';
import { LongToShortsModal } from './LongToShortsModal';
type Job = {
  kind: 'transcribe' | 'analysis' | 'export';
  step: number;
  message: string;
  progress?: number;
  error?: string;
  discovery?: string;
  preview?: Project;
};
export default function App() {
  const {
    project: p,
    commit,
    load,
    undo,
    redo,
    past,
    future,
    saveStatus,
    selected,
    select,
    seek,
    setPlaying,
    playing,
    mediaChanged,
    captionSelection,
  } = useEditor(
    useShallow((s) => ({
      project: s.project,
      commit: s.commit,
      load: s.load,
      undo: s.undo,
      redo: s.redo,
      past: s.past,
      future: s.future,
      saveStatus: s.saveStatus,
      selected: s.selected,
      select: s.select,
      seek: s.seek,
      setPlaying: s.setPlaying,
      playing: s.playing,
      mediaChanged: s.mediaChanged,
      captionSelection: s.captionSelection,
    })),
  );
  const [screen, setScreen] = useState<'landing' | 'editor'>('landing'),
    [modal, setModal] = useState<
      'project' | 'auto' | 'export' | 'transcribe' | 'shortcuts' | 'magic-shorts' | null
    >(null),
    [panel, setPanel] = useState('media'),
    [importerOpen, setImporterOpen] = useState(false),
    [creatorOpen, setCreatorOpen] = useState(false),
    [creatorTab, setCreatorTab] = useState('Reframe'),
    [resume, setResume] = useState<Project>(),
    [toast, setToast] = useState(''),
    [projectName, setProjectName] = useState('My first cut'),
    [preset, setPreset] = useState<Preset>('YouTube Shorts'),
    [customW, setCustomW] = useState(1080),
    [customH, setCustomH] = useState(1920),
    [newFps, setNewFps] = useState(30),
    [job, setJob] = useState<Job | null>(null),
    [suggestionsOpen, setSuggestionsOpen] = useState(false),
    [aiOpen, setAiOpen] = useState(false),
    [prompt, setPrompt] = useState(''),
    [aiPreview, setAiPreview] = useState<{
      operations: Operation[];
      description: string;
      needsAnalysis?: boolean;
    }>(),
    [oneClick, setOneClick] = useState(false),
    [exportUrl, setExportUrl] = useState<string>(),
    [exportBlob, setExportBlob] = useState<Blob>(),
    [mobileTab, setMobileTab] = useState('Clips'),
    [drop, setDrop] = useState(false),
    [selectedSuggestion, setSelectedSuggestion] = useState<string>();
  const [selectedShorts, setSelectedShorts] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState<'highlights' | 'parts'>('highlights');
  const [opts, setOpts] = useState<CutOptions>({
    goal: 'Short-form clips',
    count: 3,
    length: 25,
    pacing: 'Fast',
    reorder: true,
    composite: false,
    sensitivity: 50,
  });
  const mediaInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    srtInput = useRef<HTMLInputElement>(null),
    relinkId = useRef<string | undefined>(undefined),
    abortRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    restoreProject().then(setResume);
  }, []);
  useEffect(() => {
    // Proposals are tied to the exact timeline they were generated against.
    setAiPreview(undefined);
    setSelectedSuggestion(undefined);
    setSelectedShorts([]);
  }, [p]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(
    () => () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    },
    [exportUrl],
  );
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') ||
        modal ||
        job ||
        document.querySelector('dialog[open]') ||
        useEditor.getState().previewClip ||
        useEditor.getState().captionSelection
      )
        return;
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
      }
      if (screen !== 'editor') return;
      if (e.code === 'Space') {
        e.preventDefault();
        const s = useEditor.getState();
        if (s.playhead >= duration(s.project)) s.seek(0);
        s.setPlaying(!s.playing);
      }
      if (cmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        splitSelected();
      }
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (cmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected(e.shiftKey);
      }
      if (e.key === 'k') setPlaying(false);
      if (e.key === 'l') setPlaying(true);
      if (e.key === 'j') {
        seek(Math.max(0, useEditor.getState().playhead - 2));
        setPlaying(false);
      }
      if (e.key === '?') {
        e.preventDefault();
        setModal('shortcuts');
      }
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [screen, modal, job, undo, redo, seek, setPlaying]);
  const notify = (e: unknown) => setToast(e instanceof Error ? e.message : String(e));
  function importClick(id?: string) {
    relinkId.current = id;
    mediaInput.current?.click();
  }
  async function importFile(file: File) {
    try {
      const asset = await inspectMedia(file),
        id = relinkId.current;
      relinkId.current = undefined;
      if (id) {
        const old = useEditor.getState().project.media.find((m) => m.id === id);
        if (!old) return;
        const currentProject = useEditor.getState().project;
        const required = Math.max(
          0,
          ...[...currentProject.clips, ...(currentProject.sequences ?? []).flatMap((s) => s.clips)]
            .filter((c) => c.mediaId === id)
            .map((c) => c.sourceEnd),
        );
        if (asset.duration + 0.1 < required)
          throw new Error(
            'This file is shorter than the media used in the timeline. Choose the original source.',
          );
        registerMedia({ ...asset, id }, file);
        commit(
          {
            ...currentProject,
            media: currentProject.media.map((m) =>
              m.id === id ? { ...asset, id, demo: m.demo } : m,
            ),
          },
          'Relink source media',
        );
        mediaChanged();
        setToast('Media relinked.');
      } else {
        registerMedia(asset, file);
        commit(addMedia(useEditor.getState().project, asset), 'Import footage');
        mediaChanged();
        setPanel('media');
        setToast('Footage imported. Ready when you are.');
      }
    } catch (e) {
      notify(e);
    }
  }
  async function demo() {
    try {
      setToast('Opening the sample project…');
      const response = await fetch('/demo.mp4');
      if (!response.ok)
        throw new Error('Sample video is unavailable. Import your own footage to start.');
      const file = new File([await response.blob()], 'A better story — sample.mp4', {
          type: 'video/mp4',
        }),
        asset = await inspectMedia(file);
      asset.demo = true;
      registerMedia(asset, file);
      let next = addMedia(createProject('A better story', 'YouTube Shorts'), asset);
      next.transcripts = [
        { mediaId: asset.id, language: 'English', source: 'demo', words: makeDemoWords() },
      ];
      load(next);
      mediaChanged();
      setScreen('editor');
      setToast(
        'Sample project · captions are illustrative, not a transcription of the sample sound.',
      );
    } catch (e) {
      notify(e);
    }
  }
  async function speechDemo() {
    try {
      setToast('Opening the spoken demo…');
      const [video, captions] = await Promise.all([
        fetch('/spoken-demo.mp4'),
        fetch('/spoken-demo.srt'),
      ]);
      if (!video.ok || !captions.ok)
        throw new Error('The spoken demo is unavailable. Import your footage to start.');
      const file = new File([await video.blob()], 'A spoken story — synthetic narration.mp4', {
        type: 'video/mp4',
      });
      const asset = await inspectMedia(file);
      registerMedia(asset, file);
      const next = addMedia(createProject('Speech demo · practice edit', 'YouTube Shorts'), asset);
      next.transcripts = [
        parseSrt(
          (await captions.text()).replace('readable captions', 'readable captains'),
          asset.id,
        ),
      ];
      next.transcripts[0].language = 'English';
      next.settings.language = 'English';
      next.captions.safeArea = true;
      load(next);
      mediaChanged();
      setScreen('editor');
      setPanel('transcript');
      setToast(
        'Synthetic narration · estimated caption times. “captains” is an intentional typo for editing practice.',
      );
    } catch (error) {
      notify(error);
    }
  }
  function newProject() {
    const next = createProject(
      projectName.trim() || 'Untitled project',
      preset,
      preset === 'Custom' ? customW : undefined,
      preset === 'Custom' ? customH : undefined,
    );
    next.settings.fps = newFps;
    next.exportSettings.fps = newFps;
    load(next);
    setScreen('editor');
    setModal(null);
  }
  async function openProject(file: File) {
    try {
      if (file.size > 20e6) throw new Error('Project file is too large.');
      const project = validateProject(JSON.parse(await file.text()));
      load(project);
      setScreen('editor');
      setToast('Project opened. Relink original footage in the Media panel.');
      setPanel('media');
    } catch (e) {
      notify(e);
    }
  }
  function jobProgress(message: string, progress?: number) {
    setJob((current) =>
      current
        ? {
            ...current,
            message,
            progress,
            step:
              current.kind === 'export'
                ? Math.max(
                    current.step,
                    /Encoding|Rendering your video/.test(message)
                      ? 2
                      : /Drawing/.test(message)
                        ? 1
                        : 0,
                  )
                : current.step,
          }
        : current,
    );
  }
  async function runAnalysis(auto: boolean, mediaId?: string) {
    if (job) return;
    if (!p.clips.length) {
      setToast('Import a video first.');
      return;
    }
    setPlaying(false);
    setModal(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({ kind: auto ? 'analysis' : 'transcribe', step: 0, message: 'Preparing your footage…' });
    let next = structuredClone(useEditor.getState().project);
    try {
      const ranges: { start: number; end: number }[] = [];
      for (const media of next.media.filter(
        (m) =>
          (!mediaId || m.id === mediaId) &&
          next.clips.some((c) => c.mediaId === m.id && (!auto || c.audioRole !== 'music')),
      )) {
        if (!mediaFiles.has(media.id)) throw new Error('Relink missing media before processing.');
        const existing = next.transcripts.find((t) => t.mediaId === media.id);
        if (media.demo && auto) {
          if (!existing)
            next.transcripts.push({
              mediaId: media.id,
              language: 'English',
              source: 'demo',
              words: makeDemoWords(),
            });
          ranges.push(
            ...mapSilences(next, media.id, [
              { start: 4.3, end: 5.3 },
              { start: 8.6, end: 9.5 },
              { start: 12.7, end: 13.4 },
              { start: 17.2, end: 18.3 },
            ]),
          );
          continue;
        }
        const needTranscript = !auto || (!existing && opts.goal !== 'Remove silences');
        setJob((j) => (j ? { ...j, step: needTranscript ? 1 : 0 } : j));
        const analyzed = await analyzeSource(
          media,
          next.settings,
          needTranscript,
          opts.sensitivity,
          controller.signal,
          (message, progress) => {
            if (abortRef.current === controller && !controller.signal.aborted)
              jobProgress(message, progress);
          },
          (partial, elapsed) => {
            const draft = partial
              ? {
                  ...next,
                  transcripts: [...next.transcripts.filter((t) => t.mediaId !== media.id), partial],
                }
              : next;
            const found = auto
              ? suggestCuts(draft, opts, ranges).filter((s) => s.type === 'highlight')
              : [];
            setJob((j) =>
              j
                ? {
                    ...j,
                    discovery: `${timecode(elapsed)} analyzed · ${partial?.words.length ?? existing?.words.length ?? 0} words${auto ? ` · ${found.length} potential clips so far` : ''}`,
                    preview:
                      j.preview ??
                      (found[0] ? applyOperations(draft, found[0].operations) : undefined),
                  }
                : j,
            );
          },
        );
        ranges.push(...mapSilences(next, media.id, analyzed.silences));
        if (analyzed.transcript) {
          next.transcripts = [
            ...next.transcripts.filter((t) => t.mediaId !== media.id),
            analyzed.transcript,
          ];
          // Keep corrections until the entire processing job succeeds.
          if (!auto)
            next.clips.filter((c) => c.mediaId === media.id).forEach((c) => delete c.captionWords);
        }
      }
      if (controller.signal.aborted || abortRef.current !== controller) return;
      if (auto) {
        setJob((j) =>
          j
            ? { ...j, step: 2, message: 'Finding strong moments and pauses…', progress: undefined }
            : j,
        );
        next.suggestions = suggestCuts(next, opts, ranges);
        setSelectedShorts([]);
        commit(next, 'Analyze footage');
        setSuggestionsOpen(true);
        if (!next.suggestions.length)
          setToast('No suggestions found. Try a different language or silence sensitivity.');
      } else {
        commit(next, 'Transcribe footage');
        setPanel('transcript');
        setMobileTab('Transcript');
        setToast('Transcript ready. Click any word to jump to that moment.');
      }
      setJob(null);
    } catch (e) {
      if (abortRef.current !== controller) return;
      if (controller.signal.aborted) {
        setJob(null);
        return;
      }
      setJob((j) => (j ? { ...j, error: e instanceof Error ? e.message : String(e) } : j));
    }
  }
  function applySuggestion(s: Suggestion) {
    if (p.clips.some((c) => isLocked(p, c)) || p.adjustments?.some((a) => a.locked)) {
      setToast('Unlock timeline tracks and adjustment layers before applying AI cuts.');
      return;
    }
    let next: Project;
    try { next = applyOperations(p, s.operations, s.reason); }
    catch (error) { setToast((error as Error).message); return; }
    next.suggestions = [];
    commit(next, `AI: ${s.title}`, true, s.sourceOptions);
    seek(0);
    setSuggestionsOpen(false);
    setToast('AI edit applied. Undo is always one click away.');
  }
  function makeShorts() {
    try {
      const next = createShortSequences(
        p,
        p.suggestions.filter((s) => selectedShorts.includes(s.id)),
      );
      commit(
        next,
        `AI: create ${selectedShorts.length} separate Shorts`,
        true,
        p.suggestions.find((s) => selectedShorts.includes(s.id))?.sourceOptions,
      );
      setPlaying(false);
      select([]);
      seek(0);
      setSuggestionsOpen(false);
      setMobileTab('Clips');
      setToast(
        'Shorts created. Switch sequences to edit and export each one. Your original edit is saved.',
      );
    } catch (e) {
      notify(e);
    }
  }
  async function doExport() {
    setPlaying(false);
    setModal(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({ kind: 'export', step: 0, message: 'Preparing your export…' });
    try {
      const blob = await exportMp4(structuredClone(p), controller.signal, (message, progress) => {
        if (abortRef.current === controller && !controller.signal.aborted)
          jobProgress(message, progress);
      });
      if (controller.signal.aborted || abortRef.current !== controller) return;
      setExportBlob(blob);
      setExportUrl(URL.createObjectURL(blob));
      setJob(null);
    } catch (e) {
      if (abortRef.current !== controller) return;
      if (controller.signal.aborted) {
        setJob(null);
        return;
      }
      setJob((j) => (j ? { ...j, error: e instanceof Error ? e.message : String(e) } : j));
    }
  }
  const measuredRanges = speechSafeSilences(
    p,
    p.media.flatMap((m) => mapSilences(p, m.id, measuredSilences(m.id, opts.sensitivity) ?? [])),
  );
  const estimatedSilence = measuredRanges.length
    ? measuredRanges
        .filter(
          (r) =>
            r.end - r.start >
            (opts.pacing === 'Natural' ? 0.55 : opts.pacing === 'Hyper' ? 0.18 : 0.3),
        )
        .reduce((n, r) => n + r.end - r.start, 0)
    : p.suggestions
        .find((s) => s.type === 'silence')
        ?.operations.reduce((n, o) => n + (o.type === 'delete-range' ? o.end - o.start : 0), 0);
  const pending = p.suggestions.filter((s) => s.status === 'pending');
  const selectedClip = p.clips.find((c) => selected.includes(c.id));
  return (
    <>
      <input
        ref={mediaInput}
        type="file"
        accept="video/*,audio/*,.mp4,.mov,.webm,.mp3,.wav,.m4a,.aac,.ogg"
        hidden
        aria-label="Import video file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,.frostcut"
        hidden
        aria-label="Open project file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openProject(f);
          e.target.value = '';
        }}
      />
      <input
        ref={srtInput}
        type="file"
        accept=".srt"
        hidden
        aria-label="Import subtitle file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          let cur = useEditor.getState().project;
          if (!cur.media.length) {
            for (let i = 0; i < 50; i++) {
              await new Promise((r) => setTimeout(r, 100));
              cur = useEditor.getState().project;
              if (cur.media.length) break;
            }
          }
          if (!cur.media.length) return;
          try {
            const selId = useEditor.getState().selected[0];
            const mediaId = selId
              ? cur.clips.find((c) => c.id === selId)?.mediaId ?? cur.media[0].id
              : cur.media[0].id;
            const t = parseSrt(await f.text(), mediaId);
            const fresh = useEditor.getState().project;
            commit(
              { ...fresh, transcripts: [...fresh.transcripts.filter((x) => x.mediaId !== mediaId), t] },
              'Import transcript',
            );
            setPanel('transcript');
          } catch (error) {
            notify(error);
          }
        }}
      />
      {screen === 'landing' ? (
        <LandingPage
          onStartEditing={() => setModal('project')}
          onOpenProject={() => projectInput.current?.click()}
          onTryDemo={() => void demo()}
          onTrySpeechDemo={() => void speechDemo()}
          onResumeProject={(res) => {
            load(res);
            setScreen('editor');
          }}
          resumeProject={resume}
          onImportFile={(file) => {
            setScreen('editor');
            void importFile(file);
          }}
        />
      ) : (
        <main
          className={`editor ${drop ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrop(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDrop(false);
            if (job) return;
            const f = e.dataTransfer.files[0];
            if (f) void importFile(f);
          }}
        >
          <header className="editor-header">
            <button
              className="brand"
              aria-label="FrostCut home"
              onClick={() => {
                setPlaying(false);
                setScreen('landing');
                setResume(p);
              }}
            >
              <Snowflake />
              frostcut
            </button>
            <span className="header-divider" />
            <input
              className="project-name"
              aria-label="Project name"
              value={p.name}
              onChange={(e) => commit({ ...p, name: e.target.value }, 'Rename project')}
            />
            <span className="save-status">
              <Check size={12} />
              {saveStatus}
            </span>
            <div className="header-actions">
              <button
                className="icon"
                aria-label="New project"
                title="New project"
                onClick={() => setModal('project')}
              >
                <Plus size={17} />
              </button>
              <button
                className="icon"
                aria-label="Open project"
                title="Open project"
                onClick={() => projectInput.current?.click()}
              >
                <FolderOpen size={17} />
              </button>
              <button
                className="icon"
                aria-label="Save project"
                title="Save project · Ctrl S"
                onClick={saveProject}
              >
                <Save size={17} />
              </button>
              <span className="divider" />
              <button
                className="icon"
                aria-label="Undo"
                title={past.at(-1)?.label ?? 'Undo'}
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button className="icon" aria-label="Redo" disabled={!future.length} onClick={redo}>
                <Redo2 size={17} />
              </button>
              <button
                className="icon"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts · ?"
                onClick={() => setModal('shortcuts')}
              >
                <Keyboard size={17} />
              </button>
              <button
                className="primary small export-top"
                disabled={!p.clips.length || !!job}
                onClick={() => setModal('export')}
              >
                <Download size={15} />
                Export <ArrowUpRight size={14} />
              </button>
            </div>
          </header>
          <SequencePicker />
          <div className="editor-workspace">
            <aside className="left-panel">
              <div className="panel-tabs">
                <button
                  className={panel === 'media' ? 'active' : ''}
                  onClick={() => setPanel('media')}
                >
                  <FileVideo size={15} />
                  Media
                </button>
                <button
                  className={panel === 'transcript' ? 'active' : ''}
                  onClick={() => setPanel('transcript')}
                >
                  <MessageSquareText size={15} />
                  Transcript
                </button>
              </div>
              {panel === 'media' ? (
                <MediaPanel
                  onImport={() => importClick()}
                  onRelink={(id) => importClick(id)}
                  onOpenImporter={() => setImporterOpen(true)}
                />
              ) : (
                <TranscriptPanel
                  onTranscribe={() => setModal('transcribe')}
                  onSrt={() => srtInput.current?.click()}
                />
              )}
            </aside>
            <div className="center-panel">
              <div className="editing-actions">
                <div>
                  <span className="sequence-dot" />
                  {p.settings.preset}
                  <span className="ratio-tag">
                    {p.settings.width > p.settings.height
                      ? '16:9'
                      : p.settings.width === p.settings.height
                        ? '1:1'
                        : '9:16'}
                  </span>
                </div>
                <div>
                  <button
                    className="text-button"
                    disabled={!!job}
                    onClick={() => {
                      setPlaying(false);
                      setCreatorTab('Reframe');
                      setCreatorOpen(true);
                    }}
                  >
                    <WandSparkles size={15} />
                    Creator tools
                  </button>
                  <button
                    className="text-button"
                    disabled={!p.clips.length || !!job}
                    onClick={() => setModal('transcribe')}
                  >
                    <MessageSquareText size={15} />
                    Transcribe
                  </button>
                  <button
                    className="auto-cut-button"
                    disabled={!p.clips.length || !!job}
                    onClick={() => setModal('auto')}
                  >
                    <Sparkles size={16} />
                    Auto Cut
                  </button>
                  <button
                    className="magic-shorts-button"
                    disabled={!p.clips.length || !!job}
                    onClick={() => setModal('magic-shorts')}
                    title="1-Click Long-Form to Shorts Studio"
                  >
                    <Flame size={15} />
                    Long to Shorts
                  </button>
                </div>
              </div>
              <Preview onImport={() => importClick()} processing={!!job} />
              {pending.length > 0 && (
                <button className="suggestion-banner" onClick={() => setSuggestionsOpen(true)}>
                  <Sparkles size={15} />
                  {pending.length} suggestions ready to review
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
            <PropertiesPanel />
          </div>
          <Timeline />
          <section className="mobile-flow">
            <div className="panel-tabs">
              {['Clips', 'Transcript', 'Style'].map((t) => (
                <button
                  className={mobileTab === t ? 'active' : ''}
                  key={t}
                  onClick={() => setMobileTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {mobileTab === 'Clips' ? (
              <div className="mobile-clips">
                <button className="text-button" onClick={() => importClick()}>
                  <Upload size={15} />
                  Add footage
                </button>
                {[...p.clips]
                  .sort((a, b) => a.start - b.start)
                  .map((c, i) => (
                    <div className="mobile-clip" key={c.id}>
                      <button
                        onClick={() => {
                          select([c.id]);
                          seek(c.start);
                        }}
                      >
                        {i + 1}. {p.media.find((m) => m.id === c.mediaId)?.name}
                        <small>{timecode(clipDuration(c))}</small>
                      </button>
                      <button
                        aria-label="Move clip earlier"
                        disabled={
                          !p.clips.some(
                            (other) => other.trackId === c.trackId && other.start < c.start,
                          ) || p.clips.some((c) => isLocked(p, c))
                        }
                        onClick={() => {
                          const prior = [...p.clips]
                            .filter((other) => other.trackId === c.trackId && other.start < c.start)
                            .sort((a, b) => a.start - b.start)
                            .at(-1);
                          if (!prior) return;
                          const next = structuredClone(p);
                          next.clips.find((x) => x.id === c.id)!.start = prior.start;
                          next.clips.find((x) => x.id === prior.id)!.start = Math.max(
                            prior.start + clipDuration(c),
                            clipEnd(c) - clipDuration(prior),
                          );
                          commit(next, 'Reorder clips');
                        }}
                      >
                        ↑
                      </button>
                    </div>
                  ))}
                {selectedClip && !isLocked(p, selectedClip) && (
                  <div className="mobile-trim">
                    <Range
                      label="Trim beginning"
                      min={0}
                      max={selectedClip.sourceEnd - 0.1}
                      step={0.1}
                      value={selectedClip.sourceStart}
                      onChange={(value) => {
                        const next = structuredClone(p);
                        next.clips.find((c) => c.id === selectedClip.id)!.sourceStart = value;
                        commit(next, 'Trim clip');
                      }}
                    />
                    <Range
                      label="Trim end"
                      min={selectedClip.sourceStart + 0.1}
                      max={p.media.find((m) => m.id === selectedClip.mediaId)!.duration}
                      step={0.1}
                      value={selectedClip.sourceEnd}
                      onChange={(value) => {
                        const next = structuredClone(p);
                        next.clips.find((c) => c.id === selectedClip.id)!.sourceEnd = value;
                        commit(next, 'Trim clip');
                      }}
                    />
                  </div>
                )}
              </div>
            ) : mobileTab === 'Transcript' ? (
              <TranscriptPanel
                onTranscribe={() => setModal('transcribe')}
                onSrt={() => srtInput.current?.click()}
              />
            ) : (
              <PropertiesPanel />
            )}
          </section>
          <button
            className={`ai-toggle ${aiOpen ? 'active' : ''}`}
            onClick={() => setAiOpen(!aiOpen)}
          >
            <Sparkles size={18} />
            <span>Ask FrostCut</span>
          </button>
          {aiOpen && (
            <section className="ai-panel">
              <div className="panel-title">
                <span>
                  <Sparkles size={15} />
                  Your editing assistant
                </span>
                <button
                  className="icon"
                  aria-label="Close AI assistant"
                  onClick={() => setAiOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <p>One good idea. A faster first cut.</p>
              <div className="prompt-chips">
                {[
                  'Make this faster',
                  'Remove silences',
                  'Add dynamic captions',
                  'Find the best hook',
                  'Make 3 Shorts',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setPrompt(chip);
                      setAiPreview(promptOperations(p, chip));
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const proposal = promptOperations(p, prompt);
                  if (oneClick && proposal.operations.length) {
                    try {
                    commit(
                      applyOperations(p, proposal.operations, proposal.description),
                      'AI edit',
                      true,
                    );
                    setAiPreview(undefined);
                    setToast('AI edit applied.');
                    } catch (error) { setToast((error as Error).message); }
                  } else setAiPreview(proposal);
                }}
              >
                <input
                  aria-label="Ask AI to edit"
                  placeholder="Ask AI to edit…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button className="icon" aria-label="Preview AI command" type="submit">
                  <ArrowUpRight size={18} />
                </button>
              </form>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={oneClick}
                  onChange={(e) => setOneClick(e.target.checked)}
                />
                One-click mode
              </label>
              <small className="subtle">
                Local command assistant · supports the actions above.
              </small>
              {aiPreview && (
                <div className="ai-proposal">
                  <b>
                    {aiPreview.operations.length
                      ? `${aiPreview.operations.length} changes will be made`
                      : 'Let’s shape this edit'}
                  </b>
                  <p>{aiPreview.description}</p>
                  {aiPreview.operations.length > 0 && (
                    <OperationsPreview project={p} operations={aiPreview.operations} />
                  )}
                  {aiPreview.operations.length > 0 ? (
                    <div className="button-row">
                      <button
                        className="primary small"
                        onClick={() => {
                          try {
                          commit(
                            applyOperations(p, aiPreview.operations, aiPreview.description),
                            'AI edit',
                            true,
                          );
                          setAiPreview(undefined);
                          } catch (error) { setToast((error as Error).message); }
                        }}
                      >
                        Apply changes
                      </button>
                      <button className="text-button" onClick={() => setAiPreview(undefined)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    aiPreview.needsAnalysis && (
                      <button
                        className="primary small"
                        onClick={() => {
                          setAiOpen(false);
                          setModal('auto');
                        }}
                      >
                        Open Auto Cut
                      </button>
                    )
                  )}
                </div>
              )}
              {past.some((h) => h.ai) && (
                <>
                  <button
                    className="text-button"
                    onClick={() => {
                      useEditor.getState().revertAI();
                      setToast(
                        'Restored the project to before the last AI edit, including later edits.',
                      );
                    }}
                  >
                    Revert last AI edit
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      useEditor.getState().revertAI(true);
                      setToast(
                        'Restored the project to before all AI edits, including later edits.',
                      );
                    }}
                  >
                    Undo all AI cuts
                  </button>
                  <small className="subtle">
                    Restores the earlier project, including manual edits made afterward.
                  </small>
                </>
              )}
            </section>
          )}
          {drop && (
            <div className="drop-overlay">
              <Upload size={42} />
              <h2>Make room for your footage.</h2>
            </div>
          )}
        </main>
      )}
      {captionSelection && (
        <CaptionEditor
          key={
            captionSelection.clipId +
            captionSelection.wordIds.join(',') +
            (captionSelection.start ?? '')
          }
        />
      )}
      {modal === 'transcribe' && (
        <TranscriptionSetup
          onClose={() => setModal(null)}
          onStart={(mediaId) => void runAnalysis(false, mediaId)}
        />
      )}
      {modal === 'project' && (
        <Modal title="A fresh start." onClose={() => setModal(null)}>
          <p className="modal-intro">Pick a home for your next story.</p>
          <Field label="Project name">
            <input autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
          <div className="project-presets">
            {presets.map((v) => (
              <button
                className={preset === v ? 'selected' : ''}
                key={v}
                onClick={() => setPreset(v)}
              >
                <div className={`aspect-icon ${v === 'YouTube' ? 'landscape' : ''}`} />
                <b>{v}</b>
                <small>
                  {v === 'YouTube'
                    ? '16:9 · 1080p'
                    : v === 'Custom'
                      ? 'Your canvas'
                      : '9:16 · 1080p'}
                </small>
                {preset === v && <Check size={15} />}
              </button>
            ))}
          </div>
          {preset === 'Custom' && (
            <div className="number-grid">
              <Field label="Width">
                <input
                  type="number"
                  min="16"
                  max="3840"
                  value={customW}
                  onChange={(e) => setCustomW(Math.max(16, Math.min(3840, +e.target.value)))}
                />
              </Field>
              <Field label="Height">
                <input
                  type="number"
                  min="16"
                  max="3840"
                  value={customH}
                  onChange={(e) => setCustomH(Math.max(16, Math.min(3840, +e.target.value)))}
                />
              </Field>
            </div>
          )}
          <Field label="Frame rate">
            <select value={newFps} onChange={(e) => setNewFps(+e.target.value)}>
              <option value="24">24 fps</option>
              <option value="30">30 fps</option>
              <option value="60">60 fps</option>
            </select>
          </Field>
          <div className="modal-footer">
            <span>
              <ShieldCheck size={14} />
              Saved on this device
            </span>
            <button className="primary" onClick={newProject}>
              Create project <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {modal === 'auto' && (
        <Modal title="Find your next great clip." onClose={() => setModal(null)} wide>
          <div className="creator-tabs" role="tablist" aria-label="Cut mode">
            <button role="tab" aria-selected={autoMode === 'highlights'} onClick={() => setAutoMode('highlights')}>AI highlights</button>
            <button role="tab" aria-selected={autoMode === 'parts'} onClick={() => setAutoMode('parts')}>Equal parts</button>
          </div>
          {autoMode === 'parts' ? <EqualParts onCreated={() => setModal(null)} /> : <>
          <p className="modal-intro">
            A first cut you can make your own. Preview every change before applying.
          </p>
          <StyleMemoryCutSuggestion options={opts} onApply={setOpts} />
          <div className="setup-grid">
            <div>
              <Field label="What do you want to create?">
                <select
                  value={opts.goal}
                  onChange={(e) => setOpts({ ...opts, goal: e.target.value })}
                >
                  {[
                    'Short-form clips',
                    'Clean full video',
                    'Highlights only',
                    'Remove silences',
                    'Custom',
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="number-grid">
                <Field label="Clip count">
                  <select
                    value={opts.count}
                    onChange={(e) => setOpts({ ...opts, count: +e.target.value })}
                  >
                    <option value="3">3 clips</option>
                    <option value="5">5 clips</option>
                    <option value="10">10 clips</option>
                    <option value="0">Auto</option>
                  </select>
                </Field>
                <Field label="Target length">
                  <select
                    value={opts.length}
                    onChange={(e) => setOpts({ ...opts, length: +e.target.value })}
                  >
                    <option value="14">Less than 15s</option>
                    <option value="25">15–30s</option>
                    <option value="45">30–60s</option>
                    <option value="75">60–90s</option>
                    <option value="0">Auto</option>
                  </select>
                </Field>
              </div>
              <Field label="Spoken language">
                <select
                  value={p.settings.language}
                  onChange={(e) =>
                    commit(
                      {
                        ...p,
                        settings: {
                          ...p.settings,
                          language: e.target.value,
                          transcriptionQuality:
                            resolveQuality(p.settings.transcriptionQuality) === 'balanced'
                              ? recommendedQuality(e.target.value)
                              : p.settings.transcriptionQuality,
                        },
                      },
                      'Language',
                    )
                  }
                >
                  {languages.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Speech quality">
                <select
                  value={resolveQuality(p.settings.transcriptionQuality)}
                  onChange={(e) =>
                    commit(
                      {
                        ...p,
                        settings: {
                          ...p.settings,
                          transcriptionQuality: resolveQuality(e.target.value),
                        },
                      },
                      'Speech quality',
                    )
                  }
                >
                  {Object.entries(transcriptionModels).map(([key, model]) => (
                    <option key={key} value={key}>
                      {model.label} · {model.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={opts.composite}
                  onChange={(e) => setOpts({ ...opts, composite: e.target.checked })}
                />
                Combine multiple moments
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={opts.reorder}
                  onChange={(e) => setOpts({ ...opts, reorder: e.target.checked })}
                />
                Allow AI to reorder clips
              </label>
            </div>
            <div className="setup-aside">
              <b>Set the pace</b>
              <div className="segmented">
                {['Natural', 'Fast', 'Hyper'].map((v) => (
                  <button
                    className={opts.pacing === v ? 'active' : ''}
                    key={v}
                    onClick={() => setOpts({ ...opts, pacing: v })}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Range
                label="Silence sensitivity"
                value={opts.sensitivity}
                onChange={(sensitivity) => setOpts({ ...opts, sensitivity })}
              />
              <p className="subtle">
                {estimatedSilence
                  ? `Estimated removed: ${timecode(estimatedSilence)}`
                  : 'Silence duration is measured when analysis runs.'}
              </p>
              <div className="property-divider" />
              <div className="analysis-note">
                <ShieldCheck size={19} />
                <div>
                  <b>Local, from start to finish.</b>
                  <p>First transcription downloads a speech model. Your media is never uploaded.</p>
                </div>
              </div>
              <small className="subtle">
                Highlights use transcript scoring. Repeated takes are suggestions for you to review.
              </small>
            </div>
          </div>
          <div className="modal-footer">
            <span>
              <Sparkles size={15} />
              Your edit. Your final say.
            </span>
            <button className="primary" onClick={() => void runAnalysis(true)}>
              Find the good parts <ArrowRight size={16} />
            </button>
          </div>
          </>}
        </Modal>
      )}
      {suggestionsOpen && (
        <Modal title="The good parts, found." onClose={() => setSuggestionsOpen(false)} wide>
          <p className="modal-intro">
            Select highlights to create separate Shorts while keeping your original edit. Or apply a
            single suggestion to the current sequence.
          </p>
          <div className="suggestion-list">
            {pending.length ? (
              pending.map((s) => (
                <article
                  className={`suggestion-card ${selectedSuggestion === s.id ? 'selected' : ''}`}
                  key={s.id}
                >
                  <div>
                    <span className={`suggestion-kind ${s.type}`}>
                      {s.type === 'repeat'
                        ? 'REVIEW REPEATED TAKE'
                        : s.type === 'silence'
                          ? 'SILENCE REMOVAL'
                          : s.type === 'edit'
                            ? 'COMPOSITE'
                            : 'HIGHLIGHT'}
                    </span>
                    <span className="subtle">
                      {timecode(s.start)} — {timecode(s.end)}
                    </span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.reason}</p>
                  {s.operations.some((o) => o.type === 'assemble') && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        aria-label={`Create Short: ${s.title}`}
                        checked={selectedShorts.includes(s.id)}
                        onChange={(e) =>
                          setSelectedShorts(
                            e.target.checked
                              ? [...selectedShorts, s.id]
                              : selectedShorts.filter((id) => id !== s.id),
                          )
                        }
                      />
                      Create a separate Short
                    </label>
                  )}
                  <div className="suggestion-bottom">
                    <small>{s.operations.length} proposed operations</small>
                    <div>
                      <button
                        className="text-button"
                        aria-label={`Dismiss suggestion: ${s.title}`}
                        onClick={() =>
                          commit(
                            {
                              ...p,
                              suggestions: p.suggestions.map((item) =>
                                item.id === s.id ? { ...item, status: 'dismissed' } : item,
                              ),
                            },
                            'Dismiss AI suggestion',
                          )
                        }
                      >
                        Dismiss
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedSuggestion(s.id);
                          setPlaying(false);
                        }}
                      >
                        <Play size={14} />
                        Preview
                      </button>
                      <button className="primary small" onClick={() => applySuggestion(s)}>
                        {s.type === 'repeat' ? 'Keep later take' : 'Apply edit'}
                      </button>
                    </div>
                  </div>
                  {selectedSuggestion === s.id && (
                    <OperationsPreview project={p} operations={s.operations} />
                  )}
                </article>
              ))
            ) : (
              <div className="empty-panel">
                <p>No suggestions left to review. Keep editing or run Auto Cut again.</p>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <span>AI changes enter your normal undo history.</span>
            {selectedShorts.length > 0 && (
              <button className="primary" onClick={makeShorts}>
                Create {selectedShorts.length} Shorts
              </button>
            )}
            <button className="text-button" onClick={() => setSuggestionsOpen(false)}>
              Keep editing
            </button>
          </div>
        </Modal>
      )}
      {creatorOpen && (
        <CreatorTools initialTab={creatorTab} onClose={() => setCreatorOpen(false)} />
      )}
      {modal === 'shortcuts' && (
        <KeyboardShortcutsModal onClose={() => setModal(null)} />
      )}
      {modal === 'magic-shorts' && (
        <LongToShortsModal onClose={() => setModal(null)} onNotify={setToast} />
      )}
      {modal === 'export' && (
        <Modal title="Ready for the world." onClose={() => setModal(null)}>
          <p className="modal-intro">A polished MP4. Rendered right here on your device.</p>
          {!!p.sequences?.length && (
            <button
              className="secondary"
              onClick={() => {
                setModal(null);
                setPlaying(false);
                setCreatorTab('Batch export');
                setCreatorOpen(true);
              }}
            >
              Batch export saved Shorts
            </button>
          )}
          <Field label="Platform">
            <select
              value={p.settings.preset}
              onChange={(e) => {
                const preset = e.target.value as Preset,
                  wide = preset === 'YouTube';
                commit(
                  {
                    ...p,
                    settings: {
                      ...p.settings,
                      preset,
                      ...(preset === 'Custom'
                        ? {}
                        : { width: wide ? 1920 : 1080, height: wide ? 1080 : 1920, fps: 30 }),
                    },
                    captions: {
                      ...p.captions,
                      safeArea: preset !== 'YouTube' && preset !== 'Custom',
                    },
                    exportSettings: {
                      ...p.exportSettings,
                      ...(preset === 'Custom'
                        ? {}
                        : { width: wide ? 1920 : 1080, height: wide ? 1080 : 1920, fps: 30 }),
                    },
                  },
                  'Export platform',
                );
              }}
            >
              {presets.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Resolution">
            <select
              value={`${p.exportSettings.width}x${p.exportSettings.height}`}
              onChange={(e) => {
                const [width, height] = e.target.value.split('x').map(Number);
                commit(
                  { ...p, exportSettings: { ...p.exportSettings, width, height } },
                  'Export resolution',
                );
              }}
            >
              {[480, 720, 1080].map((n) => {
                const portrait = p.exportSettings.height > p.exportSettings.width,
                  w = portrait ? n : Math.round((n * 16) / 9 / 2) * 2,
                  h = portrait ? Math.round((n * 16) / 9 / 2) * 2 : n;
                return (
                  <option key={n} value={`${w}x${h}`}>
                    {w} × {h} · {n === 480 ? 'Quick preview' : n === 720 ? 'Balanced' : 'Full HD'}
                  </option>
                );
              })}
              <option value={`${p.exportSettings.width}x${p.exportSettings.height}`}>
                {p.exportSettings.width} × {p.exportSettings.height} · Current
              </option>
            </select>
          </Field>
          <Range
            label="Export quality"
            value={p.exportSettings.quality}
            min={1}
            onChange={(quality) =>
              commit(
                { ...p, exportSettings: { ...p.exportSettings, quality, videoBitrate: undefined } },
                'Export quality',
              )
            }
          />
          <div className="quality-labels">
            <span>Smaller file</span>
            <span>Better quality</span>
          </div>
          <details>
            <summary>Advanced settings</summary>
            <div className="number-grid">
              <Field label="Codec">
                <select>
                  <option>H.264 / MP4</option>
                </select>
              </Field>
              <Field label="Frame rate">
                <select
                  value={p.exportSettings.fps}
                  onChange={(e) =>
                    commit(
                      { ...p, exportSettings: { ...p.exportSettings, fps: +e.target.value } },
                      'Export FPS',
                    )
                  }
                >
                  {[24, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="number-grid">
              <Field label="Video bitrate (Mbps)">
                <input
                  type="number"
                  min="0.1"
                  max="60"
                  step="0.1"
                  value={+(videoBitrate(p) / 1000000).toFixed(2)}
                  onChange={(e) => {
                    if (e.target.value !== '')
                      commit(
                        {
                          ...p,
                          exportSettings: {
                            ...p.exportSettings,
                            videoBitrate: Math.max(
                              100000,
                              Math.min(60000000, +e.target.value * 1000000),
                            ),
                          },
                        },
                        'Export bitrate',
                      );
                  }}
                />
              </Field>
              <Field label="Audio bitrate">
                <select
                  value={p.exportSettings.audioBitrate ?? 160}
                  onChange={(e) =>
                    commit(
                      {
                        ...p,
                        exportSettings: { ...p.exportSettings, audioBitrate: +e.target.value },
                      },
                      'Audio bitrate',
                    )
                  }
                >
                  {[64, 96, 128, 160, 192, 256, 320].map((n) => (
                    <option value={n} key={n}>
                      {n} kbps
                    </option>
                  ))}
                </select>
              </Field>
              {(['width', 'height'] as const).map((key) => (
                <Field key={key} label={`Export ${key}`}>
                  <input
                    type="number"
                    min="16"
                    max="3840"
                    step="2"
                    value={p.exportSettings[key]}
                    onChange={(e) => {
                      if (e.target.value !== '')
                        commit(
                          {
                            ...p,
                            exportSettings: {
                              ...p.exportSettings,
                              [key]: Math.max(
                                16,
                                Math.min(3840, Math.round(+e.target.value / 2) * 2),
                              ),
                            },
                          },
                          'Custom export dimensions',
                        );
                    }}
                  />
                </Field>
              ))}
            </div>
            <small className="subtle">
              AAC audio · captions burned in · adjust quality to return to automatic bitrate
            </small>
          </details>
          <div className="export-estimate">
            <FileVideo size={27} />
            <div>
              <b>{p.name}.mp4</b>
              <small>
                {timecode(duration(p))} · Estimated {estimatedMegabytes(p).toFixed(1)} MB
              </small>
            </div>
          </div>
          <div className="modal-footer">
            <span>Long videos may take a few minutes.</span>
            <button className="primary" onClick={() => void doExport()}>
              <Download size={16} />
              Export MP4
            </button>
          </div>
        </Modal>
      )}
      {job && (
        <Modal
          title={
            job.error
              ? 'Let’s try that again.'
              : job.kind === 'export'
                ? 'Making the final cut.'
                : 'Finding the good parts.'
          }
          onClose={() => {
            abortRef.current?.abort();
            setJob(null);
          }}
        >
          <div className="processing">
            <div className="processing-icon">
              {job.error ? <Settings2 size={35} /> : <Cat size={45} />}
            </div>
            <p>
              {job.error
                ? 'Your project is safe. You can adjust the settings and retry.'
                : job.message}
            </p>
            {job.error ? (
              <div className="job-error">{job.error}</div>
            ) : (
              <>
                <div
                  className={`progress-bar ${job.progress === undefined ? 'indeterminate' : ''}`}
                >
                  <i style={{ width: `${job.progress ?? 35}%` }} />
                </div>
                {job.progress !== undefined && <b>{Math.round(job.progress)}%</b>}
                {job.discovery && <p className="processing-discovery">{job.discovery}</p>}
                {job.preview && (
                  <details className="early-preview">
                    <summary>Preview the first clip while processing continues</summary>
                    <EditPreview project={job.preview} label="First clip preview" />
                  </details>
                )}
                <div className="processing-steps">
                  {(job.kind === 'export'
                    ? ['Preparing timeline', 'Rendering video and captions', 'Encoding H.264 MP4']
                    : [
                        'Preparing speech audio',
                        'Analyzing speech',
                        'Finding highlights and pauses',
                        'Preparing suggestions',
                      ]
                  ).map((label, i) => (
                    <div key={label}>
                      <span>{label}</span>
                      {i < job.step ? (
                        <Check size={16} />
                      ) : i === job.step ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {job.kind !== 'export' && (
              <small>Local speech processing can be slower on devices without acceleration.</small>
            )}
          </div>
          <div className="modal-footer">
            <span>Your footage stays on this device.</span>
            <button
              className="text-button"
              onClick={() => {
                abortRef.current?.abort();
                setJob(null);
              }}
            >
              {job.error ? 'Back to editor' : 'Cancel processing'}
            </button>
          </div>
        </Modal>
      )}
      {exportUrl && (
        <Modal
          title="Your story is ready."
          onClose={() => {
            setExportUrl(undefined);
            setExportBlob(undefined);
          }}
        >
          <video className="export-result" src={exportUrl} controls />
          <p className="modal-intro">
            H.264 MP4 · {((exportBlob?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
          </p>
          <ExportDestination
            blob={exportBlob}
            defaultName={p.name}
            extension="mp4"
            downloadLabel="Download MP4"
          />
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <span>{toast}</span>
          <button className="icon" aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      <MediaImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onMediaReady={(file) => void importFile(file)}
      />
    </>
  );
}
