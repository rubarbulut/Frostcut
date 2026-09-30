import type { captionGroups, Project } from './model';
import { captionAppearance } from './caption-style';
import { captionFontFamily } from './caption-typography';
import { captionEmoji, captionLayout } from './caption-layout';

export function drawCanvasCaption(
  ctx: CanvasRenderingContext2D,
  p: Project,
  group: ReturnType<typeof captionGroups>[number],
  time: number,
  width: number,
  height: number,
) {
  const appearance = captionAppearance(p.captions),
    font = (width * appearance.size) / 100,
    lineHeight = font * (appearance.lineHeight ?? 1.22);
  const spacingContext = ctx as CanvasRenderingContext2D & { letterSpacing: string };
  if (appearance.letterSpacing && !('letterSpacing' in ctx))
    throw new Error('Letter spacing export needs a current browser version. Update your browser or reset letter spacing to 0.');
  ctx.save();
  ctx.font = `${appearance.italic ? 'italic ' : ''}${appearance.bold ? 700 : 400} ${font}px ${captionFontFamily(appearance.fontFamily)}`;
  if ('letterSpacing' in ctx) spacingContext.letterSpacing = `${(appearance.letterSpacing ?? 0) * font}px`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ((appearance.outline * width) / 1080) * 2;
  const space = Math.max(0, ctx.measureText(' ').width + (appearance.wordSpacing ?? 0) * font);
  const emoji = captionEmoji(p, group),
    layout = captionLayout(p);
  const display = emoji
    ? [...group, { ...group.at(-1)!, id: 'emoji', text: emoji, important: false }]
    : group;
  const align = appearance.align ?? 'center';
  const boxed = (appearance.boxOpacity ?? 0) > 0;
  const padX = boxed ? ((appearance.boxPadding ?? 4) + 12) * width / 1080 : 0;
  const padY = boxed ? (appearance.boxPadding ?? 4) * width / 1080 : 0;
  const columnWidth = width * layout.width / 100;
  const contentWidth = Math.max(1, columnWidth - padX * 2);
  const columnLeft = width * layout.x / 100 - columnWidth / 2;
  const rows: { word: (typeof group)[number]; width: number }[][] = [[]];
  let rowWidth = 0;
  for (const word of display) {
    const size = ctx.measureText(word.text).width;
    if (rowWidth + space + size > contentWidth && rows.at(-1)!.length) {
      rows.push([]);
      rowWidth = 0;
    }
    if (rows.at(-1)!.length) rowWidth += space;
    rows.at(-1)!.push({ word, width: size });
    rowWidth += size;
  }
  const rowWidths = rows.map((row) => row.reduce((n, w) => n + w.width, 0) + space * (row.length - 1));
  const textWidth = align === 'justify' ? contentWidth : Math.min(contentWidth, Math.max(...rowWidths));
  const blockWidth = textWidth + padX * 2;
  const blockLeft = align === 'left' || align === 'justify' ? columnLeft
    : align === 'right' ? columnLeft + columnWidth - blockWidth : width * layout.x / 100 - blockWidth / 2;
  const blockHeight = rows.length * lineHeight + padY * 2;
  const top =
    p.captions.position === 'custom'
      ? (height * layout.y) / 100 - blockHeight / 2
      : p.captions.position === 'top'
        ? (height * appearance.margin) / 100
        : p.captions.position === 'center'
          ? (height - blockHeight) / 2
          : height * (1 - appearance.margin / 100) - blockHeight;

  if (boxed) {
    const boxX = blockLeft, boxY = top, boxW = blockWidth, boxH = blockHeight;
    const radius = Math.min((appearance.boxRadius ?? 8) * width / 1080, boxH / 2);

    ctx.save();
    ctx.globalAlpha = appearance.boxOpacity ?? 0;
    ctx.fillStyle = appearance.boxColor ?? '#000000';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, radius);
      ctx.fill();
    } else {
      ctx.fillRect(boxX, boxY, boxW, boxH);
    }
    ctx.restore();
  }

  for (const [index, row] of rows.entries()) {
    const justify = align === 'justify' && index < rows.length - 1 && row.length > 1;
    const gap = justify ? space + Math.max(0, textWidth - rowWidths[index]) / (row.length - 1) : space;
    let x = blockLeft + padX + (align === 'right' ? textWidth - rowWidths[index]
      : align === 'center' ? (textWidth - rowWidths[index]) / 2 : 0);
    for (const { word, width: wordWidth } of row) {
      const isSpoken = time >= word.timelineStart && time < word.timelineEnd;
      const isKeyword = word.important && isSpoken;
      const anim = appearance.animation ?? 'pop';
      const active = isKeyword || (anim !== 'none' && isSpoken);
      ctx.fillStyle = active
        ? appearance.speakerColors
          ? (p.speakers.find((s) => s.id === word.speakerId)?.color ?? appearance.accent)
          : appearance.accent
        : appearance.color;
      ctx.strokeStyle = appearance.outlineColor;
      ctx.save();
      if (appearance.shadow !== false) {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = width * 4 / 1080;
        ctx.shadowOffsetY = width * 2 / 1080;
      }
      let scale = 1;
      let offsetY = 0;
      if (active) {
        if (p.captions.preset === 'Brainrot') {
          scale = 1 + p.captions.intensity * 0.002;
        } else if (anim === 'pop') {
          scale = 1.15;
        } else if (anim === 'bounce') {
          offsetY = -lineHeight * 0.12;
          scale = 1.08;
        } else if (anim === 'glow') {
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = Math.round(width * 0.02);
        }
      }
      ctx.translate(x + wordWidth / 2, top + padY + index * lineHeight + lineHeight / 2 + offsetY);
      ctx.scale(scale, scale);
      if (appearance.outline > 0) ctx.strokeText(word.text, -wordWidth / 2, -font / 2);
      ctx.fillText(word.text, -wordWidth / 2, -font / 2);
      if (word.id !== 'emoji') {
        const thickness = Math.max(1, font * 0.045);
        if (appearance.underline) ctx.fillRect(-wordWidth / 2, font * 0.45, wordWidth, thickness);
        if (appearance.strikethrough) ctx.fillRect(-wordWidth / 2, font * 0.03, wordWidth, thickness);
      }
      ctx.restore();
      x += wordWidth + gap;
    }
  }
  ctx.restore();
}
