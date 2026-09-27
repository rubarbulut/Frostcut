import type { CSSProperties } from 'react';
import type { CaptionAppearance, CaptionFont } from './model';

export function captionFontFamily(font?: CaptionFont) {
  return font === 'impact'
    ? 'Impact, "Arial Black", sans-serif'
    : font === 'serif'
      ? 'Georgia, "Times New Roman", serif'
      : font === 'mono'
        ? '"JetBrains Mono", Consolas, monospace'
        : 'Noto, sans-serif';
}
export function captionDecoration(a: CaptionAppearance) {
  return (
    [a.underline ? 'underline' : '', a.strikethrough ? 'line-through' : '']
      .filter(Boolean)
      .join(' ') || 'none'
  );
}
export function captionTypography(a: CaptionAppearance): CSSProperties {
  return {
    fontFamily: captionFontFamily(a.fontFamily),
    fontStyle: a.italic ? 'italic' : 'normal',
    letterSpacing: `${a.letterSpacing ?? 0}em`,
    wordSpacing: `${a.wordSpacing ?? 0}em`,
    lineHeight: a.lineHeight ?? 1.22,
    textAlign: a.align ?? 'center',
    textAlignLast: a.align === 'justify' ? 'left' : undefined,
  };
}
export function captionBoxStyle(a: CaptionAppearance): CSSProperties {
  const boxed = (a.boxOpacity ?? 0) > 0;
  return {
    backgroundColor: boxed
      ? `${a.boxColor ?? '#000000'}${Math.round((a.boxOpacity ?? 0) * 255)
          .toString(16)
          .padStart(2, '0')}`
      : undefined,
    borderRadius: `${(a.boxRadius ?? 8) / 10.8}cqw`,
    padding: boxed
      ? `${(a.boxPadding ?? 4) / 10.8}cqw ${((a.boxPadding ?? 4) + 12) / 10.8}cqw`
      : undefined,
    display: 'inline-block',
    boxSizing: 'border-box',
    maxWidth: '100%',
    width: a.align === 'justify' ? '100%' : undefined,
    lineHeight: 'inherit',
  };
}
export function needsTypographyRenderer(a: CaptionAppearance) {
  return (
    (a.fontFamily ?? 'sans') !== 'sans' ||
    !!a.italic ||
    !!a.underline ||
    !!a.strikethrough ||
    (a.align ?? 'center') !== 'center' ||
    (a.letterSpacing ?? 0) !== 0 ||
    (a.wordSpacing ?? 0) !== 0 ||
    (a.lineHeight ?? 1.22) !== 1.22 ||
    (a.boxOpacity ?? 0) > 0
  );
}
