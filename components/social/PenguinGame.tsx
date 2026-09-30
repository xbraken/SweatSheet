'use client'
import { useEffect, useRef, useState } from 'react'
import {
  EMOJI, PENGUIN_Y, airborne, comboActive, magnetised, newGame, score, speedAt, step,
  type Game, type GameEvent, type Obstacle,
} from '@/lib/penguin-game'

// Easter egg on the Friends page: slide down the slope, dodge stuff, grab fish, beat your friends.
// Something to do between sets. Local best is a per-device convenience; the friends board is
// server-side (/api/social/penguin).

const BEST_KEY = 'ss_penguin_best'
type Phase = 'ready' | 'playing' | 'paused' | 'over'
type Row = { username: string; best: number; isMe: boolean }
type Floater = { x: number; y: number; text: string; color: string; life: number }
type Particle = { x: number; y: number; vx: number; vy: number; life: number }

// Scene colours — the slope is always snowy, whatever the app theme
const SNOW = '#eef5fa'
const INK = '#1b2a36'
const TEAL = '#1f8f84'
const GOLD = '#d98a1c'
const BLUE = '#3f7fd9'

function readBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY) || 0) } catch { return 0 }
}
function writeBest(n: number) {
  try { localStorage.setItem(BEST_KEY, String(n)) } catch { /* private mode */ }
}

