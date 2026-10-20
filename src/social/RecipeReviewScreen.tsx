import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Film,
  Smartphone,
  Check,
  AlertCircle,
  Download,
  ArrowRight,
  Activity,
  Layers,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useEditor, mediaFiles as globalMediaFiles } from '../store';
import {
  duration,
  clipEnd,
  timecode,
  type AspectFillMode,
  type Project,
} from '../model';
import {
  parseCreatorProfile,
  createCreatorRecipe,
  materializeCreatorOutput,
  creatorRecipeIsCurrent,
  type CreatorProfile,
  type CreatorProposal,
  type CreatorOutput,
} from '../creator-recipe';
import {
  DEFAULT_CREATOR_PROFILE,
} from './profile-storage';
import type { CandidateEvidence } from './candidate-finder';
import './recipe-review.css';

export { DEFAULT_CREATOR_PROFILE };

export interface RecipeReviewScreenProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
  sourceFiles?: ReadonlyMap<string, File>;
  mediaRevision?: number;
  profile?: CreatorProfile;
  proposals?: readonly CreatorProposal[];
  evidence?: ReadonlyMap<string, CandidateEvidence>;
  onApplyProject?: (project: Project, output: CreatorOutput) => Promise<void> | void;
  onExportDraft?: (project: Project, output: CreatorOutput) => Promise<void> | void;
  isProcessing?: boolean;
  triggerElement?: HTMLElement | null;
}

/**
 * Builds canonical default proposals from project timeline boundaries.
 * Explicitly marks fallback partitioning as "equal-parts", never claiming
 * unverified AI highlight or hook detection.
 */
export function buildDefaultProposals(
  project: Project,
  profile: CreatorProfile,
): CreatorProposal[] {
  const total = duration(project);
  if (!project.clips.length || total <= 0) return [];

  // Find latest valid clip boundary
  const maxClipEnd = Math.max(...project.clips.map((c) => clipEnd(c)));
  const safeTotal = Math.min(total, maxClipEnd);

  const proposals: CreatorProposal[] = [
    {
      id: 'long-main',
      name: `${project.name || 'Video'} - Long Cut`,
      kind: 'youtube-long',
      ranges: [{ start: 0, end: safeTotal }],
      reason: 'Tam zaman çizelgesi kesiti (16:9 yatay video)',
    },
  ];

  if (profile.shortCount > 0) {
    const shortEnd = Math.min(safeTotal, profile.shortTargetSeconds);
    const clipAtShort = project.clips.find((c) => c.start < shortEnd && clipEnd(c) >= shortEnd);
    const validShortEnd = clipAtShort ? shortEnd : safeTotal;

    proposals.push({
      id: 'short-1',
      name: `${project.name || 'Video'} - Short 1`,
      kind: 'youtube-short',
      ranges: [{ start: 0, end: validShortEnd }],
      reason: `Eşit parçalı bölümleme (equal-parts: 0.0s - ${validShortEnd.toFixed(1)}s). Sinyal analizi henüz yapılmadı.`,
    });

    if (profile.shortCount >= 2 && safeTotal > profile.shortTargetSeconds + 5) {
      const secondStart = profile.shortTargetSeconds;
      const secondEnd = Math.min(safeTotal, secondStart + profile.shortTargetSeconds);
      const clipAtSecond = project.clips.find((c) => c.start < secondEnd && clipEnd(c) >= secondEnd);
      if (clipAtSecond && secondEnd > secondStart) {
        proposals.push({
          id: 'short-2',
          name: `${project.name || 'Video'} - Short 2`,
          kind: 'youtube-short',
          ranges: [{ start: secondStart, end: secondEnd }],
          reason: `Eşit parçalı bölümleme (equal-parts: ${secondStart.toFixed(1)}s - ${secondEnd.toFixed(1)}s). Sinyal analizi henüz yapılmadı.`,
        });
      }
    }
  }

  return proposals;
}

