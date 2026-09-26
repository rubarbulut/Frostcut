import type { CaptionAppearance, CaptionStyle } from './model';

export function captionAppearance(style: CaptionStyle): CaptionAppearance {
  return (
    style.appearance ?? {
      size: style.preset === 'Clean' ? 5.2 : 6.7,
      color: '#ffffff',
      accent: '#b9e9ff',
      speakerColors: true,
      outlineColor: '#141920',
      outline: style.preset === 'Clean' ? 2 : 3,
      bold: style.preset !== 'Clean',
      margin: 15,
    }
  );
}
