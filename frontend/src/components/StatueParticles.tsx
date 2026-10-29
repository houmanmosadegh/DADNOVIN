import { useEffect, useRef } from 'react'

/**
 * Particle-reveal for the services statue.
 * A transparent WebGL canvas sits exactly under `.sg__statue` (same box,
 * same parallax vars) and renders the 146k-point statue model from
 * /models/statue-points.bin. Soft radial "holes" in the photo layer —
 * CSS mask driven by --hx0…/--hy0…/--hr0… vars — let the gold/white
 * particles show through locally: cursor proximity opens a damped reveal
 * whose points scatter outward into the air, and a few slow ambient
 * patches keep floating dust discoverable on their own.
 *
 * Skips entirely on prefers-reduced-motion — the plain image stays.
 * Pauses when scrolled out of view.
 */

const BLOB_COUNT = 10 // [0] = cursor reveal, [1..3] = arrival wave, [4..9] = ambient patches
// manual silhouette fit — 0.96 keeps the whole cloud safely inside the
// photo's alpha, so dust never pokes out from behind the figure
const FIT = { scale: 0.96, ox: 0, oy: 0 }

/** a point-cloud model + its normalised bounds (measured from the .bin) */
type ModelData = {
  url: string
  n: number
  bounds: { x0: number; x1: number; y0: number; y1: number }
}
const SERVICES_MODEL: ModelData = {
  url: '/models/statue-points.bin',
  n: 146292,
  bounds: { x0: -0.82, x1: 1.04, y0: -1.24, y1: 1.25 },
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aRand;
uniform vec2 uSize;           // canvas buffer px
uniform float uDpr;
uniform vec4 uFit;            // x: scale px/unit, yz: model centre
uniform vec2 uOff;            // manual offset (css px)
uniform vec4 uBlobs[${BLOB_COUNT}]; // xy = css px in statue box, z = radius px, w = strength
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying float vDepth;
varying float vRand;

void main() {
  vec3 q = position - vec3(uFit.y, uFit.z, 0.0);
  vDepth = clamp(q.z / 0.5, -1.0, 1.0);

  float s = uFit.x;
  vec2 px = vec2(q.x * s + uSize.x / uDpr * 0.5,
                 -q.y * s + uSize.y / uDpr * 0.5) + uOff;

  float infl = 0.0;
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${BLOB_COUNT}; i++) {
    vec4 b = uBlobs[i];
    float fi = float(i);
    // irregular smudge — per-blob elliptical squash + angular noise on the
    // radius, so reveals read as rough patches of dust, never clean circles
    vec2 rel = px - b.xy;
    rel *= vec2(0.85 + 0.35 * sin(fi * 1.31 + 0.4),
                0.85 + 0.35 * cos(fi * 1.73 - 0.7));
    float ang = atan(rel.y, rel.x);
    float d = length(rel);
    d *= 1.0 + 0.34 * sin(ang * 3.0 + fi * 2.1) + 0.2 * cos(ang * 5.0 - fi * 1.4);
    // b.z == 0 → smoothstep with equal edges is undefined/NaN — guard it
    float w = (1.0 - smoothstep(b.z * 0.3, max(b.z, 0.001), d)) * b.w;
    // revealed particles rise UP through the surface — the canvas is
    // clipped to the statue's alpha, so they always stay inside the figure
    vec2 dir = normalize(px - b.xy + vec2(0.001));
    vec2 jitter = vec2(sin(aRand * 39.7 + uTime * 1.9), cos(aRand * 57.3 + uTime * 1.4));
    // revealed points scatter into the air — strong upward drift plus
    // turbulent sideways spread so the cloud reads volumetric, not flat
    vec2 lift = vec2(dir.x * 0.1 + jitter.x * 0.44, -(0.82 + 0.3 * aRand));
    disp += lift * w * (22.0 + 34.0 * aRand);
    infl += w;
  }
  px += disp;
  // revealed dust keeps floating upward slowly — continuous air drift
  px.y -= infl * (3.0 + 4.0 * aRand) * (0.5 + 0.5 * sin(uTime * 0.9 + aRand * 43.0));
  // breathing shimmer — sub-pixel drift keeps the cloud alive
  px += vec2(sin(uTime * (0.7 + aRand * 0.7) + aRand * 6.28),
             cos(uTime * (0.6 + aRand * 0.6) + aRand * 9.1)) * 0.5;

  vec2 dpx = px * uDpr;
  gl_Position = vec4(dpx.x / uSize.x * 2.0 - 1.0, 1.0 - dpx.y / uSize.y * 2.0, 0.0, 1.0);
  float depthScale = 1.0 - vDepth * 0.14;
  gl_PointSize = (0.8 + aRand * 1.0) * uDpr * depthScale * (1.0 + infl * 0.45);
  // kept translucent so a fully-revealed cloud reads as fine particles,
  // never a solid white mass
  vAlpha = min(0.9, (0.58 + aRand * 0.32) * (1.0 - vDepth * 0.22) + infl * 0.15);
  vColor = aColor;
  vRand = aRand;
}
`

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vDepth;
varying float vRand;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.16, d) * vAlpha;
  if (a < 0.015) discard;
  // ~88% near-black dust, a rare ~12% bright champagne gold — the sparkle
  // reads as treasure, not noise
  vec3 tint;
  if (vRand < 0.88) {
    float m = smoothstep(0.0, 0.88, vRand);
    tint = mix(vec3(0.045, 0.045, 0.055), vec3(0.15, 0.155, 0.185), m);
  } else {
    float g = (vRand - 0.88) * 8.3;
    tint = vec3(0.9, 0.74, 0.44) * (0.95 + 0.3 * g);
  }
  vec3 lit = mix(vColor, tint, 0.92);
  if (vRand >= 0.88) lit *= 1.3; // only the rare gold sparks glow
  gl_FragColor = vec4(lit, a);
}
`

