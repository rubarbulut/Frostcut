/**
 * 3D LUT (.CUBE) Parser and 2D Texture Atlas Unrolling Engine
 * Compatible with Adobe Cube LUT specification (17x17x17, 33x33x33, 64x64x64)
 * Unrolls 3D LUTs into hardware-accelerated 2D texture atlases for WebGL 1.0/2.0
 */

export interface ParsedLut3D {
  title?: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array; // Size: N^3 * 3
  width: number; // N * N
  height: number; // N
  textureData: Uint8Array; // Size: N^3 * 4 (RGBA8)
}

/**
 * Parses Adobe .CUBE 3D LUT files into an unrolled 2D texture atlas.
 */
export function parseCubeLut(cubeContent: string): ParsedLut3D {
  const lines = cubeContent.split(/\r?\n/);
  let size = 0;
  let title = 'Custom LUT';
  let domainMin: [number, number, number] = [0.0, 0.0, 0.0];
  let domainMax: [number, number, number] = [1.0, 1.0, 1.0];
  const rawValues: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const match = line.match(/TITLE\s+"?([^"]*)"?/i);
      if (match) title = match[1].trim();
      continue;
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }

    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/);
      domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }

    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/);
      domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }

    // Skip 1D size declarations if present in hybrid files
    if (line.startsWith('LUT_1D_SIZE')) continue;

    // Number lines (RGB entries)
    const tokens = line.split(/\s+/);
    if (tokens.length >= 3) {
      const r = parseFloat(tokens[0]);
      const g = parseFloat(tokens[1]);
      const b = parseFloat(tokens[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        rawValues.push(r, g, b);
      }
    }
  }

  // Auto-detect size if not explicitly declared in header
  if (size === 0 && rawValues.length > 0) {
    const totalEntries = rawValues.length / 3;
    const computedSize = Math.round(Math.cbrt(totalEntries));
    if (computedSize * computedSize * computedSize === totalEntries) {
      size = computedSize;
    }
  }

  if (size < 2 || size > 128) {
    throw new Error(`Invalid .CUBE LUT: unsupported size ${size}. Standard sizes are 17, 33, or 64.`);
  }

  const expectedEntries = size * size * size * 3;
  if (rawValues.length < expectedEntries) {
    throw new Error(
      `Incomplete .CUBE data: expected ${expectedEntries / 3} RGB rows for ${size}x${size}x${size}, but received ${rawValues.length / 3}.`,
    );
  }

  const data = new Float32Array(rawValues.slice(0, expectedEntries));
  const atlas = createLutAtlas(data, size, domainMin, domainMax);

  return {
    title,
    size,
    domainMin,
    domainMax,
    data,
    width: atlas.width,
    height: atlas.height,
    textureData: atlas.textureData,
  };
}

/**
 * Unrolls a 3D LUT (N x N x N) into a 2D Texture Atlas (Width: N*N, Height: N)
 * with horizontal Blue slices and clamped normalized RGBA8 bytes.
 */
export function createLutAtlas(
  data: Float32Array,
  size: number,
  domainMin: [number, number, number] = [0, 0, 0],
  domainMax: [number, number, number] = [1, 1, 1],
): { width: number; height: number; textureData: Uint8Array } {
  const width = size * size;
  const height = size;
  const textureData = new Uint8Array(width * height * 4);

  const rangeR = Math.max(0.0001, domainMax[0] - domainMin[0]);
  const rangeG = Math.max(0.0001, domainMax[1] - domainMin[1]);
  const rangeB = Math.max(0.0001, domainMax[2] - domainMin[2]);

  let srcIndex = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rawR = data[srcIndex];
        const rawG = data[srcIndex + 1];
        const rawB = data[srcIndex + 2];
        srcIndex += 3;

        const normR = Math.max(0, Math.min(1, (rawR - domainMin[0]) / rangeR));
        const normG = Math.max(0, Math.min(1, (rawG - domainMin[1]) / rangeG));
        const normB = Math.max(0, Math.min(1, (rawB - domainMin[2]) / rangeB));

        // Horizontal slice strip: slice b is at x-offset b * size
        const atlasX = b * size + r;
        const atlasY = g;
        const destOffset = (atlasY * width + atlasX) * 4;

        textureData[destOffset + 0] = Math.round(normR * 255);
        textureData[destOffset + 1] = Math.round(normG * 255);
        textureData[destOffset + 2] = Math.round(normB * 255);
        textureData[destOffset + 3] = 255;
      }
    }
  }

  return { width, height, textureData };
}

/**
 * Generates an Identity 3D LUT .CUBE file
 */
