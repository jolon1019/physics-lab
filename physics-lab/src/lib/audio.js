let ctx = null
let masterGain = null

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    masterGain = ctx.createGain()
    masterGain.gain.value = 1
    masterGain.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 一次性音（带自然衰减包络）
export function playTone({ freq = 440, duration = 1, volume = 0.3, type = 'sine', harmonics = null } = {}) {
  const c = ensureAudio()
  if (!c) return null
  const now = c.currentTime
  const osc = c.createOscillator()
  if (harmonics) {
    const imag = new Float32Array([0, ...harmonics])
    osc.setPeriodicWave(c.createPeriodicWave(new Float32Array(imag.length), imag))
  } else {
    osc.type = type
  }
  osc.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(g)
  g.connect(masterGain)
  osc.start(now)
  osc.stop(now + duration + 0.1)
  return osc
}

// 持续音（可实时改频/改音量，stop 时淡出）
export function createTone({ freq = 440, volume = 0.3, type = 'sine', harmonics = null } = {}) {
  const c = ensureAudio()
  if (!c) return null
  const osc = c.createOscillator()
  if (harmonics) {
    const imag = new Float32Array([0, ...harmonics])
    osc.setPeriodicWave(c.createPeriodicWave(new Float32Array(imag.length), imag))
  } else {
    osc.type = type
  }
  osc.frequency.value = freq
  const g = c.createGain()
  g.gain.value = volume
  osc.connect(g)
  g.connect(masterGain)
  osc.start()
  let stopped = false
  return {
    setFreq(f) {
      if (!stopped) osc.frequency.setTargetAtTime(f, c.currentTime, 0.02)
    },
    setVolume(v) {
      if (!stopped) g.gain.setTargetAtTime(v, c.currentTime, 0.05)
    },
    stop() {
      if (stopped) return
      stopped = true
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.05)
      setTimeout(() => {
        try {
          osc.stop()
        } catch (e) {}
      }, 400)
    }
  }
}

// 噪声（white / brown）
export function playNoise({ duration = 1.2, volume = 0.3, type = 'white', cutoff = null } = {}) {
  const c = ensureAudio()
  if (!c) return
  const now = c.currentTime
  const len = Math.max(1, Math.floor(c.sampleRate * duration))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02
      data[i] = last * 3.5
    } else {
      data[i] = w
    }
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.06)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.15)
  if (cutoff) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    src.connect(f)
    f.connect(g)
  } else {
    src.connect(g)
  }
  g.connect(masterGain)
  src.start(now)
  src.stop(now + duration)
}
