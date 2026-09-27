import { rgbColor, type VisualEffects } from './visual-effects';

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
uniform int keyEnabled;
uniform vec3 keyColor;
uniform vec3 keySettings;
uniform int maskShape;
uniform vec4 maskBounds;
uniform float maskRotation;
uniform float feather;
uniform int inverted;
uniform int pointCount;
uniform vec2 points[25];
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
  vec4 color = texture2D(frame, uv);
  float alpha = color.a;
  if (keyEnabled == 1) {
    float d = distance(chroma(color.rgb), chroma(keyColor));
    float threshold = keySettings.x;
    float softness = max(keySettings.y, 0.00001);
    alpha *= smoothstep(threshold, threshold + softness, d);
    float spill = keySettings.z * (1.0 - smoothstep(threshold + softness, threshold + softness + 0.15, d));
    if (keyColor.g > max(keyColor.r, keyColor.b) + 0.1)
      color.g -= max(0.0, color.g - max(color.r, color.b)) * spill;
    else if (keyColor.b > max(keyColor.r, keyColor.g) + 0.1)
      color.b -= max(0.0, color.b - max(color.r, color.g)) * spill;
    else if (keyColor.r > max(keyColor.g, keyColor.b) + 0.1)
      color.r -= max(0.0, color.r - max(color.g, color.b)) * spill;
  }
  if (maskShape != 0) {
    float aspect = dimensions.x / dimensions.y;
    vec2 q = (uv - maskBounds.xy) * vec2(aspect, 1.0);
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
      d = polygonDistance(uv * vec2(aspect, 1.0), aspect);
    }
    float edge = feather * min(aspect, 1.0);
    float coverage = edge > 0.0 ? 1.0 - smoothstep(-edge * 0.5, edge * 0.5, d) : 1.0 - step(0.0, d);
    if (inverted == 1) coverage = 1.0 - coverage;
    alpha *= coverage;
  }
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}`;

/** One shader is shared by live preview and final export; no per-frame CPU pixel scan. */
export class EffectsRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private buffer: WebGLBuffer;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private maxTexture: number;
  private disposed = false;
  private ownsCanvas: boolean;
  constructor(canvas?: HTMLCanvasElement) {
    this.ownsCanvas = !canvas;
    this.canvas = canvas ?? document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw new Error(
        'Visual effects need WebGL. Enable graphics acceleration or disable these effects.',
      );
    this.gl = gl;
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
      this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }
  private uniform(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }
  draw(source: TexImageSource, width: number, height: number, effects: VisualEffects) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost())
      throw new Error(
        'Visual-effects graphics context was lost. Disable and re-enable the effect, then retry.',
      );
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
    const key = effects.chroma;
    gl.uniform1i(this.uniform('keyEnabled'), key?.enabled ? 1 : 0);
    gl.uniform3fv(this.uniform('keyColor'), rgbColor(key?.color ?? '#00ff00'));
    gl.uniform3f(
      this.uniform('keySettings'),
      (key?.similarity ?? 20) / 200,
      (key?.softness ?? 15) / 400,
      (key?.spill ?? 50) / 100,
    );
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
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    if (this.ownsCanvas) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