export function StatueParticles({
  target,
  host,
  className = 'sg__points',
  data = SERVICES_MODEL,
}: {
  /** photo element — gets the hole-mask vars and .is-live */
  target: HTMLElement
  /** pointer/observer scope; defaults to the statue's own section head */
  host?: HTMLElement | null
  className?: string
  data?: ModelData
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const head = host ?? target.closest<HTMLElement>('.sg__head')
    if (!canvas || !head) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let dead = false
    let cleanup: (() => void) | null = null

    const init = async () => {
      const [THREE, buf] = await Promise.all([
        import('three'),
        fetch(data.url).then((r) => {
          if (!r.ok) throw new Error('statue-points.bin missing')
          return r.arrayBuffer()
        }),
      ])
      if (dead) return

      let renderer: InstanceType<typeof THREE.WebGLRenderer>
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          depth: false,
          powerPreference: 'low-power',
        })
      } catch {
        return
      }
      renderer.setClearColor(0x000000, 0)

      const n = data.n
      const pos16 = new Int16Array(buf, 0, n * 3)
      const positions = new Float32Array(n * 3)
      for (let i = 0; i < positions.length; i++) positions[i] = pos16[i] / 16000
      const col8 = new Uint8Array(buf, n * 6, n * 3)
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < colors.length; i++) colors[i] = col8[i] / 255
      const rand = new Float32Array(n)
      for (let i = 0; i < rand.length; i++) rand[i] = Math.random()

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
      geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))

      const uniforms = {
        uSize: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uFit: {
          value: new THREE.Vector4(
            1,
            (data.bounds.x0 + data.bounds.x1) / 2,
            (data.bounds.y0 + data.bounds.y1) / 2,
            1,
          ),
        },
        uOff: { value: new THREE.Vector2(FIT.ox, FIT.oy) },
        uBlobs: {
          value: Array.from({ length: BLOB_COUNT }, () => new THREE.Vector4(-999, -999, 0, 0)),
        },
        uTime: { value: 0 },
      }
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      const scene = new THREE.Scene()
      scene.add(new THREE.Points(geo, mat))
      const cam = new THREE.Camera() // vertex shader maps to clip space itself

      /* ---- sizing: canvas box already matches the img box via CSS ---- */
      const measure = () => {
        const r = canvas.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) return
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        canvas.width = Math.round(r.width * dpr)
        canvas.height = Math.round(r.height * dpr)
        renderer.setSize(r.width, r.height, false)
        uniforms.uSize.value.set(canvas.width, canvas.height)
        uniforms.uDpr.value = dpr
        const spanX = data.bounds.x1 - data.bounds.x0
        const spanY = data.bounds.y1 - data.bounds.y0
        uniforms.uFit.value.x = Math.min(r.width / spanX, r.height / spanY) * FIT.scale
      }
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(canvas)
      ro.observe(target) // cover-fit layouts move with the photo box

      /* ---- pointer state: hover reveal only — no grabbing ---- */
      const EDGE = 34 // px margin around the statue that still counts as "inside"
      let hovering = false
      const mouse = { x: -999, y: -999, tx: -999, ty: -999, s: 0 }

      // interaction space is the particle canvas box (= statue silhouette),
      // not the whole photo — hover near the statue only
      const localPos = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect()
        return {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          in:
            e.clientX - r.left > -EDGE &&
            e.clientY - r.top > -EDGE &&
            e.clientX - r.left < r.width + EDGE &&
            e.clientY - r.top < r.height + EDGE,
        }
      }
      const onMove = (e: PointerEvent) => {
        const p = localPos(e)
        hovering = p.in
        mouse.tx = p.x
        mouse.ty = p.y
        if (mouse.s < 0.02) {
          mouse.x = p.x
          mouse.y = p.y
        }
      }
      const onLeave = () => {
        hovering = false
      }
      window.addEventListener('pointermove', onMove, { passive: true })
      head.addEventListener('pointerleave', onLeave)

      // ambient: six slow lissajous patches — always gliding over the
      // statue, staggered cycles so several are alive at once
      const ambient = [1, 2, 3, 4, 5, 6].map((i) => ({
        f1: 0.14 + i * 0.045,
        f2: 0.12 + i * 0.05,
        f3: 0.13 + i * 0.05,
        p1: i * 2.1,
        p2: i * 4.2,
        period: 6.5 + i * 2.6,
        duty: 0.72,
        phase: i * 3.6,
      }))
      // arrival moment — the first time the section scrolls in, a reveal
      // wave travels down the statue so visitors notice the hidden cloud
      let arriveT = -1 // ms when the section first entered the viewport

      target.classList.add('is-live')

      /* ---- loop ---- */
      let raf = 0
      let running = false
      const t0 = performance.now()
      const tick = (now: number) => {
        if (!running) return
        const t = (now - t0) / 1000
        const r = canvas.getBoundingClientRect()
        const tr = target.getBoundingClientRect()
        const ox = r.left - tr.left // canvas offset inside the photo box
        const oy = r.top - tr.top
        const W = r.width
        const H = r.height

        // cursor blob — finer radius, damped follow
        mouse.x += (mouse.tx - mouse.x) * 0.14
        mouse.y += (mouse.ty - mouse.y) * 0.14
        mouse.s += ((hovering ? 1 : 0) - mouse.s) * 0.09
        const mouseR = W * 0.26 * (0.55 + 0.45 * mouse.s)

        const dampAmb = 1 - 0.85 * mouse.s // interaction wins over ambient
        const blobs: [number, number, number, number][] = [
          [mouse.x, mouse.y, mouseR, mouse.s],
        ]
        // arrival wave — a gold reveal band travels down the statue once
        const ap = arriveT < 0 ? -1 : (now - arriveT) / 2100
        if (ap >= 0 && ap <= 1) {
          const e = ap < 0.5 ? 2 * ap * ap : 1 - Math.pow(-2 * ap + 2, 2) / 2
          const sEnv = Math.sin(Math.min(ap * 1.18, 1) * Math.PI)
          blobs.push(
            [W * 0.5 + W * 0.1 * Math.sin(ap * 9), H * (0.05 + 0.9 * e), W * 0.18, sEnv],
            [W * 0.5 - W * 0.09 * Math.sin(ap * 7), H * (0.16 + 0.78 * e), W * 0.12, sEnv * 0.75],
            [W * (0.3 + 0.4 * Math.sin(ap * 13)), H * (0.3 + 0.4 * Math.cos(ap * 11)), W * 0.09, sEnv * 0.6],
          )
        } else {
          for (const a of ambient) {
            const ct = (t + a.phase) % a.period
            const on = ct / a.period < a.duty
            const env = on ? Math.min(1, ct / 1.4, (a.period * a.duty - ct) / 1.4) : 0
            const x = W * (0.5 + 0.4 * Math.sin(t * a.f1 * Math.PI * 2 + a.p1))
            const y = H * (0.46 + 0.38 * Math.sin(t * a.f2 * Math.PI * 2 + a.p2))
            const rr = W * 0.2 * (0.72 + 0.28 * Math.sin(t * a.f3 * Math.PI * 2))
            blobs.push([x, y, rr, Math.max(0, env) * 0.85 * dampAmb])
          }
        }

        for (let i = 0; i < BLOB_COUNT; i++) {
          const [x, y, rr, s] = blobs[i] ?? [-999, -999, 0, 0]
          uniforms.uBlobs.value[i].set(x, y, rr, s)
          target.style.setProperty(`--hx${i}`, `${(ox + x).toFixed(1)}px`)
          target.style.setProperty(`--hy${i}`, `${(oy + y).toFixed(1)}px`)
          target.style.setProperty(`--hr${i}`, `${(rr * s).toFixed(1)}px`)
        }
        uniforms.uTime.value = t
        renderer.render(scene, cam)
        raf = requestAnimationFrame(tick)
      }
      const start = () => {
        if (running || dead) return
        running = true
        raf = requestAnimationFrame(tick)
      }
      const stop = () => {
        running = false
        cancelAnimationFrame(raf)
      }
      const io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            if (arriveT < 0) arriveT = performance.now()
            start()
          } else {
            stop()
          }
        },
        { rootMargin: '15% 0px' },
      )
      io.observe(head)
      const onVis = () => (document.hidden ? stop() : start())
      document.addEventListener('visibilitychange', onVis)
      start()

      cleanup = () => {
        stop()
        io.disconnect()
        ro.disconnect()
        document.removeEventListener('visibilitychange', onVis)
        head.removeEventListener('pointerleave', onLeave)
        window.removeEventListener('pointermove', onMove)
        target.classList.remove('is-live')
        geo.dispose()
        mat.dispose()
        renderer.dispose()
      }
    }
    init().catch(() => {})
    return () => {
      dead = true
      cleanup?.()
    }
  }, [target])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
