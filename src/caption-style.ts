import type { CaptionAppearance, CaptionStyle } from './model';

export function captionAppearance(style: CaptionStyle): CaptionAppearance {
  const base = style.appearance;
  if (!base) {
    return {
      size: style.preset === 'Clean' ? 5.2 : 6.7,
      color: '#ffffff',
      accent: '#b9e9ff',
      speakerColors: true,
      outlineColor: '#141920',
      outline: style.preset === 'Clean' ? 2 : 3,
      bold: style.preset !== 'Clean',
      margin: 15,
      animation: style.preset === 'Brainrot' ? 'bounce' : 'pop',
      boxColor: '#000000',
      boxOpacity: 0,
      boxRadius: 8,
      boxPadding: 4,
      shadow: true,
      fontFamily: 'sans',
      italic: false, underline: false, strikethrough: false, align: 'center',
      letterSpacing: 0, wordSpacing: 0, lineHeight: 1.22,
    };
  }
  return {
    size: base.size,
    color: base.color,
    accent: base.accent,
    speakerColors: base.speakerColors,
    outlineColor: base.outlineColor,
    outline: base.outline,
    bold: base.bold,
    margin: base.margin,
    animation: base.animation ?? (style.preset === 'Brainrot' ? 'bounce' : 'pop'),
    boxColor: base.boxColor ?? '#000000',
    boxOpacity: base.boxOpacity ?? 0,
    boxRadius: base.boxRadius ?? 8,
    boxPadding: base.boxPadding ?? 4,
    shadow: base.shadow ?? true,
    fontFamily: base.fontFamily ?? 'sans',
    italic: base.italic ?? false,
    underline: base.underline ?? false,
    strikethrough: base.strikethrough ?? false,
    align: base.align ?? 'center',
    letterSpacing: base.letterSpacing ?? 0,
    wordSpacing: base.wordSpacing ?? 0,
    lineHeight: base.lineHeight ?? 1.22,
  };
}
