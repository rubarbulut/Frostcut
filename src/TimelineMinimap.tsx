import { useRef, useEffect, useCallback } from 'react';
import { useEditor } from './store';
import { duration, clipEnd, isAudioClip, type Project } from './model';

export function TimelineMinimap({
  scrollRef,
  zoom,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
}) {
  const p = useEditor((s) => s.project);
  const playhead = useEditor((s) => s.playhead);
  const seek = useEditor((s) => s.seek);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const total = duration(p);

  // Redraw minimap on canvas
  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || total <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#0f141a';
    ctx.fillRect(0, 0, width, height);

    // Track divider lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw clips
    for (const c of p.clips) {
      const isAudio = isAudioClip(p, c);
      const startX = (c.start / total) * width;
      const endX = (clipEnd(c) / total) * width;
      const clipW = Math.max(2, endX - startX);

      const y = isAudio ? height * 0.55 : height * 0.15;
      const h = height * 0.35;

      ctx.fillStyle = isAudio ? '#10b981' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(startX, y, clipW, h, 2) : ctx.rect(startX, y, clipW, h);
      ctx.fill();
    }

    // Playhead line
    const playheadX = (playhead / total) * width;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [p, total, playhead]);

  useEffect(() => {
    drawMinimap();
  }, [drawMinimap]);

  // Handle click / drag on minimap to scroll and seek
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || total <= 0) return;
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const updateTimeFromPointer = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = ratio * total;
      seek(targetTime);

      if (scrollRef.current) {
        const timelineWidth = Math.max(900, (total + 8) * zoom);
        const scrollTarget = ratio * timelineWidth - scrollRef.current.clientWidth / 2;
        scrollRef.current.scrollLeft = Math.max(0, scrollTarget);
      }
    };

    updateTimeFromPointer(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      updateTimeFromPointer(moveEvent.clientX);
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (total <= 1) return null;

  return (
    <div
      ref={containerRef}
      className="timeline-minimap-container"
      onPointerDown={handlePointerDown}
      title="Minimap: Click or drag to jump anywhere in the timeline"
      role="navigation"
      aria-label="Timeline minimap navigation"
    >
      <canvas
        ref={canvasRef}
        className="timeline-minimap-canvas"
        width={900}
        height={22}
      />
    </div>
  );
}