export default function PenguinGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const phaseRef = useRef<Phase>('ready')
  const keys = useRef({ left: false, right: false })
  // Effects live outside the pure game state
  const trailRef = useRef<{ x: number; y: number }[]>([])
  const fx = useRef({ floaters: [] as Floater[], particles: [] as Particle[], shakeUntil: 0, shakeMag: 0 })
  const [phase, setPhaseState] = useState<Phase>('ready')
  const [final, setFinal] = useState(0)
  const [best, setBest] = useState(0)
  const [newBest, setNewBest] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p) }

  const submitScore = (s: number) =>
    fetch('/api/social/penguin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: s }),
    }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.rows) setRows(d.rows) }).catch(() => {})

  // Friends board; also carries over a best that was only ever saved on this device
  useEffect(() => {
    const local = readBest()
    setBest(local)
    fetch('/api/social/penguin').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.rows) return
      setRows(d.rows)
      const mine = (d.rows as Row[]).find(r => r.isMe)?.best ?? 0
      if (mine > local) { writeBest(mine); setBest(mine) }
      else if (local > mine) submitScore(local)
    }).catch(() => {})
  }, [])

  // Lock page scroll while the game is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Pause when the app is backgrounded (e.g. switching to the rest timer)
  useEffect(() => {
    const onVis = () => { if (document.hidden && phaseRef.current === 'playing') setPhase('paused') }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0
    let raf = 0
    let last = performance.now()
    // Scenery that scrolls with the slope, purely for the sense of speed
    let flakes: { x: number; y: number }[] = []
    let lines: { x: number; y: number; len: number }[] = []

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = wrap.clientWidth
      h = wrap.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      flakes = Array.from({ length: 50 }, () => ({ x: Math.random() * w, y: Math.random() * h }))
      lines = Array.from({ length: 10 }, () => ({ x: Math.random() * w, y: Math.random() * h, len: 40 + Math.random() * 60 }))
      if (!gameRef.current) gameRef.current = newGame(w)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const float = (x: number, y: number, text: string, color: string) =>
      fx.current.floaters.push({ x, y, text, color, life: 1 })
    const burst = (x: number, y: number, n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const s = speed * (0.4 + Math.random() * 0.6)
        fx.current.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4 })
      }
    }
    const shake = (ms: number, mag: number) => { fx.current.shakeUntil = performance.now() + ms; fx.current.shakeMag = mag }

    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case 'fish': float(e.x, e.y, `+${e.points}`, GOLD); navigator.vibrate?.(15); break
        case 'near': float(e.x, e.y, e.combo > 1 ? `×${e.combo} +${e.points}` : `Close! +${e.points}`, TEAL); navigator.vibrate?.(8); break
        case 'jump': float(e.x, e.y - 30, 'Wheee!', INK); break
        case 'ice': float(e.x, e.y - 30, 'Slippery!', BLUE); break
        case 'helmet': float(e.x, e.y, 'Helmet!', INK); break
        case 'magnet': float(e.x, e.y, 'Fish magnet!', BLUE); break
        case 'shield': float(e.x, e.y, 'Saved!', INK); burst(e.x, e.y, 14, 180); shake(180, 4); navigator.vibrate?.(40); break
        case 'crash': burst(e.x, e.y, 26, 260); shake(380, 9); navigator.vibrate?.(120); break
      }
    }

    const drawTerrain = (o: Obstacle) => {
      if (o.kind === 'ice') {
        ctx.fillStyle = 'rgba(170, 215, 245, 0.85)'
        ctx.strokeStyle = 'rgba(120, 180, 225, 0.9)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(o.x, o.y, o.r * 1.4, o.r * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath()
        ctx.moveTo(o.x - o.r * 0.6, o.y - 3); ctx.lineTo(o.x - o.r * 0.1, o.y - 8)
        ctx.moveTo(o.x + o.r * 0.1, o.y + 5); ctx.lineTo(o.x + o.r * 0.6, o.y)
        ctx.stroke()
      } else {
        // Ramp: a snow wedge with its lip at the top (the penguin reaches it going "down")
        const r = o.r
        ctx.fillStyle = '#cddfeb'
        ctx.strokeStyle = '#8fb1c9'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(o.x - r, o.y + r * 0.6)
        ctx.lineTo(o.x + r, o.y + r * 0.6)
        ctx.lineTo(o.x + r * 0.75, o.y - r * 0.6)
        ctx.lineTo(o.x - r * 0.75, o.y - r * 0.6)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = '#6f97b3'
        ctx.lineWidth = 2
        for (const dy of [-4, 5]) {
          ctx.beginPath()
          ctx.moveTo(o.x - 6, o.y + dy + 4); ctx.lineTo(o.x, o.y + dy - 2); ctx.lineTo(o.x + 6, o.y + dy + 4)
          ctx.stroke()
        }
      }
    }

    const draw = (g: Game, now: number) => {
      const py = h * PENGUIN_Y
      const v = speedAt(g.t)
      const f = fx.current
      ctx.save()
      if (now < f.shakeUntil) ctx.translate((Math.random() - 0.5) * f.shakeMag * 2, (Math.random() - 0.5) * f.shakeMag * 2)

      ctx.fillStyle = SNOW
      ctx.fillRect(-10, -10, w + 20, h + 20)
      ctx.fillStyle = '#d3e3ee'
      for (const fl of flakes) ctx.fillRect(fl.x, fl.y, 3, 2)

      // Speed lines fade in once it gets quick
      const lineAlpha = phaseRef.current === 'playing' ? Math.max(0, (v - 450) / 450) * 0.5 : 0
      if (lineAlpha > 0) {
        ctx.strokeStyle = `rgba(150, 180, 200, ${lineAlpha})`
        ctx.lineWidth = 1.5
        for (const l of lines) { ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.len); ctx.stroke() }
      }

      const trail = trailRef.current
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(140, 175, 200, 0.45)'
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(trail[0].x, trail[0].y)
        for (let i = 1; i < trail.length; i++) {
          // Break the groove where the penguin was in the air
          if (trail[i].y - trail[i - 1].y > 30) ctx.moveTo(trail[i].x, trail[i].y)
          else ctx.lineTo(trail[i].x, trail[i].y)
        }
        ctx.stroke()
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const o of g.obstacles) {
        if (o.kind === 'ice' || o.kind === 'ramp') { drawTerrain(o); continue }
        if (o.kind === 'helmet' || o.kind === 'magnet') {
          // Power-ups get a soft halo so they read as "grab me"
          ctx.fillStyle = 'rgba(255, 214, 102, 0.35)'
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 8, 0, Math.PI * 2); ctx.fill()
        }
        ctx.font = `${Math.round(o.r * 2.3)}px serif`
        // Emoji inherit the fill's alpha, so reset it after the translucent halo
        ctx.fillStyle = INK
        ctx.save()
        if (o.vx && o.vx > 0) { ctx.translate(o.x, o.y); ctx.scale(-1, 1); ctx.fillText(EMOJI[o.kind], 0, 0) }
        else ctx.fillText(EMOJI[o.kind], o.x, o.y)
        ctx.restore()
      }

      // Snow spray + crash debris
      ctx.fillStyle = '#c4d9e8'
      for (const p of f.particles) {
        ctx.globalAlpha = Math.min(1, p.life * 2)
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1

      // Penguin — bigger with a shadow while airborne, blinking right after a helmet save
      const inAir = airborne(g)
      const airP = inAir ? 1 - (g.airUntil - g.t) / 0.9 : 0
      const lift = inAir ? Math.sin(Math.PI * airP) : 0
      if (magnetised(g)) {
        ctx.strokeStyle = 'rgba(63, 127, 217, 0.5)'
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(g.px, py, 30 + Math.sin(now / 120) * 3, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }
      if (inAir) {
        ctx.fillStyle = 'rgba(27, 42, 54, 0.15)'
        ctx.beginPath(); ctx.ellipse(g.px, py + 14 + lift * 16, 12 - lift * 4, 5 - lift * 2, 0, 0, Math.PI * 2); ctx.fill()
      }
      const blink = g.t < g.invulnUntil && Math.floor(now / 90) % 2 === 0
      if (!blink) {
        ctx.save()
        ctx.translate(g.px, py - lift * 14)
        ctx.scale(1 + lift * 0.35, 1 + lift * 0.35)
        ctx.rotate(inAir ? Math.sin(airP * Math.PI * 2) * 0.3 : Math.max(-0.5, Math.min(0.5, (g.targetX - g.px) * 0.01)))
        ctx.font = '30px serif'
        ctx.fillStyle = INK
        ctx.fillText(g.over ? '😵' : '🐧', 0, 0)
        if (g.helmet) { ctx.font = '16px serif'; ctx.fillText('⛑️', 2, -17) }
        ctx.restore()
      }

      // Floating "+25", "Close! +5"…
      ctx.font = 'bold 15px Lexend, sans-serif'
      for (const fl of f.floaters) {
        ctx.globalAlpha = Math.min(1, fl.life * 1.5)
        ctx.fillStyle = fl.color
        ctx.fillText(fl.text, fl.x, fl.y)
      }
      ctx.globalAlpha = 1
      ctx.restore()

      // HUD (not shaken)
      ctx.textAlign = 'right'
      ctx.fillStyle = INK
      ctx.font = 'bold 22px Lexend, sans-serif'
      ctx.fillText(String(score(g)), w - 16, 26)
      if (comboActive(g)) {
        ctx.fillStyle = TEAL
        ctx.font = 'bold 13px Lexend, sans-serif'
        ctx.fillText(`×${g.combo} combo`, w - 16, 48)
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const g = gameRef.current!
      const f = fx.current
      if (phaseRef.current === 'playing') {
        if (keys.current.left) g.targetX = Math.max(0, g.targetX - 420 * dt)
        if (keys.current.right) g.targetX = Math.min(w, g.targetX + 420 * dt)
        const events = step(g, dt, w, h)
        const py = h * PENGUIN_Y
        const dy = speedAt(g.t) * dt
        for (const fl of flakes) { fl.y -= dy; if (fl.y < -4) { fl.y = h + Math.random() * 20; fl.x = Math.random() * w } }
        for (const l of lines) { l.y -= dy * 1.6; if (l.y + l.len < 0) { l.y = h + Math.random() * 40; l.x = Math.random() * w } }
        const trail = trailRef.current
        trail.forEach(p => { p.y -= dy })
        if (!airborne(g)) trail.push({ x: g.px, y: py + 8 })
        trailRef.current = trail.filter(p => p.y > -10)
        for (const p of f.particles) p.y -= dy

        // Hard carves throw up snow
        const turn = g.targetX - g.px
        if (Math.abs(turn) > 25 && !airborne(g)) {
          for (let i = 0; i < 2; i++) {
            f.particles.push({ x: g.px - Math.sign(turn) * 10, y: py + 10, vx: -Math.sign(turn) * (60 + Math.random() * 90), vy: -20 + Math.random() * 60, life: 0.35 + Math.random() * 0.25 })
          }
        }

        for (const e of events) onEvent(e)
        if (events.some(e => e.type === 'crash')) {
          const s = score(g)
          const prevBest = readBest()
          setFinal(s)
          setNewBest(s > prevBest)
          if (s > prevBest) { writeBest(s); setBest(s) }
          if (s > 0) submitScore(s)
          setPhase('over')
        }
      }
      // Effects keep animating after a crash so the debris settles
      for (const p of f.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt }
      f.particles = f.particles.filter(p => p.life > 0)
      for (const fl of f.floaters) { fl.y -= 40 * dt; fl.life -= dt }
      f.floaters = f.floaters.filter(fl => fl.life > 0)

      draw(g, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  // Keyboard steering for desktop
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = down
      else if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = down
      else if (down && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); start() }
      else if (down && e.key === 'Escape') onClose()
    }
    const kd = (e: KeyboardEvent) => set(e, true)
    const ku = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  function start() {
    const p = phaseRef.current
    if (p === 'playing') return
    if (p === 'ready' || p === 'over') {
      const w = wrapRef.current?.clientWidth ?? 360
      gameRef.current = newGame(w)
      trailRef.current = []
      fx.current.floaters = []
      fx.current.particles = []
    }
    setPhase('playing')
  }

  // Touch / mouse: the penguin slides toward wherever your finger is
  function steer(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gameRef.current
    if (!g || phaseRef.current !== 'playing') return
    const rect = e.currentTarget.getBoundingClientRect()
    g.targetX = e.clientX - rect.left
  }

  const board = rows && rows.length > 0 && (
    <div className="mt-4 pt-3 border-t border-surface-container-highest/60 text-left">
      <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline mb-1.5">Friends</p>
      <ol className="space-y-1">
        {rows.slice(0, 5).map((r, i) => (
          <li key={r.username} className={`flex items-center gap-2 text-xs ${r.isMe ? 'text-primary-container font-bold' : 'text-on-surface-variant'}`}>
            <span className="w-4 text-outline">{i + 1}</span>
            <span className="flex-1 truncate">{r.isMe ? 'You' : r.username}</span>
            <span className="font-headline">{r.best}</span>
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-surface-container-lowest flex flex-col max-w-[390px] mx-auto animate-slide-up">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onClose} aria-label="Close game" className="text-outline">
          <span className="material-symbols-outlined">close</span>
        </button>
        <p className="font-headline font-bold text-on-surface">Penguin slide</p>
        <p className="text-xs text-outline font-label w-16 text-right">Best {best}</p>
      </div>

      <div ref={wrapRef} className="relative flex-1 mx-3 mb-3 rounded-3xl overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none select-none"
          onPointerDown={e => { if (phaseRef.current === 'playing') steer(e) }}
          onPointerMove={steer}
        />

        {phase !== 'playing' && (
          <button
            onClick={start}
            className="absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <div className="bg-surface-container/95 rounded-2xl px-6 py-5 text-center shadow-xl w-[260px]">
              {phase === 'ready' && <>
                <p className="text-4xl mb-2">🐧</p>
                <p className="font-headline font-bold text-lg text-on-surface">Tap to slide</p>
                <p className="text-xs text-outline mt-1 leading-relaxed">
                  Drag to steer. Dodge 🌲🪨⛄🦭, skim past for combo points, grab 🐟. Ramps jump, 🧊 is slippery, ⛑️ saves you once, 🧲 pulls in fish.
                </p>
              </>}
              {phase === 'paused' && <>
                <p className="font-headline font-bold text-lg text-on-surface">Paused</p>
                <p className="text-xs text-outline mt-1">Tap to keep sliding</p>
              </>}
              {phase === 'over' && <>
                <p className="text-4xl mb-2">{newBest ? '🏆' : '💥'}</p>
                <p className="font-headline font-black text-3xl text-primary-container">{final}</p>
                <p className="text-xs text-outline mt-1">{newBest ? 'New best!' : `Best ${best}`}</p>
                <p className="font-headline font-bold text-sm text-on-surface mt-3">Tap to go again</p>
              </>}
              {phase !== 'paused' && board}
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
