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
  }

  public setResumeTime(seconds: number) {
    this.targetResumeTime = seconds
    this.initialSeekDone = false
  }

  private getUUID(): string {
    return 'listener_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
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
      const id = this.getUUID()
      payload.listener = id
      this.pendingCallbacks.set(id, callback)
    }

    if (!this.isReady && method !== 'addEventListener') {
      this.queue.push(payload)
      return
    }

    this.sendRaw(payload)
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

    if (!data || data.context !== 'player.js') return

    // 1. Ready event
    if (data.event === 'ready') {
      this.isReady = true

      // Re-register all subscribed events to Streamtape iframe
      this.listeners.forEach((_, eventName) => {
        this.sendRaw({
          context: 'player.js',
          version: '0.0.11',
          method: 'addEventListener',
          value: eventName,
          listener: `listener_${eventName}`
        })
      })

      // Flush queue
      while (this.queue.length > 0) {
        const item = this.queue.shift()
        this.sendRaw(item)
      }

      const readyCbs = this.listeners.get('ready')
      if (readyCbs) {
        readyCbs.forEach(cb => cb(data.value))
      }
      return
    }

    // 2. Pending method callbacks (e.g. getDuration, getCurrentTime)
    if (data.listener && this.pendingCallbacks.has(data.listener)) {
      const cb = this.pendingCallbacks.get(data.listener)
      this.pendingCallbacks.delete(data.listener)
      if (cb) cb(data.value)
    }

    // 3. Events (timeupdate, play, pause, ended, error)
    if (data.event) {
      const cbs = this.listeners.get(data.event)

      // Normalize timeupdate value
      if (data.event === 'timeupdate') {
        let sec = 0
        let dur = 0
        if (typeof data.value === 'number') {
          sec = data.value
        } else if (data.value && typeof data.value === 'object') {
          sec = data.value.seconds ?? data.value.currentTime ?? 0
          dur = data.value.duration ?? 0
        }

        // Apply resume smoothly on first playback progress if requested
        if (!this.initialSeekDone && this.targetResumeTime > 2) {
          this.initialSeekDone = true
          this.setCurrentTime(this.targetResumeTime)
        }

        if (cbs) {
          cbs.forEach(cb => cb({ seconds: sec, duration: dur }))
        }
      } else if (data.event === 'play') {
        // Apply initial resume on play once
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
    if (Math.abs(s - this.lastSeekTime) < 1 && now - this.lastSeekTimestamp < 1200) {
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler)
    }
    this.listeners.clear()
    this.pendingCallbacks.clear()
    this.queue = []
  }
}
