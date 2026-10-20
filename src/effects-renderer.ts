import { rgbColor, type VisualEffects } from './visual-effects';
import { parseCubeLut, generatePresetCube } from './lut-parser';
import {
  computeHomography,
  identityMat3,
  invertMat3,
  type Quad,
} from './geometric-transform';

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
}`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D frame;
uniform vec2 dimensions;

// Keyer
uniform int keyEnabled;
uniform vec3 keyColor;
uniform vec3 keySettings;

// Mask
uniform int maskShape;
uniform vec4 maskBounds;
uniform float maskRotation;
uniform float feather;
uniform int inverted;
uniform int pointCount;
uniform vec2 points[25];

// Corner Pin
uniform int cornerPinEnabled;
uniform mat3 invHomography;

// Lens & Optical
uniform int lensEnabled;
uniform vec3 lensSettings; // x: vignette, y: chromaticAberration, z: distortion

// Color Grade
uniform int gradeEnabled;
uniform vec4 gradeSettings; // x: exposureMult, y: contrast, z: tempFactor, w: tintFactor
uniform vec3 gradeLift;
uniform vec3 gradeGamma;
uniform vec3 gradeGain;

// 3D LUT (.CUBE) Trilinear Atlas
uniform int lutEnabled;
uniform sampler2D lutTexture;
uniform float lutSize;
uniform float lutIntensity;

vec2 chroma(vec3 c) {
  return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081)));
}

float polygonDistance(vec2 p, float aspect) {
  float distanceToEdge = 1000.0;
  bool inside = false;
  vec2 a = points[0] * vec2(aspect, 1.0);
  for (int i = 1; i <= 24; i++) {
    if (i > pointCount) break;
    vec2 b = points[0] * vec2(aspect, 1.0);
    if (i < pointCount) b = points[i] * vec2(aspect, 1.0);
    vec2 edge = b - a;
    float t = clamp(dot(p - a, edge) / max(dot(edge, edge), 0.0000001), 0.0, 1.0);
    distanceToEdge = min(distanceToEdge, length(p - a - t * edge));
    if ((a.y > p.y) != (b.y > p.y)) {
      float x = a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y);
      if (p.x < x) inside = !inside;
    }
    a = b;
  }
  return inside ? -distanceToEdge : distanceToEdge;
}

void main() {
  vec2 sampleUv = uv;

  if (cornerPinEnabled == 1) {
    vec3 hp = invHomography * vec3(uv, 1.0);
    sampleUv = hp.xy / (abs(hp.z) > 0.00001 ? hp.z : 1.0);
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
  }

  if (lensEnabled == 1 && abs(lensSettings.z) > 0.0001) {
    vec2 d = sampleUv - vec2(0.5);
    float r2 = dot(d, d);
    sampleUv = vec2(0.5) + d * (1.0 + lensSettings.z * r2);
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
  }

  vec4 color;
  if (lensEnabled == 1 && lensSettings.y > 0.0001) {
    vec2 dir = (sampleUv - vec2(0.5)) * lensSettings.y;
    float r = texture2D(frame, sampleUv + dir).r;
    float g = texture2D(frame, sampleUv).g;
    float b = texture2D(frame, sampleUv - dir).b;
    float a = texture2D(frame, sampleUv).a;
    color = vec4(r, g, b, a);
  } else {
    color = texture2D(frame, sampleUv);
  }

  float alpha = color.a;

  if (keyEnabled == 1) {
    float d = distance(chroma(color.rgb), chroma(keyColor));
    float threshold = keySettings.x;
    float softness = max(keySettings.y, 0.00001);
    alpha *= smoothstep(threshold, threshold + softness, d);
    float spill = keySettings.z * (1.0 - smoothstep(threshold + softness, threshold + softness + 0.15, d));

    if (keyColor.g > max(keyColor.r, keyColor.b) + 0.1) {
      float excess = max(0.0, color.g - (color.r + color.b) * 0.5) * spill;
      color.g -= excess;
      color.r = min(1.0, color.r + excess * 0.35);
      color.b = min(1.0, color.b + excess * 0.15);
    } else if (keyColor.b > max(keyColor.r, keyColor.g) + 0.1) {
      float excess = max(0.0, color.b - (color.r + color.g) * 0.5) * spill;
      color.b -= excess;
      color.r = min(1.0, color.r + excess * 0.25);
      color.g = min(1.0, color.g + excess * 0.75);
    } else if (keyColor.r > max(keyColor.g, keyColor.b) + 0.1) {
      color.r -= max(0.0, color.r - max(color.g, color.b)) * spill;
    }
  }

  if (maskShape != 0) {
    float aspect = dimensions.x / dimensions.y;
    vec2 q = (sampleUv - maskBounds.xy) * vec2(aspect, 1.0);
    float c = cos(maskRotation), s = sin(maskRotation);
    q = mat2(c, -s, s, c) * q;
    vec2 radius = max(maskBounds.zw * vec2(aspect, 1.0) * 0.5, vec2(0.00001));
    float d;
    if (maskShape == 1) {
      vec2 outside = abs(q) - radius;
      d = length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
    } else if (maskShape == 2) {
      d = (length(q / radius) - 1.0) * min(radius.x, radius.y);
    } else {
      d = polygonDistance(sampleUv * vec2(aspect, 1.0), aspect);
    }
    float edge = feather * min(aspect, 1.0);
    float coverage = edge > 0.0 ? 1.0 - smoothstep(-edge * 0.5, edge * 0.5, d) : 1.0 - step(0.0, d);
    if (inverted == 1) coverage = 1.0 - coverage;
    alpha *= coverage;
  }

  if (gradeEnabled == 1) {
    color.rgb *= gradeSettings.x;
    color.r *= (1.0 + gradeSettings.z * 0.4);
    color.g *= (1.0 - gradeSettings.w * 0.3);
    color.b *= (1.0 - gradeSettings.z * 0.4 + gradeSettings.w * 0.15);

    vec3 lifted = color.rgb + gradeLift * (vec3(1.0) - color.rgb);
    vec3 gained = max(lifted * gradeGain, vec3(0.0));
    color.rgb = pow(gained, vec3(1.0) / max(gradeGamma, vec3(0.0001)));

    if (gradeSettings.y != 1.0) {
      vec3 centered = color.rgb - vec3(0.5);
      color.rgb = clamp(centered * gradeSettings.y + vec3(0.5), 0.0, 1.0);
    }
  }

  // 3D LUT (.CUBE) Trilinear Interpolation on 2D Unrolled Atlas
  if (lutEnabled == 1) {
    vec3 lutIn = clamp(color.rgb, 0.0, 1.0);
    float blue = lutIn.b * (lutSize - 1.0);
    float sliceLower = floor(blue);
    float sliceUpper = min(sliceLower + 1.0, lutSize - 1.0);
    float blueFract = blue - sliceLower;

    float invAtlasWidth = 1.0 / (lutSize * lutSize);
    float invAtlasHeight = 1.0 / lutSize;

    vec2 uvLower = vec2(
      (sliceLower * lutSize + 0.5 + lutIn.r * (lutSize - 1.0)) * invAtlasWidth,
      (0.5 + lutIn.g * (lutSize - 1.0)) * invAtlasHeight
    );
    vec2 uvUpper = vec2(
      (sliceUpper * lutSize + 0.5 + lutIn.r * (lutSize - 1.0)) * invAtlasWidth,
      (0.5 + lutIn.g * (lutSize - 1.0)) * invAtlasHeight
    );

    vec3 sampleLower = texture2D(lutTexture, uvLower).rgb;
    vec3 sampleUpper = texture2D(lutTexture, uvUpper).rgb;
    vec3 graded = mix(sampleLower, sampleUpper, blueFract);

    color.rgb = mix(color.rgb, graded, lutIntensity);
  }

  if (lensEnabled == 1 && lensSettings.x > 0.001) {
    vec2 vd = (sampleUv - vec2(0.5)) * 2.0;
    float dist = length(vd);
    float v = clamp(1.0 - dist * lensSettings.x * 0.5, 0.0, 1.0);
    color.rgb *= (v * v);
  }

  gl_FragColor = vec4(color.rgb * alpha, alpha);
}`;