export function generateIdentityCube(size = 17): string {
  const lines: string[] = [
    '# Created by Frostcut Graphics Engine (Lead: Demir)',
    'TITLE "Identity LUT"',
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const normR = (r / (size - 1)).toFixed(6);
        const normG = (g / (size - 1)).toFixed(6);
        const normB = (b / (size - 1)).toFixed(6);
        lines.push(`${normR} ${normG} ${normB}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Generates Hollywood & Cinematic Standard 3D LUT Presets
 */
export function generatePresetCube(
  preset: 'teal-orange' | 'warm-golden' | 'bleach-bypass' | 'cyberpunk' | 'vintage',
  size = 17,
): string {
  const titles = {
    'teal-orange': 'Hollywood Teal & Orange Blockbuster Look',
    'warm-golden': 'Golden Hour Sunset Warmth',
    'bleach-bypass': 'Bleach Bypass Silver Halide Gritty',
    cyberpunk: 'Cyberpunk Neo High-Contrast Indigo',
    vintage: 'Kodak Portra Analog Emulsion Tone',
  };

  const lines: string[] = [
    `# Frostcut Cinematic Look: ${preset}`,
    `TITLE "${titles[preset]}"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let red = r / (size - 1);
        let green = g / (size - 1);
        let blue = b / (size - 1);

        if (preset === 'teal-orange') {
          // Shadows: push cyan/teal (boost blue & green, pull red)
          // Highlights: push warm orange/amber (boost red, suppress blue)
          const luma = red * 0.299 + green * 0.587 + blue * 0.114;
          const warmWeight = Math.pow(luma, 1.3);
          const coolWeight = Math.pow(1.0 - luma, 1.4);

          red = Math.max(0, red * (1.0 + warmWeight * 0.28) - coolWeight * 0.12);
          green = Math.max(0, green * (1.0 + coolWeight * 0.08));
          blue = Math.max(0, blue * (1.0 + coolWeight * 0.32) - warmWeight * 0.25);

          // S-Curve contrast
          red = Math.pow(red, 1.1);
          green = Math.pow(green, 1.05);
          blue = Math.pow(blue, 1.15);
        } else if (preset === 'warm-golden') {
          // Golden hour glow
          red = red * 1.15 + 0.03;
          green = green * 1.04;
          blue = blue * 0.82;
        } else if (preset === 'bleach-bypass') {
          // Desaturate 60% and crush contrast
          const luma = red * 0.299 + green * 0.587 + blue * 0.114;
          red = red * 0.4 + luma * 0.6;
          green = green * 0.4 + luma * 0.6;
          blue = blue * 0.4 + luma * 0.6;

          // Steep contrast
          red = red < 0.5 ? 2.0 * red * red : 1.0 - 2.0 * (1.0 - red) * (1.0 - red);
          green = green < 0.5 ? 2.0 * green * green : 1.0 - 2.0 * (1.0 - green) * (1.0 - green);
          blue = blue < 0.5 ? 2.0 * blue * blue : 1.0 - 2.0 * (1.0 - blue) * (1.0 - blue);
        } else if (preset === 'cyberpunk') {
          // Neon cyan highlights, deep violet/indigo shadows
          const luma = red * 0.299 + green * 0.587 + blue * 0.114;
          red = red * 1.1 + Math.sin(luma * 3.14) * 0.15;
          green = green * 0.95;
          blue = blue * 1.35 + 0.05;
        } else if (preset === 'vintage') {
          // Lifted blacks, creamy analog roll-off
          red = red * 0.92 + 0.05;
          green = green * 0.95 + 0.04;
          blue = blue * 0.88 + 0.06;
        }

        const outR = Math.max(0, Math.min(1, red)).toFixed(6);
        const outG = Math.max(0, Math.min(1, green)).toFixed(6);
        const outB = Math.max(0, Math.min(1, blue)).toFixed(6);
        lines.push(`${outR} ${outG} ${outB}`);
      }
    }
  }

  return lines.join('\n');
}

export const CINEMATIC_LUT_PRESETS: {
  id: 'teal-orange' | 'warm-golden' | 'bleach-bypass' | 'cyberpunk' | 'vintage';
  name: string;
  description: string;
}[] = [
  { id: 'teal-orange', name: 'Teal & Orange', description: 'Hollywood blockbuster dual-tone contrast' },
  { id: 'warm-golden', name: 'Warm Golden', description: 'Golden hour sunset warmth & skin tone glow' },
  { id: 'bleach-bypass', name: 'Bleach Bypass', description: 'High-contrast desaturated film silver look' },
  { id: 'cyberpunk', name: 'Cyberpunk Neo', description: 'Electric neon indigo and magenta highlights' },
  { id: 'vintage', name: 'Vintage Film', description: 'Classic analog Kodak emulsion with lifted blacks' },
];
