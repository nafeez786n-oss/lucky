/* eslint-disable */
// Delivered by Originkit · stack: nextjs · styling: tailwind
// Set these props to match the Originkit preview:
//   advanced={{"eye":5,"haze":12,"lens":35,"seed":0,"spin":12,"wind":140,"grain":0,"centerX":50,"centerY":51,"dotSize":100,"dustDim":29,"armNoise":50,"dotDrift":10,"dustSize":100,"parallax":4,"vignette":0,"bokehSize":100,"bokehSoft":35,"dotBright":85,"dustDrift":30,"twinkleHz":20,"bokehCycle":1400,"dotDensity":100,"dustBright":62,"armContrast":60,"bokehAspect":160,"bokehGrowth":325,"dustDensity":100,"bokehOpacity":100}}
"use client";

const addPropertyControls = () => {};

/**
 * BokehParticleGalaxy — Recreate the reference exactly. No description was given — read what it is and how it moves from the clip itself.
 *
 * Built on the Background template (lib/templates/BackgroundTemplate.tsx).
 * Only the EFFECT block and the effect controls are specific to this component.
 *
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
import { useEffect, useRef, type CSSProperties } from "react"

// ── moments-kit v1 ──
// Shared by every moments/ component. Canonical copy: moments/kit/moments-kit.v1.ts.
// Edit there, then paste verbatim into each component; moments/checks/kit-sync.mjs enforces it.

type RGBA = [number, number, number, number]

const COLOR_CACHE = new Map<string, RGBA | null>()

function parseColor(input: string | undefined, fallback: RGBA): RGBA {
    if (typeof input !== "string") return fallback
    let hit = COLOR_CACHE.get(input)
    if (hit === undefined) {
        hit = parseColorRaw(input)
        COLOR_CACHE.set(input, hit)
    }
    return hit ?? fallback
}

function parseColorRaw(raw: string): RGBA | null {
    let s = raw.trim()
    const v = /^var\(\s*--[^,]+,\s*(.+)\)$/.exec(s)
    if (v) s = v[1].trim()
    if (s[0] === "#") {
        const h = s.slice(1)
        const x = (a: string) => parseInt(a, 16)
        let r: number, g: number, b: number, a = 255
        if (h.length === 3 || h.length === 4) {
            r = x(h[0] + h[0]); g = x(h[1] + h[1]); b = x(h[2] + h[2])
            if (h.length === 4) a = x(h[3] + h[3])
        } else if (h.length === 6 || h.length === 8) {
            r = x(h.slice(0, 2)); g = x(h.slice(2, 4)); b = x(h.slice(4, 6))
            if (h.length === 8) a = x(h.slice(6, 8))
        } else return null
        const out: RGBA = [r / 255, g / 255, b / 255, a / 255]
        return out.every(Number.isFinite) ? out : null
    }
    const m = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(s)
    if (!m) return null
    const parts = m[2].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const num = (p: string, scale: number) =>
        p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p)
    const alpha = parts.length > 3 ? num(parts[3], 1) : 1
    let rgb: [number, number, number]
    if (m[1].toLowerCase().startsWith("rgb")) {
        rgb = [num(parts[0], 255) / 255, num(parts[1], 255) / 255, num(parts[2], 255) / 255]
    } else {
        const hh = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360
        const ss = num(parts[1], 1), ll = num(parts[2], 1)
        const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
        const p = 2 * ll - q
        const f = (t: number) => {
            t = (t + 1) % 1
            if (t < 1 / 6) return p + (q - p) * 6 * t
            if (t < 1 / 2) return q
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
            return p
        }
        rgb = [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)]
    }
    const out: RGBA = [rgb[0], rgb[1], rgb[2], alpha]
    return out.every(Number.isFinite) ? out.map((c) => Math.min(1, Math.max(0, c))) as RGBA : null
}

function cssRgba(c: RGBA): string {
    return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`
}

interface FramerFont {
    fontFamily?: string
    fontWeight?: number | string
    fontStyle?: string
    fontSize?: number | string
    lineHeight?: number | string
    letterSpacing?: number | string
}

const FALLBACK_FAMILY = "Inter, system-ui, sans-serif"

function quoteFamily(family: string): string {
    return family
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => (n[0] === "'" || n[0] === '"' || /^[a-z-]+$/i.test(n) ? n : `"${n.replace(/"/g, '\\"')}"`))
        .join(", ")
}

function fontShorthand(font: FramerFont | undefined, fallbackSize: number, fallbackWeight: number) {
    const f = font || {}
    let size = fallbackSize
    if (typeof f.fontSize === "number" && Number.isFinite(f.fontSize)) size = f.fontSize
    else if (typeof f.fontSize === "string") {
        const n = parseFloat(f.fontSize)
        if (Number.isFinite(n)) size = f.fontSize.includes("rem") ? n * 16 : n
    }
    let lineHeight = size * 1.3
    if (typeof f.lineHeight === "number" && Number.isFinite(f.lineHeight))
        lineHeight = f.lineHeight <= 4 ? f.lineHeight * size : f.lineHeight
    else if (typeof f.lineHeight === "string") {
        const n = parseFloat(f.lineHeight)
        if (Number.isFinite(n))
            lineHeight = f.lineHeight.endsWith("%") ? (n / 100) * size : f.lineHeight.endsWith("em") ? n * size : n <= 4 ? n * size : n
    }
    const family = f.fontFamily ? quoteFamily(f.fontFamily) : FALLBACK_FAMILY
    const shorthand = `${f.fontStyle || "normal"} ${f.fontWeight || fallbackWeight} ${size}px ${family}`
    return { shorthand, size, lineHeight }
}

function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
    const out: string[] = []
    for (const para of String(text ?? "").split("\n")) {
        const words = para.split(/ +/)
        let line = ""
        for (const w of words) {
            const next = line ? `${line} ${w}` : w
            if (line && measure(next) > maxWidth) {
                out.push(line)
                line = w
            } else line = next
        }
        out.push(line)
    }
    return out
}

function radiusPx(w: number, h: number, pct: number): number {
    return (Math.min(w, h) / 2) * Math.min(1, Math.max(0, pct / 100))
}

type Phase = "idle" | "playing" | "held" | "restoring"
interface TriggerState { phase: Phase; t: number; timer: number; prevPlay: boolean | undefined }
interface TriggerInput {
    dt: number; animDt: number; playDur: number; restoreDur: number; holdS: number
    play: boolean | undefined; clicked: boolean; onCanvas: boolean
}
interface TriggerEvents { started: boolean; completed: boolean; restored: boolean }

const TRIGGER_IDLE: TriggerState = { phase: "idle", t: 0, timer: 0, prevPlay: undefined }
const CANVAS_IDLE_S = 1
// R3 ruling: compare with epsilon everywhere a float accumulator (dt/animDt
// summed frame by frame) is checked against a duration boundary — repeated
// 0.1 additions land on 0.9999999999999999, not 1, so a strict >= misses the
// transition for exactly one extra frame and the reducer's own tests (which
// assert phase after an exact frame count) go red on that alone.
const EPS = 1e-9

// I2 ruling: controlled mode (play !== undefined) reacts to the play LEVEL
// each step, not an edge against prevPlay — an uncontrolled run (play was
// undefined, so prevPlay never became true) that switches straight to
// play:false must still interrupt on that very frame. prevPlay stays on the
// state shape (set below every step) but is no longer read for a decision.
// I1 ruling: only the two *interrupt* transitions — playing→restoring and
// restoring→playing — mirror progress (t = 1 - s.t) so a controlled toggle
// keeps the visual position continuous. held→restoring and idle→playing are
// normal starts and still begin at t = 0.
function stepTrigger(s: TriggerState, i: TriggerInput): { s: TriggerState; e: TriggerEvents } {
    const e: TriggerEvents = { started: false, completed: false, restored: false }
    const n: TriggerState = { ...s, prevPlay: i.play }
    const controlled = i.play !== undefined
    const start = (t = 0) => { n.phase = "playing"; n.t = t; n.timer = 0; e.started = true }
    const restore = (t = 0) => { n.phase = "restoring"; n.t = t; n.timer = 0 }

    switch (s.phase) {
        case "idle":
            n.timer = s.timer + i.dt
            if (controlled ? i.play === true : i.clicked || (i.onCanvas && n.timer >= CANVAS_IDLE_S - EPS)) start()
            break
        case "playing":
            if (controlled && i.play === false) { restore(1 - s.t); break }
            n.t = Math.min(1, s.t + i.animDt / Math.max(1e-3, i.playDur))
            if (n.t >= 1 - EPS) { n.t = 1; n.phase = "held"; n.timer = 0; e.completed = true }
            break
        case "held":
            if (controlled) { if (i.play === false) restore(0); break }
            n.timer = s.timer + i.dt
            if (n.timer >= i.holdS - EPS) restore(0)
            break
        case "restoring":
            if (controlled && i.play === true) { start(1 - s.t); break }
            n.t = Math.min(1, s.t + i.animDt / Math.max(1e-3, i.restoreDur))
            if (n.t >= 1 - EPS) { n.phase = "idle"; n.t = 0; n.timer = 0; e.restored = true }
            break
    }
    return { s: n, e }
}

interface CardSpec {
    w: number; h: number; dpr: number; fill: string; rounded: number
    title: string; body: string; font: FramerFont | undefined; textColor: string
    image: HTMLImageElement | null; pad: number
}
interface GlyphBox { ch: string; x: number; y: number; w: number; h: number }

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

/** Paints the card into ctx (canvas already sized w*dpr × h*dpr). Returns glyph boxes in CSS px when asked. */
function drawCard(ctx: CanvasRenderingContext2D, spec: CardSpec, wantGlyphs: boolean): GlyphBox[] {
    const { w, h, dpr, pad } = spec
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const r = radiusPx(w, h, spec.rounded)
    roundRectPath(ctx, 0, 0, w, h, r)
    ctx.fillStyle = cssRgba(parseColor(spec.fill, [1, 1, 1, 1]))
    ctx.fill()
    ctx.save()
    roundRectPath(ctx, 0, 0, w, h, r)
    ctx.clip()
    let y = pad
    if (spec.image && spec.image.naturalWidth > 0) {
        const ih = Math.round(h * 0.5)
        const s = Math.max(w / spec.image.naturalWidth, ih / spec.image.naturalHeight)
        const dw = spec.image.naturalWidth * s, dh = spec.image.naturalHeight * s
        ctx.save()
        ctx.beginPath(); ctx.rect(0, 0, w, ih); ctx.clip()
        ctx.drawImage(spec.image, (w - dw) / 2, (ih - dh) / 2, dw, dh)
        ctx.restore()
        y = ih + pad
    }
    const glyphs: GlyphBox[] = []
    const color = cssRgba(parseColor(spec.textColor, [0, 0, 0, 1]))
    const title = fontShorthand(spec.font, 22, 700)
    const body = fontShorthand(spec.font ? { ...spec.font, fontSize: title.size * 0.68, fontWeight: 400 } : undefined, 15, 400)
    const block = (text: string, f: { shorthand: string; size: number; lineHeight: number }) => {
        if (!text) return
        ctx.font = f.shorthand
        ctx.fillStyle = color
        ctx.textBaseline = "top"
        ctx.textAlign = "left"
        for (const line of wrapLines((s) => ctx.measureText(s).width, text, w - pad * 2)) {
            if (y + f.size > h - pad * 0.5) break
            ctx.fillText(line, pad, y)
            if (wantGlyphs) {
                // Prefix measures, so kerning between neighbours is respected.
                let prefix = ""
                for (const ch of line) {
                    const x = pad + ctx.measureText(prefix).width
                    const cw = pad + ctx.measureText(prefix + ch).width - x
                    if (ch.trim()) glyphs.push({ ch, x, y, w: cw, h: f.lineHeight })
                    prefix += ch
                }
            }
            y += f.lineHeight
        }
        y += f.size * 0.4
    }
    block(spec.title, title)
    block(spec.body, body)
    ctx.restore()
    return glyphs
}

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        if (!src || typeof Image === "undefined") return resolve(null)
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

