import { adjustmentFilter, type AdjustmentLayer } from './adjustments';

/** Grade the completed video composite once, before captions and editor overlays. */
export function drawCanvasAdjustments(
  ctx: CanvasRenderingContext2D,
  layers: AdjustmentLayer[] | undefined,
  time: number,
) {
  const filter = adjustmentFilter(layers, time);
  if (filter === 'none') return;
  if (!('filter' in ctx))
    throw new Error(
      'Adjustment export needs Canvas filters. Update this browser before exporting.',
    );
  ctx.save();
  try {
    ctx.filter = filter;
    if (ctx.filter === 'none')
      throw new Error('This browser could not apply the adjustment filters.');
    // Canvas self-drawing snapshots the source before drawing, without another retained full-size canvas.
    ctx.drawImage(ctx.canvas, 0, 0);
  } finally {
    ctx.restore();
  }
}
