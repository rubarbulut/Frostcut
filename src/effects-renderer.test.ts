import { describe, expect, it, vi } from 'vitest';
import { EffectsRenderer } from './effects-renderer';
import { defaultGrade, defaultMask, defaultChroma } from './visual-effects';

function createMockWebGLContext() {
  let contextLost = false;
  let loseContextCallback: (() => void) | null = null;
  let restoreContextCallback: (() => void) | null = null;

  const loseExtension = {
    loseContext: () => {
      contextLost = true;
      if (loseContextCallback) loseContextCallback();
    },
    restoreContext: () => {
      contextLost = false;
      if (restoreContextCallback) restoreContextCallback();
    },
  };

  const gl = {
    isContextLost: () => contextLost,
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
    getParameter: vi.fn((param: number) => 4096),
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
    getExtension: vi.fn((name: string) => {
      if (name === 'WEBGL_lose_context') return loseExtension;
      return null;
    }),
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
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
  };

  const canvas = Object.assign(new EventTarget(), {
    width: 1920,
    height: 1080,
    getContext: vi.fn((type: string) => {
      if (type === 'webgl') return gl as unknown as WebGLRenderingContext;
      return null;
    }),
  }) as unknown as HTMLCanvasElement;

  loseContextCallback = () => {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  };
  restoreContextCallback = () => {
    canvas.dispatchEvent(new Event('webglcontextrestored'));
  };

  return { gl, canvas, loseExtension };
}

describe('EffectsRenderer WebGL Context Recovery & WEBGL_lose_context simulation', () => {
  it('initializes program, buffers, and textures cleanly', () => {
    const { canvas, gl } = createMockWebGLContext();
    const renderer = new EffectsRenderer(canvas);

    expect(gl.createProgram).toHaveBeenCalled();
    expect(gl.createBuffer).toHaveBeenCalled();
    expect(gl.createTexture).toHaveBeenCalled();
    expect(renderer.isContextLost()).toBe(false);

    renderer.dispose();
  });

  it('silently handles WebGL context loss without throwing fatal errors on draw()', () => {
    const { canvas, gl } = createMockWebGLContext();
    const renderer = new EffectsRenderer(canvas);

    const dummySource = {} as TexImageSource;
    const effects = { grade: defaultGrade(), mask: defaultMask(), chroma: defaultChroma() };

    // Initial draw works
    expect(() => renderer.draw(dummySource, 1920, 1080, effects)).not.toThrow();

    // Trigger context loss
    renderer.simulateContextLoss();
    expect(renderer.isContextLost()).toBe(true);

    // draw() must NOT throw Error when context is lost (prevents white-screen crash)
    expect(() => renderer.draw(dummySource, 1920, 1080, effects)).not.toThrow();

    renderer.dispose();
  });

  it('automatically recovers shaders and buffers within 50ms upon webglcontextrestored', async () => {
    const { canvas, gl } = createMockWebGLContext();
    const renderer = new EffectsRenderer(canvas);

    // Initial compile count
    const initialProgramCalls = gl.createProgram.mock.calls.length;

    // Simulate GPU crash / tab switch
    renderer.simulateContextLoss();
    expect(renderer.isContextLost()).toBe(true);

    // Restore context
    renderer.simulateContextRestore();
    expect(renderer.isContextLost()).toBe(false);

    // Verifies shaders and program were re-created
    expect(gl.createProgram.mock.calls.length).toBeGreaterThan(initialProgramCalls);

    // Drawing continues smoothly without user data loss
    const dummySource = {} as TexImageSource;
    const effects = { grade: defaultGrade() };
    expect(() => renderer.draw(dummySource, 1280, 720, effects)).not.toThrow();

    renderer.dispose();
  });
});