function createProgram<U extends string>(gl: WebGL2RenderingContext, vs: string, fs: string, uniforms: readonly U[]) {
    const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(s) || "shader compile failed"
            gl.deleteShader(s)
            throw new Error(log)
        }
        return s
    }
    const program = gl.createProgram()!
    const vsh = sh(gl.VERTEX_SHADER, vs)
    const fsh = sh(gl.FRAGMENT_SHADER, fs)
    gl.attachShader(program, vsh)
    gl.attachShader(program, fsh)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || "link failed"
        gl.deleteShader(vsh)
        gl.deleteShader(fsh)
        gl.deleteProgram(program)
        throw new Error(log)
    }
    // Shaders are flagged for deletion once linked; the GL driver frees them
    // for real after they're detached, which happens when the program itself
    // is eventually deleted. No reason to keep the compile units around.
    gl.deleteShader(vsh)
    gl.deleteShader(fsh)
    const u = {} as Record<U, WebGLUniformLocation>
    for (const name of uniforms) {
        const loc = gl.getUniformLocation(program, name)
        if (!loc) {
            gl.deleteProgram(program)
            throw new Error(`uniform ${name} not found`)
        }
        u[name] = loc
    }
    return { program, u }
}
// ── /moments-kit ──

// ══ EFFECT — replace from here ══════════════════════════════════════════════