export function RecipeReviewScreen({
  isOpen,
  onClose,
  project: propProject,
  sourceFiles: propSourceFiles,
  mediaRevision = 0,
  profile: propProfile,
  proposals: propProposals,
  evidence: propEvidence,
  onApplyProject,
  onExportDraft,
  isProcessing: propIsProcessing = false,
  triggerElement,
}: RecipeReviewScreenProps) {
  // Safe store fallback: only read store without triggering mutation
  const storeProject = useEditor((s) => s.project);
  const currentProject = propProject ?? storeProject;
  const currentFiles = propSourceFiles ?? globalMediaFiles;

  const currentProfile = useMemo(() => {
    try {
      return parseCreatorProfile(propProfile ?? DEFAULT_CREATOR_PROFILE);
    } catch {
      return DEFAULT_CREATOR_PROFILE;
    }
  }, [propProfile]);

  const [fillMode, setFillMode] = useState<AspectFillMode>(currentProfile.fillMode);
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionRunning, setIsActionRunning] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Synchronize fill mode if profile prop changes
  useEffect(() => {
    setFillMode(currentProfile.fillMode);
  }, [currentProfile.fillMode]);

  // Focus management: capture previous active element, focus modal, restore on unmount
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = (triggerElement ?? document.activeElement) as HTMLElement | null;

    // Small delay to ensure modal DOM is mounted
    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      }
    }, 10);

    return () => {
      clearTimeout(focusTimer);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, triggerElement]);

  // Escape key listener & focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isActionRunning && !propIsProcessing) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      // Accessible Focus Trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableNodes = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusableNodes.length === 0) return;

        const firstNode = focusableNodes[0];
        const lastNode = focusableNodes[focusableNodes.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstNode) {
            e.preventDefault();
            lastNode.focus();
          }
        } else {
          if (document.activeElement === lastNode) {
            e.preventDefault();
            firstNode.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isActionRunning, propIsProcessing]);

  // Compile recipe cleanly using Codex's contract and mediaRevision sensitivity
  const { recipe, compileError } = useMemo(() => {
    if (!isOpen) return { recipe: null, compileError: null };
    try {
      const activeProfile: CreatorProfile = {
        ...currentProfile,
        fillMode,
      };

      const activeProposals =
        propProposals && propProposals.length > 0
          ? propProposals
          : buildDefaultProposals(currentProject, activeProfile);

      const compiled = createCreatorRecipe(
        currentProject,
        currentFiles,
        activeProfile,
        activeProposals,
      );
      return { recipe: compiled, compileError: null };
    } catch (err) {
      return { recipe: null, compileError: (err as Error).message };
    }
  }, [
    isOpen,
    currentProject,
    currentFiles,
    mediaRevision,
    currentProfile,
    fillMode,
    propProposals,
  ]);

  // Maintain valid selectedOutputId
  useEffect(() => {
    if (recipe && recipe.outputs.length > 0) {
      if (!selectedOutputId || !recipe.outputs.some((o) => o.id === selectedOutputId)) {
        setSelectedOutputId(recipe.outputs[0].id);
      }
    }
  }, [recipe, selectedOutputId]);

  if (!isOpen) return null;

  // Check staleness of recipe against current files and project
  const isRecipeCurrent = recipe ? creatorRecipeIsCurrent(recipe, currentProject, currentFiles) : false;
  const isBusy = isActionRunning || propIsProcessing;
  const effectiveError = actionError || compileError;

  const selectedOutput = recipe?.outputs.find((o) => o.id === selectedOutputId);

  const handleApply = async () => {
    if (!recipe || !selectedOutput || isBusy) return;
    setActionError(null);

    let materialized: Project;
    try {
      materialized = materializeCreatorOutput(
        recipe,
        currentProject,
        currentFiles,
        selectedOutput.id,
      );
    } catch (err) {
      setActionError(`Çıktı hazırlanamadı: ${(err as Error).message}`);
      return;
    }

    if (onApplyProject) {
      setIsActionRunning(true);
      try {
        await onApplyProject(materialized, selectedOutput);
        onClose();
      } catch (err) {
        setActionError(`Uygulama hatası: ${(err as Error).message}`);
      } finally {
        setIsActionRunning(false);
      }
    } else {
      // Safe fallback: never silently overwrite without callback
      setActionError('Uygulama callback tanımlı değil (onApplyProject eksik).');
    }
  };

  const handleExport = async () => {
    if (!recipe || !selectedOutput || isBusy) return;
    if (!onExportDraft) return;

    setActionError(null);

    let materialized: Project;
    try {
      materialized = materializeCreatorOutput(
        recipe,
        currentProject,
        currentFiles,
        selectedOutput.id,
      );
    } catch (err) {
      setActionError(`Dışa aktarma çıktısı hazırlanamadı: ${(err as Error).message}`);
      return;
    }

    setIsActionRunning(true);
    try {
      await onExportDraft(materialized, selectedOutput);
      onClose();
    } catch (err) {
      setActionError(`Dışa aktarma hatası: ${(err as Error).message}`);
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <div
      className="recipe-review-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-review-title"
      onClick={(e) => {
        if (!isBusy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="recipe-review-modal" ref={modalRef}>
        <div className="recipe-review-header">
          <h2 id="recipe-review-title">
            <Film size={18} /> Creator Recipe İnceleme Ekranı
          </h2>
          <button
            className="recipe-review-close-btn"
            aria-label="Close review screen"
            title="Kapat (Escape)"
            disabled={isBusy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="recipe-review-content">
          {/* Profile & Channel Context */}
          <div className="recipe-profile-bar">
            <span className="recipe-profile-label">Kanal Profili:</span>
            <span className="recipe-badge primary">{currentProfile.name}</span>
            <span className="recipe-badge">{currentProfile.language.toUpperCase()}</span>
            <span className="recipe-badge">{currentProfile.game}</span>
            <span className="recipe-badge">Yorum: {currentProfile.commentary}</span>
            <span className="recipe-badge">Hedef: {currentProfile.audience}</span>
          </div>

          {/* Aspect Fill Mode Selector */}
          <div className="recipe-fillmode-row">
            <label htmlFor="fill-mode-select" className="recipe-fillmode-label">
              Dikey / Yatay Kadraj Doldurma Modu (Fill Mode):
            </label>
            <select
              id="fill-mode-select"
              className="recipe-fillmode-select"
              disabled={isBusy}
              value={fillMode}
              onChange={(e) => setFillMode(e.target.value as AspectFillMode)}
            >
              <option value="blur-background">Blur Background (Bulanık Kenarlık)</option>
              <option value="fit">Fit (Sığdır / Letterbox)</option>
              <option value="crop">Crop (Kırp / Doldur)</option>
            </select>
          </div>

          {/* Stale Recipe Alert */}
          {recipe && !isRecipeCurrent && (
            <div className="recipe-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>
                Kaynak medya dosyaları veya zaman çizelgesi değişti. Çıktıların geçerli
                olabilmesi için kaynak dosyaların bağlı kalması gerekir.
              </span>
            </div>
          )}

          {/* Error Banner */}
          {effectiveError && (
            <div className="recipe-error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{effectiveError}</span>
            </div>
          )}

          {/* Recipe Outputs Grid (Long & Short) */}
          {recipe && (
            <div className="recipe-outputs-grid" role="radiogroup" aria-label="Outputs">
              {recipe.outputs.map((out) => {
                const isSelected = out.id === selectedOutputId;
                const isLong = out.kind === 'youtube-long';
                const evidenceItem = propEvidence?.get(out.id);
                const method = evidenceItem?.method ?? (out.reason.includes('equal-parts') ? 'equal-parts' : 'manual');

                return (
                  <div
                    key={out.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    className={`recipe-output-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => !isBusy && setSelectedOutputId(out.id)}
                    onKeyDown={(e) => {
                      if (!isBusy && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setSelectedOutputId(out.id);
                      }
                    }}
                  >
                    <div className="recipe-output-head">
                      <span className={`recipe-kind-badge ${isLong ? 'long' : 'short'}`}>
                        {isLong ? <Film size={12} /> : <Smartphone size={12} />}
                        {isLong ? '16:9 Long' : '9:16 Short'}
                      </span>
                      {isSelected && <Check size={16} color="#38bdf8" />}
                    </div>

                    <h3 className="recipe-output-title">{out.name}</h3>

                    <div className="recipe-output-meta">
                      <span className="recipe-output-duration">
                        Gerçek Süre: {out.seconds.toFixed(1)}s ({timecode(out.seconds, true)})
                      </span>
                      <span>Hedef Süre: {out.targetSeconds}s</span>
                      <span>
                        Kaynak Aralıkları:{' '}
                        {out.ranges
                          .map((r) => `${r.start.toFixed(1)}s - ${r.end.toFixed(1)}s`)
                          .join(', ')}
                      </span>
                    </div>

                    {/* Method & Evidence Details */}
                    <div className="recipe-evidence-section">
                      <div className="recipe-evidence-method">
                        <span className={`evidence-method-tag ${method}`}>
                          {method === 'signals' && <Sparkles size={11} />}
                          {method === 'equal-parts' && <Layers size={11} />}
                          {method === 'manual' && <Activity size={11} />}
                          Yöntem: {method}
                        </span>
                        {evidenceItem && evidenceItem.signalsUsed.length > 0 && (
                          <span className="evidence-signals-tag">
                            Sinyaller: {evidenceItem.signalsUsed.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="recipe-output-reason">
                        {evidenceItem?.explanation || out.reason}
                      </p>
                      {evidenceItem && evidenceItem.unavailableSignals.length > 0 && (
                        <small className="evidence-missing-signals">
                          Eksik analiz: {evidenceItem.unavailableSignals.join(', ')}
                        </small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="recipe-review-footer">
          <button
            type="button"
            className="recipe-btn secondary"
            disabled={isBusy}
            onClick={onClose}
          >
            İptal
          </button>
          {onExportDraft && (
            <button
              type="button"
              className="recipe-btn secondary"
              disabled={!recipe || !selectedOutput || isBusy || !isRecipeCurrent}
              onClick={handleExport}
            >
              {isBusy ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Dışa Aktar
            </button>
          )}
          <button
            type="button"
            className="recipe-btn primary"
            disabled={!recipe || !selectedOutput || isBusy || !isRecipeCurrent}
            onClick={handleApply}
          >
            {isBusy ? (
              <>
                <Loader2 size={14} className="spin" /> İşleniyor...
              </>
            ) : (
              <>
                <Check size={14} /> Onayla ve Projeye Yükle <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
