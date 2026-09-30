import { useEditor } from './store';
import { clipEnd, isLocked, isAudioClip } from './model';
import { baseTransformAt, setAnimatedValue, transformAt } from './motion';
import { dragClipProperties } from './clip-drag';
import { visualBounds } from './aspect-fill';
export function TransformHandles() {
  const { project: p, selected, playhead, previewClip } = useEditor();
  const original = p.clips.find(
    (c) =>
      !isAudioClip(p, c) && selected.includes(c.id) && playhead >= c.start && playhead < clipEnd(c),
  );
  if (!original || isLocked(p, original) || p.tracks.find((t) => t.id === original.trackId)?.hidden)
    return null;
  const clip = previewClip?.id === original.id ? previewClip : original,
    props = transformAt(clip, playhead, p.settings.width, p.settings.height, p.settings.fillMode),
    base = baseTransformAt(clip, playhead, p.settings.width, p.settings.height);
  const asset = p.media.find((m) => m.id === clip.mediaId)!,
    bounds = visualBounds(asset, p.settings, p.settings.fillMode);
  return (
    <div
      className="transform-box"
      aria-label="Selected clip transform"
      style={{
        left: `${50 + (props.x / p.settings.width) * 100}%`,
        top: `${50 + (props.y / p.settings.height) * 100}%`,
        width: `${(bounds.width / p.settings.width) * 100}%`,
        height: `${(bounds.height / p.settings.height) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${props.rotation}deg) scale(${props.scale})`,
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.closest('.video-canvas')!.getBoundingClientRect();
        dragClipProperties(e, original, 'Move clip in preview', (dx, dy) => {
          let next = setAnimatedValue(
            original,
            'x',
            base.x + (dx * p.settings.width) / rect.width,
            playhead,
            p.settings.width,
            p.settings.height,
          );
          next = setAnimatedValue(
            next,
            'y',
            base.y + (dy * p.settings.height) / rect.height,
            playhead,
            p.settings.width,
            p.settings.height,
          );
          return next;
        });
      }}
    >
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
        <button
          key={corner}
          className={`transform-handle ${corner}`}
          aria-label={`Resize clip ${corner}`}
          onPointerDown={(e) => {
            const rect = e.currentTarget.closest('.video-canvas')!.getBoundingClientRect();
            const center = {
              x: rect.left + rect.width * (0.5 + props.x / p.settings.width),
              y: rect.top + rect.height * (0.5 + props.y / p.settings.height),
            };
            const start = { x: e.clientX - center.x, y: e.clientY - center.y },
              distance = Math.max(1, Math.hypot(start.x, start.y));
            dragClipProperties(e, original, 'Resize clip in preview', (dx, dy) =>
              setAnimatedValue(
                original,
                'scale',
                Math.min(
                  5,
                  Math.max(0.1, (props.scale * Math.hypot(start.x + dx, start.y + dy)) / distance),
                ),
                playhead,
                p.settings.width,
                p.settings.height,
              ),
            );
          }}
        />
      ))}
    </div>
  );
}