/** Tuning values. Stripped at publish; the tuned values are baked in here. */
const ADVANCED_DEFAULTS = {
    spin: 12,
    centerX: 50,
    centerY: 51,
    wind: 140,
    armContrast: 60,
    armNoise: 50,
    eye: 5,
    dustDensity: 100,
    dustSize: 100,
    dustDim: 29,
    dustBright: 62,
    haze: 12,
    dustDrift: 30,
    dotDensity: 100,
    dotSize: 100,
    dotBright: 85,
    dotDrift: 10,
    twinkleHz: 20,
    seed: 0,
    pull: 60,
    swirl: 70,
    wellSize: 22,
    tilt: 30,
    parallax: 4,
    hover: 72,
    grain: 0,
    vignette: 0,
}

// ── moved controls (builder) ──
/**
 * Controls moved in the builder: into Advanced, out of it, or into groups of
 * their own. The code reads each one where it was first written, so the props
 * are put back in that shape before anything reads them.
 */
const MOVED_CONTROLS: { into: Record<string, string>; out: Record<string, string> } = {"into":{},"out":{"hover":"advanced"}}
const GROUP_FALLBACKS: Record<string, any> = { advanced: ADVANCED_DEFAULTS }
function withMovedControls(props: any): any {
    const out = { ...props }
    for (const [k, g] of Object.entries(MOVED_CONTROLS.into)) out[k] = props?.[g]?.[k] ?? GROUP_FALLBACKS[g]?.[k]
    for (const [k, g] of Object.entries(MOVED_CONTROLS.out)) {
        if (out[k] !== undefined) out[g] = { ...(out[g] ?? {}), [k]: out[k] }
    }
    return out
}
// ── /moved controls ──

