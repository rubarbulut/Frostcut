import { describe, expect, it, vi } from 'vitest';
import {
  parseCubeLut,
  createLutAtlas,
  generatePresetCube,
  CINEMATIC_LUT_PRESETS,
} from './lut-parser';
import { EffectsRenderer } from './effects-renderer';
import { defaultGrade, defaultMask, defaultChroma, defaultLut } from './visual-effects';

describe('3D LUT (.CUBE) Parser and 2D Atlas Unroller', () => {
  it('parses a valid .cube file with comments and headers', () => {
    const cubeData = `
# Hollywood Standard Test LUT
TITLE "TealOrangeTest"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;
    const parsed = parseCubeLut(cubeData);
    expect(parsed.title).toBe('TealOrangeTest');
    expect(parsed.size).toBe(2);
    expect(parsed.data.length).toBe(24); // 2^3 * 3
    expect(parsed.domainMin).toEqual([0, 0, 0]);
    expect(parsed.domainMax).toEqual([1, 1, 1]);
  });

  it('auto-detects LUT size if LUT_3D_SIZE header is missing', () => {
    // 8 RGB triplets = 24 floats -> cube root of 8 is 2
    const cubeData = `
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;
    const parsed = parseCubeLut(cubeData);
    expect(parsed.size).toBe(2);
  });

  it('throws an error on malformed or incomplete LUT data', () => {
    const invalidCube = `
LUT_3D_SIZE 3
0.0 0.0 0.0
1.0 1.0 1.0
`;
    expect(() => parseCubeLut(invalidCube)).toThrow(/expected 27 RGB rows/);
  });

  it('unrolls 3D LUT into 2D texture atlas (N^2 x N) with RGBA8 format', () => {
    const parsed = parseCubeLut(generatePresetCube('teal-orange', 4));
    expect(parsed.size).toBe(4);

    const atlas = createLutAtlas(parsed.data, parsed.size, parsed.domainMin, parsed.domainMax);
    expect(atlas.width).toBe(16); // 4^2
    expect(atlas.height).toBe(4);  // 4
    expect(atlas.textureData.length).toBe(16 * 4 * 4); // width * height * 4 channels (RGBA)

    // Check that alpha channel is always 255 (fully opaque)
    for (let i = 3; i < atlas.textureData.length; i += 4) {
      expect(atlas.textureData[i]).toBe(255);
    }
  });

  it('generates all built-in cinematic LUT presets accurately', () => {
    const presets: Array<'teal-orange' | 'warm-golden' | 'bleach-bypass' | 'cyberpunk' | 'vintage'> = [
      'teal-orange',
      'warm-golden',
      'bleach-bypass',
      'cyberpunk',
      'vintage',
    ];

    for (const preset of presets) {
      const cubeStr = generatePresetCube(preset, 4);
      expect(cubeStr).toContain(`LUT_3D_SIZE 4`);
      const parsed = parseCubeLut(cubeStr);
      expect(parsed.size).toBe(4);
      expect(parsed.data.length).toBe(64 * 3); // 4^3 * 3
    }

    expect(CINEMATIC_LUT_PRESETS.length).toBe(5);
  });

  it('integrates 3D LUT atlas into EffectsRenderer WebGL pipeline', () => {
    const gl = {
      isContextLost: () => false,
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(() => ''),
      deleteProgram: vi.fn(),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      deleteBuffer: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      createTexture: vi.fn(() => ({})),
      bindTexture: vi.fn(),
      texParameteri: vi.fn(),
      deleteTexture: vi.fn(),
      getParameter: vi.fn(() => 4096),
      useProgram: vi.fn(),
      viewport: vi.fn(),
      activeTexture: vi.fn(),
      texImage2D: vi.fn(),
      getUniformLocation: vi.fn(() => ({})),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
      uniform3f: vi.fn(),
      uniform4f: vi.fn(),
      uniform2fv: vi.fn(),
      uniform3fv: vi.fn(),
      uniformMatrix3fv: vi.fn(),
      drawArrays: vi.fn(),
      getExtension: vi.fn(() => null),
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      ARRAY_BUFFER: 34962,
      STATIC_DRAW: 35044,
      FLOAT: 5126,
      TEXTURE_2D: 3553,
      TEXTURE_WRAP_S: 10242,
      TEXTURE_WRAP_T: 10243,
      CLAMP_TO_EDGE: 33071,
      TEXTURE_MIN_FILTER: 10241,
      TEXTURE_MAG_FILTER: 10240,
      LINEAR: 9729,
      MAX_TEXTURE_SIZE: 3379,
      TRIANGLES: 4,
      TEXTURE0: 33984,
      TEXTURE1: 33985,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
    };

    const canvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn((type: string) => (type === 'webgl' ? gl : null)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const renderer = new EffectsRenderer(canvas);
    const mockSource = { width: 1920, height: 1080 } as unknown as HTMLCanvasElement;

    const lutCube = generatePresetCube('teal-orange', 8);
    const effects = {
      grade: defaultGrade(),
      mask: defaultMask(),
      chroma: defaultChroma(),
      lut: {
        ...defaultLut(),
        enabled: true,
        cubeContent: lutCube,
        intensity: 85,
      },
    };

    renderer.draw(mockSource, 1920, 1080, effects);

    // Verify texture allocation and uniform passing
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.uniform1i).toHaveBeenCalled();
    expect(gl.uniform1f).toHaveBeenCalled();

    renderer.dispose();
    expect(gl.deleteTexture).toHaveBeenCalled();
  });
});