/** One shader is shared by live preview and final export; no per-frame CPU pixel scan. */
export class EffectsRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program!: WebGLProgram;
  private texture!: WebGLTexture;
  private buffer!: WebGLBuffer;
  private lutTexture?: WebGLTexture;
  private currentLutKey?: string;
  private currentLutSize = 17.0;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private maxTexture = 4096;
  private disposed = false;
  private ownsCanvas: boolean;
  private contextLost = false;
  private recoveryTimeout?: ReturnType<typeof setTimeout>;

  private onContextLost = (e: Event) => {
    // WebGL spec requirement: preventDefault() instructs browser to allow context restoration
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = () => {
    this.restoreContext();
  };

  constructor(canvas?: HTMLCanvasElement) {
    this.ownsCanvas = !canvas;
    this.canvas =
      canvas ??
      (typeof document !== 'undefined'
        ? document.createElement('canvas')
        : (new EventTarget() as unknown as HTMLCanvasElement));
    const gl =
      typeof this.canvas.getContext === 'function'
        ? this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
          })
        : null;
    if (!gl)
      throw new Error(
        'Visual effects need WebGL. Enable graphics acceleration or disable these effects.',
      );
    this.gl = gl;

    this.canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored as EventListener);

    try {
      this.rebuildContext();
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    }
  }

  /**
   * Rebuilds all WebGL programs, shaders, buffers, and textures upon context recovery.
   * Restores GPU pipelines silently without dropping active video edit state.
   */
  rebuildContext() {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    this.uniforms.clear();
    this.lutTexture = undefined;
    this.currentLutKey = undefined;
    const shaders: WebGLShader[] = [];
    try {
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('Could not allocate the visual-effects shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Visual-effects shader failed: ${gl.getShaderInfoLog(shader)}`);
        return shader;
      };
      const program = gl.createProgram();
      if (!program) throw new Error('Could not initialize visual effects.');
      this.program = program;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`Visual-effects linking failed: ${gl.getProgramInfoLog(program)}`);
      this.buffer = gl.createBuffer()!;
      this.texture = gl.createTexture()!;
      if (!this.buffer || !this.texture)
        throw new Error('Not enough graphics memory for visual effects.');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      this.contextLost = false;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }

  /**
   * Handles context restoration with 50ms fast fallback retry if GPU driver is still re-initializing.
   */
  restoreContext() {
    try {
      this.rebuildContext();
      this.contextLost = false;
    } catch (err) {
      console.warn('WebGL context recovery deferred, retrying within 50ms:', err);
      if (this.recoveryTimeout) clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = setTimeout(() => {
        if (!this.disposed && (this.contextLost || this.gl.isContextLost())) {
          try {
            this.rebuildContext();
            this.contextLost = false;
          } catch {}
        }
      }, 50);
    }
  }

  /**
   * Simulates WebGL context loss for reliability testing via WEBGL_lose_context or synthetic event.
   */
  simulateContextLoss(): boolean {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
      return true;
    }
    this.contextLost = true;
    const event = new Event('webglcontextlost', { cancelable: true });
    this.canvas.dispatchEvent(event);
    return true;
  }

  /**
   * Simulates WebGL context restoration after loss for reliability testing.
   */
  simulateContextRestore(): boolean {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.restoreContext();
      return true;
    }
    this.restoreContext();
    const event = new Event('webglcontextrestored');
    this.canvas.dispatchEvent(event);
    return true;
  }

  isContextLost(): boolean {
    return this.contextLost || (this.gl ? this.gl.isContextLost() : false);
  }

  private uniform(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  draw(source: TexImageSource, width: number, height: number, effects: VisualEffects) {
    if (this.disposed) return this.canvas;
    const gl = this.gl;

    // Gracefully handle GPU crash / tab switch without throwing white-screen crash errors:
    if (this.contextLost || gl.isContextLost()) {
      return this.canvas;
    }

    if (!this.program) {
      try {
        this.rebuildContext();
      } catch {
        return this.canvas;
      }
    }
    if (width > this.maxTexture || height > this.maxTexture)
      throw new Error(`This device supports effect frames up to ${this.maxTexture}px per side.`);
    if (width < 1 || height < 1) throw new Error('A source frame is not ready for effects.');
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(this.uniform('frame'), 0);
    gl.uniform2f(this.uniform('dimensions'), width, height);

    // Keyer
    const key = effects.chroma;
    gl.uniform1i(this.uniform('keyEnabled'), key?.enabled ? 1 : 0);
    gl.uniform3fv(this.uniform('keyColor'), rgbColor(key?.color ?? '#00ff00'));
    gl.uniform3f(
      this.uniform('keySettings'),
      (key?.similarity ?? 20) / 200,
      (key?.softness ?? 15) / 400,
      (key?.spill ?? 50) / 100,
    );

    // Mask
    const mask = effects.mask;
    gl.uniform1i(
      this.uniform('maskShape'),
      mask?.enabled ? { rectangle: 1, ellipse: 2, polygon: 3 }[mask.shape] : 0,
    );
    gl.uniform4f(
      this.uniform('maskBounds'),
      (mask?.x ?? 50) / 100,
      (mask?.y ?? 50) / 100,
      (mask?.width ?? 80) / 100,
      (mask?.height ?? 80) / 100,
    );
    gl.uniform1f(this.uniform('maskRotation'), ((mask?.rotation ?? 0) * Math.PI) / 180);
    gl.uniform1f(this.uniform('feather'), (mask?.feather ?? 0) / 100);
    gl.uniform1i(this.uniform('inverted'), mask?.invert ? 1 : 0);
    const points = new Float32Array(50);
    mask?.points.forEach((p, i) => {
      points[2 * i] = p.x / 100;
      points[2 * i + 1] = p.y / 100;
    });
    gl.uniform1i(this.uniform('pointCount'), mask?.points.length ?? 0);
    gl.uniform2fv(this.uniform('points[0]'), points);

    // Corner Pin
    const cp = effects.cornerPin;
    if (cp?.enabled) {
      const srcQuad: Quad = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const dstQuad: Quad = [
        { x: cp.topLeft.x / 100, y: cp.topLeft.y / 100 },
        { x: cp.topRight.x / 100, y: cp.topRight.y / 100 },
        { x: cp.bottomRight.x / 100, y: cp.bottomRight.y / 100 },
        { x: cp.bottomLeft.x / 100, y: cp.bottomLeft.y / 100 },
      ];
      const H = computeHomography(srcQuad, dstQuad);
      const invH = H ? invertMat3(H) : null;
      if (invH) {
        gl.uniform1i(this.uniform('cornerPinEnabled'), 1);
        gl.uniformMatrix3fv(this.uniform('invHomography'), false, new Float32Array(invH));
      } else {
        gl.uniform1i(this.uniform('cornerPinEnabled'), 0);
        gl.uniformMatrix3fv(
          this.uniform('invHomography'),
          false,
          new Float32Array(identityMat3()),
        );
      }
    } else {
      gl.uniform1i(this.uniform('cornerPinEnabled'), 0);
      gl.uniformMatrix3fv(
        this.uniform('invHomography'),
        false,
        new Float32Array(identityMat3()),
      );
    }

    // Lens & Optical
    const lens = effects.lens;
    gl.uniform1i(this.uniform('lensEnabled'), lens?.enabled ? 1 : 0);
    gl.uniform3f(
      this.uniform('lensSettings'),
      (lens?.vignette ?? 0) / 100,
      (lens?.chromaticAberration ?? 0) / 2000,
      (lens?.distortion ?? 0) / 200,
    );

    // Color Grade
    const grade = effects.grade;
    gl.uniform1i(this.uniform('gradeEnabled'), grade?.enabled ? 1 : 0);
    gl.uniform4f(
      this.uniform('gradeSettings'),
      Math.pow(2, grade?.exposure ?? 0),
      (grade?.contrast ?? 100) / 100,
      (grade?.temperature ?? 0) / 100,
      (grade?.tint ?? 0) / 100,
    );
    gl.uniform3fv(this.uniform('gradeLift'), grade?.lift ?? [0, 0, 0]);
    gl.uniform3fv(this.uniform('gradeGamma'), grade?.gamma ?? [1, 1, 1]);
    gl.uniform3fv(this.uniform('gradeGain'), grade?.gain ?? [1, 1, 1]);

    // 3D LUT (.CUBE) Trilinear Color Grading
    const lut = effects.lut;
    if (lut?.enabled) {
      const cubeData = lut.cubeData || generatePresetCube('teal-orange');
      gl.activeTexture(gl.TEXTURE1);
      if (!this.lutTexture) {
        this.lutTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
      }

      if (this.currentLutKey !== cubeData) {
        try {
          const parsed = parseCubeLut(cubeData);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            parsed.width,
            parsed.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            parsed.textureData,
          );
          this.currentLutKey = cubeData;
          this.currentLutSize = parsed.size;
        } catch (err) {
          console.warn('Failed to parse or upload 3D LUT:', err);
        }
      }

      gl.uniform1i(this.uniform('lutEnabled'), 1);
      gl.uniform1i(this.uniform('lutTexture'), 1);
      gl.uniform1f(this.uniform('lutSize'), this.currentLutSize || 17.0);
      gl.uniform1f(
        this.uniform('lutIntensity'),
        Math.max(0, Math.min(1, (lut.intensity ?? 100) / 100)),
      );
    } else {
      gl.uniform1i(this.uniform('lutEnabled'), 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.recoveryTimeout) clearTimeout(this.recoveryTimeout);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored as EventListener);
    if (!this.gl.isContextLost()) {
      try {
        if (this.lutTexture) this.gl.deleteTexture(this.lutTexture);
        if (this.texture) this.gl.deleteTexture(this.texture);
        if (this.buffer) this.gl.deleteBuffer(this.buffer);
        if (this.program) this.gl.deleteProgram(this.program);
      } catch {}
    }
    this.lutTexture = undefined;
    if (this.ownsCanvas) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
