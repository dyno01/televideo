/**
 * Embedly Player.js Specification Client
 * Implements the open standard: http://playerjs.io/ & https://github.com/embedly/player.js
 * Used for controlling Streamtape embeds (play, pause, seek, volume, timeupdate, getDuration).
 */

export interface PlayerJSEvents {
  ready?: (data?: any) => void
  play?: () => void
  pause?: () => void
  ended?: () => void
  timeupdate?: (data: { seconds: number; duration: number }) => void
  progress?: (data: { percent: number }) => void
  error?: (error: any) => void
}

export class StreamtapePlayerJS {
  private iframe: HTMLIFrameElement
  private isReady: boolean = false
  private queue: any[] = []
  private listeners: Map<string, Set<(data?: any) => void>> = new Map()
  private messageHandler: (e: MessageEvent) => void
  private pendingCallbacks: Map<string, (val: any) => void> = new Map()
  private initialSeekDone: boolean = false
  private targetResumeTime: number = 0
  private lastSeekTime: number = -1
  private lastSeekTimestamp: number = 0
  private pollInterval: any = null
  private cachedDuration: number = 0

  constructor(iframe: HTMLIFrameElement, resumeTime: number = 0) {
    this.iframe = iframe
    this.targetResumeTime = resumeTime

    this.messageHandler = this.handleMessage.bind(this)
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler)
    }

    // Register ready event listener with iframe
    this.sendRaw({
      context: 'player.js',
      version: '0.0.11',
      method: 'addEventListener',
      value: 'ready',
      listener: 'listener_ready'
    })

    // Start polling timer to guarantee realtime progress tracking every second
    this.startPolling()
  }

  public setResumeTime(seconds: number) {
    if (Math.abs(this.targetResumeTime - seconds) > 3) {
      this.targetResumeTime = seconds
      this.initialSeekDone = false
    }
  }

  private getUUID(prefix: string = 'listener'): string {
    return `${prefix}_` + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
  }

  private sendRaw(payload: any) {
    if (!this.iframe?.contentWindow) return
    try {
      const json = JSON.stringify(payload)
      this.iframe.contentWindow.postMessage(json, '*')
    } catch (_) {}
  }

  private send(method: string, value?: any, callback?: (val: any) => void) {
    const payload: any = {
      context: 'player.js',
      version: '0.0.11',
      method
    }

    if (value !== undefined) {
      payload.value = value
    }

    if (callback) {
      const id = this.getUUID(`listener_${method}`)
      payload.listener = id
      this.pendingCallbacks.set(id, callback)
    }

    // Allow getters and event listeners to pass through immediately
    const immediateMethods = ['addEventListener', 'removeEventListener', 'getCurrentTime', 'getDuration']
    if (!this.isReady && !immediateMethods.includes(method)) {
      this.queue.push(payload)
      return
    }

    this.sendRaw(payload)
  }

  private startPolling() {
    if (this.pollInterval || typeof window === 'undefined') return
    // Poll getCurrentTime every 1000ms
    this.pollInterval = setInterval(() => {
      this.getCurrentTime((seconds) => {
        if (typeof seconds === 'number' && seconds >= 0) {
          const dur = this.cachedDuration || 0
          this.emitTimeUpdate(seconds, dur)
        }
      })

      if (!this.cachedDuration) {
        this.getDuration((d) => {
          if (typeof d === 'number' && d > 0) this.cachedDuration = d
        })
      }
    }, 1000)
  }

  private emitTimeUpdate(sec: number, dur: number) {
    // Apply resume smoothly on first playback progress if requested
    if (!this.initialSeekDone && this.targetResumeTime > 2) {
      this.initialSeekDone = true
      if (Math.abs(sec - this.targetResumeTime) > 3) {
        this.setCurrentTime(this.targetResumeTime)
      }
    }

    const cbs = this.listeners.get('timeupdate')
    if (cbs) {
      cbs.forEach(cb => cb({ seconds: sec, duration: dur }))
    }
  }

  private handleMessage(e: MessageEvent) {
    if (!e.data) return

    let data: any
    if (typeof e.data === 'string') {
      try {
        data = JSON.parse(e.data)
      } catch (_) {
        return
      }
    } else if (typeof e.data === 'object') {
      data = e.data
    } else {
      return
    }

    if (!data) return

    // Verify context or common Player.js message signatures
    const isPlayerJS = data.context === 'player.js' || data.event || data.method
    if (!isPlayerJS) return

    // Any valid communication from iframe indicates it's ready
    if (!this.isReady) {
      this.isReady = true
      while (this.queue.length > 0) {
        const item = this.queue.shift()
        this.sendRaw(item)
      }
    }

    // 1. Ready event
    if (data.event === 'ready') {
      this.listeners.forEach((_, eventName) => {
        this.sendRaw({
          context: 'player.js',
          version: '0.0.11',
          method: 'addEventListener',
          value: eventName,
          listener: `listener_${eventName}`
        })
      })

      const readyCbs = this.listeners.get('ready')
      if (readyCbs) {
        readyCbs.forEach(cb => cb(data.value))
      }
      return
    }

    // 2. Pending method callbacks mapped by listener token
    if (data.listener && this.pendingCallbacks.has(data.listener)) {
      const cb = this.pendingCallbacks.get(data.listener)
      this.pendingCallbacks.delete(data.listener)
      if (cb) cb(data.value)
    }

    // 3. Responses to getCurrentTime
    if (data.event === 'getCurrentTime' || data.method === 'getCurrentTime') {
      let sec: number | null = null
      if (typeof data.value === 'number') sec = data.value
      else if (data.value && typeof data.value.seconds === 'number') sec = data.value.seconds
      else if (typeof data.seconds === 'number') sec = data.seconds
      else if (typeof data.currentTime === 'number') sec = data.currentTime

      if (sec !== null && sec >= 0) {
        // Resolve any matching pending callbacks
        this.pendingCallbacks.forEach((cb, id) => {
          if (id.startsWith('listener_getCurrentTime') || !data.listener || data.listener === id) {
            cb(sec)
            this.pendingCallbacks.delete(id)
          }
        })
        this.emitTimeUpdate(sec, this.cachedDuration || 0)
      }
      return
    }

    // 4. Responses to getDuration
    if (data.event === 'getDuration' || data.method === 'getDuration') {
      let dur: number | null = null
      if (typeof data.value === 'number') dur = data.value
      else if (data.value && typeof data.value.duration === 'number') dur = data.value.duration
      else if (typeof data.duration === 'number') dur = data.duration

      if (dur !== null && dur > 0) {
        this.cachedDuration = dur
        this.pendingCallbacks.forEach((cb, id) => {
          if (id.startsWith('listener_getDuration') || !data.listener || data.listener === id) {
            cb(dur)
            this.pendingCallbacks.delete(id)
          }
        })
      }
      return
    }

    // 5. Events (timeupdate, play, pause, ended, error)
    if (data.event) {
      const cbs = this.listeners.get(data.event)

      // Normalize timeupdate value
      if (data.event === 'timeupdate') {
        let sec = 0
        let dur = this.cachedDuration || 0
        if (typeof data.value === 'number') {
          sec = data.value
        } else if (data.value && typeof data.value === 'object') {
          sec = data.value.seconds ?? data.value.currentTime ?? 0
          if (data.value.duration && data.value.duration > 0) {
            dur = data.value.duration
            this.cachedDuration = dur
          }
        } else if (typeof data.seconds === 'number') {
          sec = data.seconds
          if (data.duration && data.duration > 0) {
            dur = data.duration
            this.cachedDuration = dur
          }
        }
        this.emitTimeUpdate(sec, dur)
      } else if (data.event === 'play') {
        if (!this.initialSeekDone && this.targetResumeTime > 2) {
          this.initialSeekDone = true
          this.setCurrentTime(this.targetResumeTime)
        }
        if (cbs) cbs.forEach(cb => cb(data.value))
      } else {
        if (cbs) cbs.forEach(cb => cb(data.value))
      }
    }
  }

  public on(event: string, callback: (data?: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)

    // Register event with iframe
    this.sendRaw({
      context: 'player.js',
      version: '0.0.11',
      method: 'addEventListener',
      value: event,
      listener: `listener_${event}`
    })
  }

  public off(event: string, callback: (data?: any) => void) {
    const cbs = this.listeners.get(event)
    if (cbs) {
      cbs.delete(callback)
      if (cbs.size === 0) {
        this.listeners.delete(event)
        this.send('removeEventListener', event)
      }
    }
  }

  public play() {
    this.send('play')
  }

  public pause() {
    this.send('pause')
  }

  public setCurrentTime(seconds: number) {
    const s = Math.max(0, Math.round(seconds * 10) / 10)
    const now = Date.now()
    if (Math.abs(s - this.lastSeekTime) < 2 && now - this.lastSeekTimestamp < 2000) {
      return
    }
    this.lastSeekTime = s
    this.lastSeekTimestamp = now

    // Official Embedly Player.js spec:
    this.send('setCurrentTime', s)
  }

  public getCurrentTime(callback: (seconds: number) => void) {
    this.send('getCurrentTime', undefined, callback)
  }

  public getDuration(callback: (duration: number) => void) {
    this.send('getDuration', undefined, callback)
  }

  public setVolume(volume: number) {
    this.send('setVolume', volume)
  }

  public mute() {
    this.send('mute')
  }

  public unmute() {
    this.send('unmute')
  }

  public destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler)
    }
    this.listeners.clear()
    this.pendingCallbacks.clear()
    this.queue = []
  }
}