/** Effect-only props (≤ 3). Add matching rows at the end of addPropertyControls. */
interface EffectProps {
    arms?: number
    twinkle?: number
    advanced?: Partial<typeof ADVANCED_DEFAULTS>
}

/** Extra uniforms for this effect, set every frame. */
function effectUniforms(gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null, p: Props): void {
    const adv = { ...ADVANCED_DEFAULTS, ...(p.advanced ?? {}) }
    const cl = (v: unknown, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, num(v, d)))
    gl.uniform1f(u("uArms"), Math.round(cl(p.arms, 3, 1, 8)))

    gl.uniform1f(u("uTwinkle"), cl(p.twinkle, 50, 0, 100) / 50)
    gl.uniform1f(u("uHoverAmt"), cl(adv.hover, 50, 0, 100) / 50)
    gl.uniform1f(u("uPull"), cl(adv.pull, 60, 0, 100) / 100)
    gl.uniform1f(u("uSwirl"), cl(adv.swirl, 70, 0, 100) / 100)
    gl.uniform1f(u("uWellSize"), cl(adv.wellSize, 22, 5, 60) / 100)
    gl.uniform1f(u("uTilt"), cl(adv.tilt, 30, 0, 100) / 100)
    gl.uniform1f(u("uParallax"), cl(adv.parallax, 4, 0, 30) / 100)
    gl.uniform1f(u("uGrain"), cl(adv.grain, 0, 0, 100) / 100)
    gl.uniform1f(u("uVignette"), cl(adv.vignette, 0, 0, 100) / 100)
    gl.uniform1f(u("uSpin"), (cl(adv.spin, 12, -180, 180) * Math.PI) / 180)
    gl.uniform2f(u("uCenter"), cl(adv.centerX, 50, 0, 100) / 100, 1 - cl(adv.centerY, 51, 0, 100) / 100)
    gl.uniform1f(u("uWind"), cl(adv.wind, 140, -300, 300) / 100)
    gl.uniform1f(u("uArmContrast"), cl(adv.armContrast, 60, 0, 100) / 100)
    gl.uniform1f(u("uArmNoise"), cl(adv.armNoise, 50, 0, 200) / 100)
    gl.uniform1f(u("uEye"), cl(adv.eye, 5, 0, 40) / 100)
    gl.uniform1f(u("uDustDensity"), cl(adv.dustDensity, 100, 0, 250) / 100)
    gl.uniform1f(u("uDustSize"), cl(adv.dustSize, 100, 20, 400) / 100)
    gl.uniform1f(u("uDustDim"), cl(adv.dustDim, 29, 0, 100) / 100)
    gl.uniform1f(u("uDustBright"), cl(adv.dustBright, 62, 0, 100) / 100)
    gl.uniform1f(u("uHaze"), cl(adv.haze, 12, 0, 100) / 100)
    gl.uniform1f(u("uDustDrift"), cl(adv.dustDrift, 30, 1, 300))
    gl.uniform1f(u("uDotDensity"), cl(adv.dotDensity, 100, 0, 300) / 100)
    gl.uniform1f(u("uDotSize"), cl(adv.dotSize, 100, 20, 300) / 100)
    gl.uniform1f(u("uDotBright"), cl(adv.dotBright, 85, 0, 100) / 100)
    gl.uniform1f(u("uDotDrift"), cl(adv.dotDrift, 10, 1, 120))

    gl.uniform1f(u("uTwinkleHz"), cl(adv.twinkleHz, 20, 0, 60))
    gl.uniform1f(u("uSeed"), Math.round(cl(adv.seed, 0, 0, 100)))
}

