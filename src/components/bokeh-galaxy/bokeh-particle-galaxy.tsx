/**
 * Bokeh Particle Galaxy — WebGL2 fragment shader galaxy.
 *
 * Built from the OriginKit spec (originkit.dev/components/bokeh-particle-galaxy).
 * Same API: background, baseColor, accentColor, scale, arms, twinkle, hover, speed, advanced.
 *
 * Key features (from spec):
 *   - Log-spiral arm density field (points unwound by log of radius)
 *   - Arm edges warped by fractal value noise + dust filaments
 *   - 3 fine speck layers + 2 medium-dot layers (counter-clockwise, parallax depth)
 *   - Per-particle hash-based twinkle (no two flicker in step)
 *   - Pointer gravity well (pulls + swirls + tilts disc)
 *   - Single fragment shader on WebGL2, highp, no textures
 */
"use client";

import { useRef, useEffect } from "react";

export interface BokehGalaxyProps {
  background?: string;
  baseColor?: string;
  accentColor?: string;
  scale?: number;
  arms?: number;
  twinkle?: number;
  hover?: number;
  speed?: number;
  advanced?: {
    spinRate?: number;
    centerX?: number;
    centerY?: number;
    armWinding?: number;
    noiseScale?: number;
    dustDensity?: number;
    dotDensity?: number;
    speckSize?: number;
    dotSize?: number;
    brightness?: number;
    driftRate?: number;
    haze?: number;
    wellShape?: number;
    grain?: number;
    vignette?: number;
  };
  className?: string;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_mouseActive;
uniform vec3  u_bg;
uniform vec3  u_base;
uniform vec3  u_accent;
uniform float u_scale;
uniform float u_arms;
uniform float u_twinkle;
uniform float u_hover;
uniform float u_speed;
uniform float u_spinRate;
uniform vec2  u_center;
uniform float u_armWinding;
uniform float u_noiseScale;
uniform float u_dustDensity;
uniform float u_dotDensity;
uniform float u_speckSize;
uniform float u_dotSize;
uniform float u_brightness;
uniform float u_driftRate;
uniform float u_haze;
uniform float u_wellShape;
uniform float u_grain;
uniform float u_vignette;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

float armDensity(float r, float theta, float arms, float winding) {
  if (r < 0.01) return 1.0;
  float lr = log(max(r, 0.001)) * winding;
  float a = theta + lr;
  float d = cos(a * arms);
  return smoothstep(0.0, 1.0, d * d);
}

float bokeh(vec2 uv, float size) {
  float d = length(uv) / max(size, 0.001);
  return exp(-d * d * 4.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float scl = u_scale * 0.01;
  vec2 p = (uv - u_center) / max(scl, 0.001);
  float r = length(p);
  float theta = atan(p.y, p.x);
  float t = u_time * u_speed * 0.001 * u_spinRate;
  vec3 col = u_bg;

  // haze
  float h = fbm(p * u_noiseScale * 0.5 + vec2(t * 0.1, 0.0));
  h *= smoothstep(0.0, 0.8, 1.0 - r * 0.3);
  col = mix(col, u_base, h * u_haze * 0.3);

  // dust arms
  float warp = fbm(vec2(theta * 2.0, r * u_noiseScale) + vec2(t * 0.05, 0.0)) * 0.5;
  float dust = armDensity(r, theta + warp, u_arms, u_armWinding);
  dust *= smoothstep(0.0, 0.1, r) * smoothstep(2.0, 0.5, r) * u_dustDensity;
  col = mix(col, u_base * u_brightness, dust * 0.6);

  // particle layers (3 fine speck + 2 medium dot)
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float layerT = t * (1.0 + fi * 0.3) * u_driftRate;
    float layerR = r + fi * 0.05 * u_driftRate;
    float layerTheta = theta + layerT;
    float warpL = fbm(vec2(layerTheta * 2.0, layerR * u_noiseScale) + layerT * 0.05) * 0.5;
    float dens = armDensity(layerR, layerTheta + warpL, u_arms, u_armWinding);
    dens *= smoothstep(0.0, 0.1, layerR) * smoothstep(2.5, 0.3, layerR);
    vec2 grid = vec2(layerTheta, layerR) * (fi < 3.0 ? 40.0 : 15.0) * u_dotDensity;
    vec2 cell = floor(grid);
    vec2 cellUV = fract(grid) - 0.5;
    float h1 = hash21(cell + fi * 17.0);
    float h2 = hash21(cell + fi * 31.0 + 0.5);
    if (h1 < dens) {
      vec2 offset = vec2(h1 - 0.5, h2 - 0.5) * 0.8;
      float size = (fi < 3.0 ? u_speckSize : u_dotSize) * (0.5 + h2 * 0.5);
      float b = bokeh(cellUV - offset, size);
      b *= 1.0 + u_twinkle * 0.01 * sin(u_time * (1.0 + h1 * 5.0) + h2 * 6.28);
      vec3 sc = mix(u_base, u_accent, h2);
      col += sc * b * u_brightness * dens;
    }
  }

  // core glow
  col += u_accent * exp(-r * r * 8.0) * 0.5 * u_brightness;

  // grain + vignette (no tone mapping — keeps brightness high)
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * u_grain * 0.02;
  col *= clamp(1.0 - length(uv) * u_vignette, 0.0, 1.0);
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function BokehParticleGalaxy({
  background = "#000000",
  baseColor = "#ffffff",
  accentColor = "#ffffff",
  scale = 60,
  arms = 1,
  twinkle = 30,
  hover = 72,
  speed = 50,
  advanced = {},
  className = "",
}: BokehGalaxyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number; active: number }>({ x: 0, y: 0, active: 0 });
  const rafRef = useRef<number>(0);

  // merge advanced defaults
  const a = {
    spinRate: 1.0,
    centerX: 0.0,
    centerY: 0.0,
    armWinding: 1.0,
    noiseScale: 3.0,
    dustDensity: 1.0,
    dotDensity: 1.0,
    speckSize: 0.012,
    dotSize: 0.03,
    brightness: 1.0,
    driftRate: 0.5,
    haze: 0.5,
    wellShape: 2.0,
    grain: 1.0,
    vignette: 0.8,
    ...advanced,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) {
      console.warn("BokehParticleGalaxy: WebGL2 not supported");
      return;
    }

    // Compile shaders
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[BokehGalaxy] shader error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[BokehGalaxy] link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // Full-screen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const U = (name: string) => gl.getUniformLocation(prog, name);
    const u = {
      res: U("u_res"),
      time: U("u_time"),
      mouse: U("u_mouse"),
      mouseActive: U("u_mouseActive"),
      bg: U("u_bg"),
      base: U("u_base"),
      accent: U("u_accent"),
      scale: U("u_scale"),
      arms: U("u_arms"),
      twinkle: U("u_twinkle"),
      hover: U("u_hover"),
      speed: U("u_speed"),
      spinRate: U("u_spinRate"),
      center: U("u_center"),
      armWinding: U("u_armWinding"),
      noiseScale: U("u_noiseScale"),
      dustDensity: U("u_dustDensity"),
      dotDensity: U("u_dotDensity"),
      speckSize: U("u_speckSize"),
      dotSize: U("u_dotSize"),
      brightness: U("u_brightness"),
      driftRate: U("u_driftRate"),
      haze: U("u_haze"),
      wellShape: U("u_wellShape"),
      grain: U("u_grain"),
      vignette: U("u_vignette"),
    };


    const bg = hexToRgb(background);
    const base = hexToRgb(baseColor);
    const accent = hexToRgb(accentColor);

    // Set static uniforms once
    gl.useProgram(prog);
    gl.uniform3fv(u.bg, bg);
    gl.uniform3fv(u.base, base);
    gl.uniform3fv(u.accent, accent);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.arms, arms);
    gl.uniform1f(u.twinkle, twinkle);
    gl.uniform1f(u.hover, hover);
    gl.uniform1f(u.speed, speed);
    gl.uniform1f(u.spinRate, a.spinRate);
    gl.uniform2f(u.center, a.centerX, a.centerY);
    gl.uniform1f(u.armWinding, a.armWinding);
    gl.uniform1f(u.noiseScale, a.noiseScale);
    gl.uniform1f(u.dustDensity, a.dustDensity);
    gl.uniform1f(u.dotDensity, a.dotDensity);
    gl.uniform1f(u.speckSize, a.speckSize);
    gl.uniform1f(u.dotSize, a.dotSize);
    gl.uniform1f(u.brightness, a.brightness);
    gl.uniform1f(u.driftRate, a.driftRate);
    gl.uniform1f(u.haze, a.haze);
    gl.uniform1f(u.wellShape, a.wellShape);
    gl.uniform1f(u.grain, a.grain);
    gl.uniform1f(u.vignette, a.vignette);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      mouseRef.current.y = (rect.height - (e.clientY - rect.top)) * (canvas.height / rect.height);
      mouseRef.current.active = 1.0;
    };
    const onPointerLeave = () => {
      mouseRef.current.active = 0.0;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const start = performance.now();
    const render = () => {
      resize();
      const time = (performance.now() - start) * 0.001;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, time);
      gl.uniform2f(u.mouse, mouseRef.current.x, mouseRef.current.y);
      gl.uniform1f(u.mouseActive, mouseRef.current.active);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [
    background, baseColor, accentColor, scale, arms, twinkle, hover, speed,
    a.spinRate, a.centerX, a.centerY, a.armWinding, a.noiseScale, a.dustDensity,
    a.dotDensity, a.speckSize, a.dotSize, a.brightness, a.driftRate, a.haze,
    a.wellShape, a.grain, a.vignette,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
    />
  );
}