/* A 3D dust galaxy: spiral-arm density field, three slow speck layers and two medium-dot layers,
   all rotating counter-clockwise as one body while each layer zooms toward the camera (parallax). */
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uHover;
uniform vec3 uBg;
uniform vec3 uBase;
uniform vec3 uAccent;
uniform float uScale;
uniform float uArms;
uniform float uTwinkle;
uniform float uHoverAmt;
uniform float uPull;
uniform float uSwirl;
uniform float uWellSize;
uniform float uTilt;
uniform float uDown;
uniform float uParallax;
uniform float uGrain;
uniform float uVignette;
uniform float uSpin;
uniform vec2 uCenter;
uniform float uWind;
uniform float uArmContrast;
uniform float uArmNoise;
uniform float uEye;
uniform float uDustDensity;
uniform float uDustSize;
uniform float uDustDim;
uniform float uDustBright;
uniform float uHaze;
uniform float uDustDrift;
uniform float uDotDensity;
uniform float uDotSize;
uniform float uDotBright;
uniform float uDotDrift;
uniform float uTwinkleHz;
uniform float uSeed;
out vec4 outColor;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 h42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s / 0.9375; }

// Spiral-arm density (0..~1.6) and dust filaments along the arms.
float galaxy(vec2 p, out float fil) {
    float r = max(length(p), 1e-4);
    float lr = log(r);
    vec2 pw = rot(uWind * lr) * p;          // log spiral -> straight spokes
    vec2 dir = pw / r;
    float warp = (fbm(dir * 2.5 + vec2(lr * 1.3, uSeed)) - 0.5) * uArmNoise * 6.0;
    float arm = 0.5 + 0.5 * cos(uArms * atan(pw.y, pw.x) + warp);
    arm = pow(arm, 1.6);
    fil = fbm(dir * 16.0 + vec2(lr * 2.4, uSeed * 1.7));
    fil = smoothstep(0.3, 0.75, fil);
    float d = mix(1.0, mix(0.25, 1.25, arm), uArmContrast) * mix(0.45, 1.3, fil);
    d *= mix(0.3, 1.0, smoothstep(uEye * 0.5, uEye * 1.6, r));
    return d;
}

void main() {
    float H = max(uRes.y, 1.0);
    float asp = uRes.x / H;
    float sc0 = max(uScale, 0.05);
    vec2 q = (gl_FragCoord.xy - uCenter * uRes) / H;
    vec2 m = (uMouse - uCenter) * vec2(asp, 1.0);
    float hv = uHover * uHoverAmt;
    // Pointer: a gravity well. Space around it is twisted and drawn in, so the dust drifting past
    // spirals into a dark core ringed with light; pressing deepens the well, and the whole disc
    // tips toward the pointer like a plane seen in 3D.
    float force = hv * (1.0 + 0.8 * uDown);
    vec2 dm = q - m;
    float dr = length(dm);
    float wr = max(uWellSize, 0.02);
    float fall = exp(-dr * dr / (wr * wr));
    dm = rot(-min(4.0, uSwirl * 2.4 * force) * fall) * dm;
    dm *= 1.0 + min(2.0, uPull * 1.5 * force) * fall;   // < 2.2 keeps the warp from folding over
    q = m + dm;
    vec2 tv = (uMouse - 0.5) * vec2(asp, 1.0) * hv * uTilt;
    q /= max(0.4, 1.0 + dot(q, tv));
    q /= sc0;
    float px = 1.0 / (H * sc0);
    float ang = uTime * uSpin;               // counter-clockwise on screen
    vec2 p = rot(-ang) * q;
    vec2 par = rot(-ang) * ((uMouse - 0.5) * vec2(asp, 1.0) * hv * uParallax);
    float fil;
    float dens = galaxy(p, fil);
    float ring = exp(-pow((dr - wr * 0.3) / (wr * 0.16), 2.0));
    float glow = 1.0 + force * (0.5 * fall + 1.6 * ring);

    vec3 col = uBg + uBase * (uHaze * fil * fil * min(dens, 1.2) * 0.6);

    // Far specks: three slow depth layers.
    float dust = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float cyc = uTime / max(uDustDrift, 0.1) + fi / 3.0;
        float z = fract(cyc);
        float s = exp2(z);
        float w = smoothstep(0.0, 0.2, z) * (1.0 - smoothstep(0.8, 1.0, z));
        vec2 c = (p - par * (0.15 + 0.1 * fi)) / (s * 0.0085) + vec2(fi * 37.0 + floor(cyc) * 11.0 + uSeed * 17.0, fi * 19.0);
        vec2 id = floor(c);
        vec4 h = h42(id);
        if (h.x > dens * 0.8 * uDustDensity) continue;
        vec2 o = 0.2 + 0.6 * h.yz;
        float d = length(fract(c) - o) * 0.0085 * s;
        float rs = mix(0.0008, 0.0017, h.w) * uDustSize * mix(1.0, 1.35, z);
        float a = 1.0 - smoothstep(rs - px * 0.6, rs + px * 0.6, d);
        float b = mix(uDustDim, uDustBright, pow(h.w, 0.8));
        if (h.w > 0.94) b = max(b, 0.79);
        float tn = uTime * uTwinkleHz + h.y * 7.0;
        float tw = mix(h12(id + floor(tn)), h12(id + floor(tn) + 1.0), smoothstep(0.0, 1.0, fract(tn)));
        b *= 1.0 - min(0.9, 0.6 * uTwinkle * (1.0 - tw));
        dust += a * b * w;
    }
    col += uBase * dust * glow;

    // Medium dots: two mid-depth layers, concentrated on the arms.
    float dots = 0.0;
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float cyc = uTime / max(uDotDrift, 0.1) + fi * 0.5;
        float z = fract(cyc);
        float s = exp2(z * 0.8);
        float w = smoothstep(0.0, 0.2, z) * (1.0 - smoothstep(0.8, 1.0, z));
        vec2 c = (p - par * (0.4 + 0.2 * fi)) / (s * 0.045) + vec2(fi * 71.0 + floor(cyc) * 13.0 + uSeed * 5.0, 41.0 + fi * 23.0);
        vec2 id = floor(c);
        vec4 h = h42(id);
        if (h.x > min(1.0, dens * dens * 1.1) * uDotDensity) continue;
        vec2 o = 0.25 + 0.5 * h.yz;
        float d = length(fract(c) - o) * 0.045 * s;
        float rs = mix(0.0022, 0.0038, h.w) * uDotSize * mix(1.0, 1.25, z);
        float edge = 0.0009 + px * 0.5;
        float a = 1.0 - smoothstep(rs - edge, rs + edge, d);
        float b = mix(uDotBright * 0.9, min(1.0, uDotBright * 1.08), h.y);
        float tn = uTime * uTwinkleHz * 0.5 + h.z * 5.0;
        float tw = mix(h12(id + floor(tn) + 3.0), h12(id + floor(tn) + 4.0), smoothstep(0.0, 1.0, fract(tn)));
        b *= 1.0 - min(0.6, 0.3 * uTwinkle * (1.0 - tw));
        dots += a * b * w;
    }
    col += uAccent * dots * glow;

    // The well itself: a faint lit ring and a dark event-horizon core.
    col += uAccent * 0.05 * force * ring;
    float hole = exp(-dr * dr / (wr * wr * 0.012));
    col = mix(col, uBg, clamp(force, 0.0, 1.0) * hole * 0.9);

    vec2 uv = gl_FragCoord.xy / max(uRes, vec2(1.0));
    float vg = smoothstep(0.35, 0.95, length((uv - 0.5) * vec2(asp, 1.0)));
    col *= 1.0 - uVignette * vg;
    col += (h12(gl_FragCoord.xy + fract(uTime * 7.0) * 517.0) - 0.5) * uGrain * 0.2;
    outColor = vec4(max(col, vec3(0.0)), 1.0);
}`

// ══ /EFFECT ═════════════════════════════════════════════════════════════════

interface Props extends EffectProps {
    background?: string
    baseColor?: string
    accentColor?: string
    speed?: number
    scale?: number
    style?: CSSProperties
}

function num(v: unknown, d: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : d
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

export default function BokehParticleGalaxy(props: Props) {
    props = withMovedControls(props)
    // Read live from propsRef; destructured here so their defaults sit in the signature.
    const { background = "#000000", baseColor = "#FFFFFF", accentColor = "#FFFFFF", speed = 50, scale = 60, style } = props
    void [baseColor, accentColor, speed, scale]
    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const propsRef = useRef(props)
    propsRef.current = props

    useEffect(() => {
        const root = rootRef.current
        const canvas = canvasRef.current
        if (!root || !canvas) return
        const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false })
        if (!gl) return
        const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

        const sh = (type: number, src: string) => {
            const s = gl.createShader(type)!
            gl.shaderSource(s, src)
            gl.compileShader(s)
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error("BokehParticleGalaxy shader:", gl.getShaderInfoLog(s))
            return s
        }
        const prog = gl.createProgram()!
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("BokehParticleGalaxy link:", gl.getProgramInfoLog(prog))
            return
        }
        gl.useProgram(prog)
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const loc = gl.getAttribLocation(prog, "aPos")
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        const cache = new Map<string, WebGLUniformLocation | null>()
        const u = (name: string) => {
            if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name))
            return cache.get(name) ?? null
        }

        let W = 0
        let H = 0
        const resize = () => {
            W = root.offsetWidth
            H = root.offsetHeight
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.max(1, Math.round(W * dpr))
            canvas.height = Math.max(1, Math.round(H * dpr))
        }
        const ro = new ResizeObserver(resize)
        ro.observe(root)
        resize()

        let mx = 0.5
        let my = 0.5
        let tx = 0.5
        let ty = 0.5
        let over = 0
        let hov = 0
        let down = 0
        let dn = 0
        const onMove = (e: PointerEvent) => {
            if (W <= 0 || H <= 0) return
            tx = e.offsetX / W
            ty = 1 - e.offsetY / H
            over = 1
        }
        const onLeave = () => {
            over = 0
        }
        const onDown = (e: PointerEvent) => {
            onMove(e)
            down = 1
        }
        const onUp = () => {
            down = 0
        }
        canvas.addEventListener("pointermove", onMove)
        canvas.addEventListener("pointerleave", onLeave)
        canvas.addEventListener("pointerdown", onDown)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)

        let clock = 0
        let raf = 0
        let last = -1
        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 1 / 20)
            last = now
            const p = propsRef.current
            clock = (clock + dt * (Math.max(0, Math.min(100, num(p.speed, 50))) / 50) * (reduced ? 0.25 : 1)) % 3600
            const k = 1 - Math.exp(-dt * 6)
            mx += (tx - mx) * k
            my += (ty - my) * k
            hov += (over - hov) * k
            dn += (down - dn) * (1 - Math.exp(-dt * 5))
            const bg = parseColor(p.background, [0.03, 0.03, 0.04, 1])
            const base = parseColor(p.baseColor, [0.23, 0.18, 0.55, 1])
            const acc = parseColor(p.accentColor, [0.91, 0.42, 0.57, 1])
            gl.viewport(0, 0, canvas.width, canvas.height)
            gl.uniform2f(u("uRes"), canvas.width, canvas.height)
            gl.uniform1f(u("uTime"), clock)
            gl.uniform2f(u("uMouse"), mx, my)
            // Raw 0..1: the FRAG scales it by the Advanced `hover` row (RULES.md).
            gl.uniform1f(u("uHover"), hov)
            gl.uniform1f(u("uDown"), dn)
            gl.uniform3f(u("uBg"), bg[0], bg[1], bg[2])
            gl.uniform3f(u("uBase"), base[0], base[1], base[2])
            gl.uniform3f(u("uAccent"), acc[0], acc[1], acc[2])
            gl.uniform1f(u("uScale"), Math.max(10, Math.min(300, num(p.scale, 100))) / 100)
            effectUniforms(gl, u, p)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
        }
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("pointerleave", onLeave)
            canvas.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
        }
    }, [])

    return (
        <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", minWidth: 1200, minHeight: 800, overflow: "hidden", background, ...style }}>
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
        </div>
    )
}

