'use client'

import Hls from 'hls.js'
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { 
  Play, 
  Pause, 
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Volume2, 
  VolumeX, 
  Maximize, 
  Settings,
  Tv,
  Type,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  ExternalLink
} from 'lucide-react'
import { cn, getMediaTokenQuery } from '@/lib/utils'
import { Video, getApiBase } from '@/lib/api'

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
}

interface VideoPlayerProps {
  video: Video
  onProgress?: (percentage: number) => void
  initialPercentage?: number
  initialTimestamp?: number
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onPause?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  onPrev?: () => void
  onNext?: () => void
  onOpenTelegramAuth?: () => void
  sidebarContent?: React.ReactNode
  isSidebarOpen?: boolean
  onCloseSidebar?: () => void
  onOpenSidebar?: () => void
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({ 
  video, 
  onProgress, 
  initialPercentage = 0, 
  initialTimestamp = 0,
  onTimeUpdate,
  onPause,
  onEnded, 
  onPrev, 
  onNext, 
  onOpenTelegramAuth,
  sidebarContent,
  isSidebarOpen = false,
  onCloseSidebar,
  onOpenSidebar
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(initialPercentage)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(initialTimestamp || 0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isWaiting, setIsWaiting] = useState(false)
  const [hasStreamError, setHasStreamError] = useState(false)
  const [streamErrorDetails, setStreamErrorDetails] = useState('')
  const hasSeekedInitialRef = useRef(false)

  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [preferNative, setPreferNative] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('preferred_player') === 'native'
    }
    return false
  })
  const mirrors = ['streamta.pe', 'streamtape.com', 'antiadtape.com', 'strcloud.link']
  const [mirrorIndex, setMirrorIndex] = useState(0)
  const currentMirror = mirrors[mirrorIndex % mirrors.length]
  const isStreamtapeReady = !!(video.streamtape_id && video.streamtape_status === 'ready')
  const useStreamtape = isStreamtapeReady && !preferNative

  // Helper to send Player.js formatted postMessage to Streamtape iframe
  const postToIframe = useCallback((method: string, value?: any) => {
    if (!iframeRef.current?.contentWindow) return
    try {
      // 1. Standard Embedly Player.js spec format (with version 0.0.11)
      const msg: any = { context: 'player.js', version: '0.0.11', method }
      if (value !== undefined) msg.value = value
      const jsonStr = JSON.stringify(msg)
      iframeRef.current.contentWindow.postMessage(jsonStr, '*')
      iframeRef.current.contentWindow.postMessage(msg, '*')

      // 2. Also send raw method/value in case player accepts simplified objects
      if (value !== undefined) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify({ method, value }), '*')
      }
    } catch (_) {}
  }, [])

  // Subscribe to all Player.js events and restore initial seek position
  const subscribeToStreamtape = useCallback(() => {
    postToIframe('addEventListener', 'ready')
    postToIframe('addEventListener', 'timeupdate')
    postToIframe('addEventListener', 'play')
    postToIframe('addEventListener', 'pause')
    postToIframe('addEventListener', 'ended')
    postToIframe('addEventListener', 'error')

    const startSec = currentTime || initialTimestamp || 0
    if (startSec > 0) {
      postToIframe('setCurrentTime', startSec)
    }
    postToIframe('getDuration')
  }, [currentTime, initialTimestamp, postToIframe])

  // Bidirectional Player.js Message Sync for Streamtape embed
  useEffect(() => {
    const handleWindowMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (!data) return

        if (data.context === 'player.js' || data.event || data.method) {
          if (data.event === 'ready') {
            subscribeToStreamtape()
          } else if (data.event === 'timeupdate' || data.method === 'getCurrentTime') {
            let sec: number | null = null
            let dur: number = duration || video.duration || 0

            if (typeof data.value === 'number') {
              sec = data.value
            } else if (data.value && typeof data.value === 'object') {
              if (typeof data.value.seconds === 'number') sec = data.value.seconds
              else if (typeof data.value.currentTime === 'number') sec = data.value.currentTime
              if (typeof data.value.duration === 'number' && data.value.duration > 0) dur = data.value.duration
            }

            if (typeof sec === 'number' && sec >= 0) {
              setCurrentTime(sec)
              if (dur > 0) {
                setDuration(dur)
                const pct = (sec / dur) * 100
                setProgress(pct)
                onProgress?.(pct)
              }
              onTimeUpdate?.(sec, dur)
            }
          } else if (data.event === 'pause') {
            onPause?.(currentTime, duration || video.duration || 0)
          } else if (data.event === 'ended') {
            const finalDur = duration || video.duration || 0
            if (finalDur > 0) {
              onTimeUpdate?.(finalDur, finalDur)
              onProgress?.(100)
            }
            onEnded?.()
          } else if (data.method === 'getDuration' && typeof data.value === 'number' && data.value > 0) {
            setDuration(data.value)
          }
        }
      } catch (_) {}
    }

    window.addEventListener('message', handleWindowMessage)
    return () => window.removeEventListener('message', handleWindowMessage)
  }, [currentTime, duration, initialTimestamp, onTimeUpdate, onProgress, onPause, onEnded, video.duration, subscribeToStreamtape])

  // Heartbeat Poller: Periodically query Player.js for currentTime and duration to guarantee progress is tracked
  useEffect(() => {
    if (!useStreamtape) return

    const syncInterval = setInterval(() => {
      postToIframe('getCurrentTime')
      postToIframe('getDuration')
    }, 2000)

    return () => clearInterval(syncInterval)
  }, [useStreamtape, postToIframe])

  const switchToNative = () => {
    setPreferNative(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_player', 'native')
    }
    setTimeout(() => {
      if (videoRef.current && currentTime > 0) {
        videoRef.current.currentTime = currentTime
      }
    }, 100)
  }

  const switchToStreamtape = () => {
    setPreferNative(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_player', 'streamtape')
    }
    setTimeout(() => {
      subscribeToStreamtape()
    }, 500)
  }

  const handleIframeLoad = () => {
    // Send subscription requests at staggered intervals to guarantee the inner player receives them
    ;[300, 800, 1500, 2500].forEach(delay => {
      setTimeout(() => {
        subscribeToStreamtape()
      }, delay)
    })
  }

  // Seek ripple: { side: 'left'|'right'|'center', icon: 'ccw'|'cw'|'play'|'pause', key: number }
  const [seekRipple, setSeekRipple] = useState<{ side: 'left' | 'right' | 'center'; icon: 'ccw'|'cw'|'play'|'pause'; key: number; text?: string } | null>(null)

  const consecutiveSkipsRef = useRef<{ count: number; side: 'left' | 'right'; lastTapTime: number }>({ count: 0, side: 'left', lastTapTime: 0 })

  const triggerSeekRipple = (side: 'left' | 'right' | 'center', icon: 'ccw'|'cw'|'play'|'pause', text?: string) => {
    setSeekRipple({ side, icon, key: Date.now(), text })
    setTimeout(() => setSeekRipple(null), 700)
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]

  const cycleSpeed = () => {
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIndex]
    setPlaybackSpeed(nextSpeed)
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed
  }

  const selectSpeed = (sp: number) => {
    setPlaybackSpeed(sp)
    if (videoRef.current) videoRef.current.playbackRate = sp
    setShowSpeedMenu(false)
  }

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement
    if (!document.fullscreenElement) {
      container?.requestFullscreen().catch(() => {})
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
    }
  }

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      setCurrentTime(seconds)
      if (videoRef.current) {
        videoRef.current.currentTime = seconds
      }
      postToIframe('setCurrentTime', seconds)
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ api: 'seek', set: seconds }), '*')
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ api: 'seek', value: seconds }), '*')
          iframeRef.current.contentWindow.postMessage(`seek:${seconds}`, '*')
        } catch (_) {}
      }
    },
    play: () => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify({
          method: 'play'
        }), '*')
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause()
        setIsPlaying(false)
      }
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify({
          method: 'pause'
        }), '*')
      }
    },
    getCurrentTime: () => {
      return videoRef.current?.currentTime ?? currentTime
    }
  }))

  useEffect(() => {
    hasSeekedInitialRef.current = false
  }, [video.id])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const applyInitialSeek = () => {
      if (hasSeekedInitialRef.current || !v.duration) return
      hasSeekedInitialRef.current = true
      setDuration(v.duration)

      let targetTime = 0
      if (initialTimestamp && initialTimestamp > 0 && initialTimestamp < v.duration - 2) {
        targetTime = initialTimestamp
      } else if (initialPercentage > 0 && initialPercentage < 98) {
        targetTime = (initialPercentage / 100) * v.duration
      }

      if (targetTime > 0) {
        v.currentTime = targetTime
        setCurrentTime(targetTime)
        setProgress((targetTime / v.duration) * 100)
      }
    }

    const handleLoadedMetadata = () => {
      applyInitialSeek()
    }

    const handleCanPlay = () => {
      setIsWaiting(false)
      applyInitialSeek()
    }

    const handleTimeUpdate = () => {
      if (!v.duration) return
      const p = (v.currentTime / v.duration) * 100
      setProgress(p)
      setCurrentTime(v.currentTime)
      if (onTimeUpdate) {
        onTimeUpdate(v.currentTime, v.duration)
      }
      if (onProgress && Math.abs(p - progress) > 1) {
        onProgress(p)
      }
    }

    const handlePauseEvent = () => {
      setIsPlaying(false)
      if (v.duration && onPause) {
        onPause(v.currentTime, v.duration)
      }
    }

    const handleEndedEvent = () => {
      setIsPlaying(false)
      if (v.duration && onTimeUpdate) {
        onTimeUpdate(v.duration, v.duration)
      }
      if (onEnded) {
        onEnded()
      }
    }

    const handleWaiting = () => setIsWaiting(true)
    const handlePlaying = () => setIsWaiting(false)

    v.addEventListener('loadedmetadata', handleLoadedMetadata)
    v.addEventListener('timeupdate', handleTimeUpdate)
    v.addEventListener('waiting', handleWaiting)
    v.addEventListener('playing', handlePlaying)
    v.addEventListener('canplay', handleCanPlay)
    v.addEventListener('pause', handlePauseEvent)
    v.addEventListener('ended', handleEndedEvent)

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata)
      v.removeEventListener('timeupdate', handleTimeUpdate)
      v.removeEventListener('waiting', handleWaiting)
      v.removeEventListener('playing', handlePlaying)
      v.removeEventListener('canplay', handleCanPlay)
      v.removeEventListener('pause', handlePauseEvent)
      v.removeEventListener('ended', handleEndedEvent)
    }
  }, [video.id, initialPercentage, initialTimestamp, onTimeUpdate, onPause, onEnded, onProgress])

  // Synchronize playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, video.id])
  // Video stream source URL
  const videoSourceUrl = `${getApiBase()}/api/stream/${video.id}${getMediaTokenQuery()}`

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl || !videoSourceUrl) return

    let hls: Hls | null = null

    if (videoSourceUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          maxBufferLength: 30,
        })
        hls.loadSource(videoSourceUrl)
        hls.attachMedia(videoEl)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsWaiting(false)
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[HLS] Network error, attempting recovery...')
                hls?.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[HLS] Media error, attempting recovery...')
                hls?.recoverMediaError()
                break
              default:
                hls?.destroy()
                break
            }
          }
        })
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS for Safari / iOS
        videoEl.src = videoSourceUrl
      }
    } else {
      videoEl.src = videoSourceUrl
    }

    return () => {
      if (hls) {
        hls.destroy()
      }
    }
  }, [videoSourceUrl, video.id])



  const togglePlay = () => {
    if (videoRef.current?.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current?.pause()
      setIsPlaying(false)
    }
  }

  const skip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const formatTime = (time: number) => {
    if (!time || time <= 0) return '0:00'
    const hours = Math.floor(time / 3600)
    const mins = Math.floor((time % 3600) / 60)
    const secs = Math.floor(time % 60)
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const [isDragging, setIsDragging] = useState(false)

  const handleSeek = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const progressBar = document.getElementById('video-progress-bar')
    if (!progressBar || !videoRef.current) return

    const rect = progressBar.getBoundingClientRect()
    let clientX: number

    if ('clientX' in e) {
      clientX = e.clientX
    } else {
      clientX = e.touches[0].clientX
    }

    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const newTime = pos * videoRef.current.duration
    
    // Update visual progress immediately
    setProgress(pos * 100)
    setCurrentTime(newTime)
    
    return newTime
  }

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    setIsDragging(true)
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    
    // Initial seek on click
    const newTime = handleSeek(e)
    if (newTime !== undefined && videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  useEffect(() => {
    const handleMouseMoveGlobal = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !videoRef.current) return
      const newTime = handleSeek(e)
      if (newTime !== undefined) {
        videoRef.current.currentTime = newTime
      }
    }

    const handleMouseUpGlobal = () => {
      if (isDragging) {
        setIsDragging(false)
        resetControlsTimeout()
      }
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMoveGlobal)
      window.addEventListener('mouseup', handleMouseUpGlobal)
      window.addEventListener('touchmove', handleMouseMoveGlobal)
      window.addEventListener('touchend', handleMouseUpGlobal)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal)
      window.removeEventListener('mouseup', handleMouseUpGlobal)
      window.removeEventListener('touchmove', handleMouseMoveGlobal)
      window.removeEventListener('touchend', handleMouseUpGlobal)
    }
  }, [isDragging])

  const resetControlsTimeout = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isDragging) setShowControls(false)
    }, 3000)
  }

  const handleMouseMove = () => {
    if (!isDragging) resetControlsTimeout()
  }

  const lastTapRef = useRef<number>(0)
  const lastTapPosRef = useRef<{ x: number; width: number } | null>(null)
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleVideoClick = (e: React.MouseEvent) => {
    const now = Date.now()
    const DOUBLE_TAP_DELAY = 400
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected -> clear single tap timeout
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current)
      
      // Hide controls on double tap
      setShowControls(false)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)

      // Double tap logic
      if (x < width * 0.35) {
        if (now - consecutiveSkipsRef.current.lastTapTime < DOUBLE_TAP_DELAY * 2 && consecutiveSkipsRef.current.side === 'left') {
          consecutiveSkipsRef.current.count += 1
        } else {
          consecutiveSkipsRef.current = { count: 1, side: 'left', lastTapTime: now }
        }
        consecutiveSkipsRef.current.lastTapTime = now
        const totalSkip = consecutiveSkipsRef.current.count * 10
        skip(-10)
        triggerSeekRipple('left', 'ccw', `-${totalSkip}s`)
      } else if (x > width * 0.65) {
        if (now - consecutiveSkipsRef.current.lastTapTime < DOUBLE_TAP_DELAY * 2 && consecutiveSkipsRef.current.side === 'right') {
          consecutiveSkipsRef.current.count += 1
        } else {
          consecutiveSkipsRef.current = { count: 1, side: 'right', lastTapTime: now }
        }
        consecutiveSkipsRef.current.lastTapTime = now
        const totalSkip = consecutiveSkipsRef.current.count * 10
        skip(10)
        triggerSeekRipple('right', 'cw', `+${totalSkip}s`)
      } else {
        toggleFullscreen()
      }
      lastTapRef.current = 0
    } else {
      // Single tap -> defer execution to ensure it's not a double tap
      lastTapRef.current = now
      
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current)
      singleTapTimeoutRef.current = setTimeout(() => {
        if (showControls) {
          setShowControls(false)
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
        } else {
          resetControlsTimeout()
        }
      }, DOUBLE_TAP_DELAY)
    }
  }

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return
      }
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          triggerSeekRipple('center', videoRef.current?.paused ? 'pause' : 'play')
          break
        case 'ArrowLeft':
        case 'j':
          e.preventDefault()
          skip(-10)
          triggerSeekRipple('left', 'ccw')
          break
        case 'ArrowRight':
        case 'l':
          e.preventDefault()
          skip(10)
          triggerSeekRipple('right', 'cw')
          break
        case 'ArrowUp':
          e.preventDefault()
          if (videoRef.current) {
            const newVol = Math.min(1, videoRef.current.volume + 0.1)
            videoRef.current.volume = newVol
            setVolume(newVol)
            setIsMuted(newVol === 0)
            resetControlsTimeout()
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (videoRef.current) {
            const newVol = Math.max(0, videoRef.current.volume - 0.1)
            videoRef.current.volume = newVol
            setVolume(newVol)
            setIsMuted(newVol === 0)
            resetControlsTimeout()
          }
          break
        case 'm':
          e.preventDefault()
          if (videoRef.current) {
            const m = !videoRef.current.muted
            videoRef.current.muted = m
            setIsMuted(m)
            resetControlsTimeout()
          }
          break
        case 'f':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showControls])

  const handleVideoError = async () => {
    setHasStreamError(true)
    try {
      const res = await fetch(`${getApiBase()}/api/stream/${video.id}`, { headers: { Range: 'bytes=0-1' } })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (json.error) {
          setStreamErrorDetails(json.error)
        } else {
          setStreamErrorDetails(`HTTP ${res.status}: Failed to stream video`)
        }
      }
    } catch (e: any) {
      setStreamErrorDetails('Network error connecting to backend API.')
    }
  }

  const handleRetryStream = () => {
    setHasStreamError(false)
    setStreamErrorDetails('')
    if (videoRef.current) {
      videoRef.current.load()
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    // Store touch start X via data attribute
    const touch = e.touches[0]
    if (e.currentTarget) {
      e.currentTarget.setAttribute('data-touch-x', touch.clientX.toString())
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startXStr = e.currentTarget.getAttribute('data-touch-x')
    if (!startXStr) return
    const startX = parseFloat(startXStr)
    const endX = e.changedTouches[0].clientX
    
    // Swipe right to close
    if (endX - startX > 50 && onCloseSidebar) {
      onCloseSidebar()
    }
  }

  return (

    <div 
      className="relative group bg-black rounded-2xl overflow-hidden aspect-video border border-zinc-900 shadow-2xl"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => !isDragging && setShowControls(false)}
    >
      {useStreamtape ? (
        <div className="relative w-full h-full">
          <iframe
            ref={iframeRef}
            src={`https://${currentMirror}/e/${video.streamtape_id}`}
            className="w-full h-full border-0"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            onLoad={handleIframeLoad}
          />
          {/* Streamtape Fast CDN Badge */}
          <div className={cn(
            "absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold backdrop-blur-md shadow-lg pointer-events-none transition-all duration-300",
            showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
          )}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Streamtape ({currentMirror.split('.')[0]})</span>
          </div>

          {/* Controls bar over iframe for sidebar & source toggle */}
          <div className={cn(
            "absolute top-3 right-3 z-40 flex items-center gap-2 transition-all duration-300",
            showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
          )}>
            <a
              href={`https://streamtape.com/v/${video.streamtape_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg backdrop-blur transition-all flex items-center gap-1 shrink-0"
              title="Open video directly on Streamtape website in a new tab (runs at full speed)"
            >
              <span>Open on Streamtape</span>
              <ExternalLink size={12} />
            </a>
            <button
              onClick={() => setMirrorIndex(prev => (prev + 1) % mirrors.length)}
              className="px-2.5 py-1 text-[11px] font-medium bg-zinc-900/90 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/60 shadow backdrop-blur transition-all flex items-center gap-1"
              title="Switch CDN mirror if video is buffering or blocked by your internet provider"
            >
              <span>Mirror: {currentMirror.split('.')[0]}</span>
              <span className="text-zinc-500 text-[10px]">🔄</span>
            </button>
            <button
              onClick={switchToNative}
              className="px-2.5 py-1 text-[11px] font-medium bg-zinc-900/90 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/60 shadow backdrop-blur transition-all"
              title="Switch to our custom HTML5 player with notes and custom scrubber"
            >
              Switch to Our Player
            </button>
            {sidebarContent && (
              <button 
                onClick={(e) => { e.stopPropagation(); if (onOpenSidebar) onOpenSidebar(); }}
                className="p-1.5 rounded-lg bg-zinc-900/90 text-zinc-300 hover:text-white border border-zinc-700/60 shadow backdrop-blur transition-all"
                title="Playlist & Notes"
              >
                <ListVideo size={16} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Streamtape Uploading Status Badge */}
          {video.streamtape_status === 'uploading' && (
            <div className={cn(
              "absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-semibold backdrop-blur-md shadow-lg pointer-events-none transition-all duration-300",
              showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
            )}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>
                {typeof video.upload_percentage === 'number' && video.upload_percentage > 0
                  ? `Uploading to Server: ${video.upload_percentage}% (Streamtape CDN)`
                  : 'Uploading to Server (Streamtape CDN)'}
              </span>
            </div>
          )}

          {/* Streamtape Fast CDN Badge */}
          {isStreamtapeReady && (
            <div className={cn(
              "absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold backdrop-blur-md shadow-lg pointer-events-none transition-all duration-300",
              showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
            )}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Streamtape CDN (0 Bandwidth)</span>
            </div>
          )}

          {isStreamtapeReady && (
            <div className={cn(
              "absolute top-3 right-3 z-30 transition-all duration-300",
              showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
            )}>
              <button
                onClick={switchToStreamtape}
                className="px-2.5 py-1 text-[11px] font-medium bg-zinc-900/90 text-zinc-300 hover:text-white rounded-lg border border-zinc-700/60 shadow backdrop-blur transition-all"
                title="Switch to Streamtape embed player"
              >
                Switch to Streamtape Player
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onClick={handleVideoClick}
            onError={handleVideoError}
            playsInline
          />

      {/* --- Seek Ripple Animation --- */}
      {seekRipple && (
        <div
          key={seekRipple.key}
          className={cn(
            "absolute inset-y-0 z-40 flex items-center justify-center pointer-events-none",
            seekRipple.side === 'left' ? 'left-0 w-1/3' : seekRipple.side === 'right' ? 'right-0 w-1/3' : 'inset-x-0'
          )}
        >
          <div className="animate-ping-once flex flex-col items-center gap-1.5">
            <div className="size-16 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
              {seekRipple.icon === 'ccw' ? (
                <RotateCcw size={26} className="text-white" />
              ) : seekRipple.icon === 'cw' ? (
                <RotateCw size={26} className="text-white" />
              ) : seekRipple.icon === 'pause' ? (
                <Pause size={26} className="text-white" fill="white" />
              ) : (
                <Play size={26} className="text-white ml-0.5" fill="white" />
              )}
            </div>
            {seekRipple.side !== 'center' && (
              <span className="text-white/80 text-xs font-bold drop-shadow">
                {seekRipple.text || (seekRipple.side === 'left' ? '-10s' : '+10s')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* --- Loading Overlay (Visible whenever isWaiting is true) --- */}
      {isWaiting && !hasStreamError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="size-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-2xl">
            <Loader2 size={32} className="animate-spin text-white" />
          </div>
        </div>
      )}

      {/* --- macOS-style Glassmorphic Center Overlay Buttons --- */}
      <div className={cn(
        "absolute inset-0 z-25 flex items-center justify-center gap-4 sm:gap-6 pointer-events-none transition-all duration-300 pb-16 sm:pb-0",
        showControls && !isWaiting ? "opacity-100" : "opacity-0"
      )}>
        {/* Skip Back -10 */}
        <button
          className="pointer-events-auto size-10 sm:size-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:scale-110 active:scale-95 transition-all shadow-2xl"
          onClick={(e) => { e.stopPropagation(); skip(-10); triggerSeekRipple('left', 'ccw'); resetControlsTimeout(); }}
          title="Rewind 10s"
        >
          <RotateCcw className="size-4 sm:size-5" />
        </button>

        {/* Center Play/Pause */}
        <button
          className="pointer-events-auto size-12 sm:size-20 rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 flex items-center justify-center text-white hover:bg-white/25 hover:scale-105 active:scale-95 transition-all shadow-2xl"
          onClick={(e) => { e.stopPropagation(); togglePlay(); resetControlsTimeout(); }}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="size-5 sm:size-8" fill="white" />
          ) : (
            <Play className="size-5 sm:size-8 ml-1" fill="white" />
          )}
        </button>

        {/* Skip Forward +10 */}
        <button
          className="pointer-events-auto size-10 sm:size-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:scale-110 active:scale-95 transition-all shadow-2xl"
          onClick={(e) => { e.stopPropagation(); skip(10); triggerSeekRipple('right', 'cw'); resetControlsTimeout(); }}
          title="Forward 10s"
        >
          <RotateCw className="size-4 sm:size-5" />
        </button>
      </div>

      {/* --- Stream Error Overlay --- */}
      {hasStreamError && (
        <div className="absolute inset-0 z-30 bg-zinc-950/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center gap-4">
          <div className="size-12 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center">
            <Tv size={24} />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-white font-bold text-lg">Unable to Stream Video</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              {streamErrorDetails || 'Telegram session or video file reference may have expired.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <button
              onClick={handleRetryStream}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-bold hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <RotateCw size={14} /> Retry Playback
            </button>

            {onOpenTelegramAuth && (
              <button
                onClick={onOpenTelegramAuth}
                className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold hover:bg-zinc-200 transition-colors flex items-center gap-2"
              >
                <Settings size={14} /> Telegram Login Settings
              </button>
            )}
          </div>
        </div>
      )}


      {/* --- Immersive Controls Layer --- */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-500 flex flex-col justify-end p-3 sm:p-4 lg:p-6 z-20 pointer-events-none",
        showControls || isDragging ? "opacity-100" : "opacity-0"
      )}>

        {/* TOGGLE BUTTON REMOVED FROM HERE, MOVED TO BOTTOM BAR */}
        
        {/* Time Markers Area (Above Progress) */}
        <div className="flex items-center justify-between mb-3 px-1 pointer-events-none">
           <span className="text-[11px] font-bold text-white/90 tabular-nums">
             {formatTime(currentTime)}
           </span>
           <span className="text-[11px] font-bold text-white/40 tabular-nums">
             {formatTime(duration)}
           </span>
        </div>

        {/* Thick Progress Bar */}
        <div 
          id="video-progress-bar"
          className="relative py-4 -my-4 w-full cursor-pointer mb-3 sm:mb-6 pointer-events-auto group/progress"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <div className="relative h-1.5 w-full bg-white/10 rounded-full">
            <div 
              className="absolute h-full bg-white transition-all duration-150 rounded-full"
              style={{ width: `${progress}%` }}
            />
            {/* Draggable Knob */}
            <div 
              className={cn(
                "absolute top-1/2 -translate-y-1/2 size-3 bg-white rounded-full shadow-lg transition-transform scale-0 group-hover/progress:scale-100",
                isDragging && "scale-125"
              )}
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
        </div>

        {/* Main Controls Rack */}
        <div className="flex items-center justify-between pointer-events-auto mt-1 sm:mt-2 lg:mt-0">
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
             <button onClick={(e) => { e.stopPropagation(); onPrev?.(); }} className="text-white/60 hover:text-white transition-colors drop-shadow-md">
               <SkipBack size={20} fill="currentColor" />
             </button>
              <button 
                onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
                className="text-white hover:scale-110 transition-transform drop-shadow-lg p-1"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isWaiting ? (
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                ) : isPlaying ? (
                  <Pause size={26} fill="white" />
                ) : (
                  <Play size={26} fill="white" className="ml-0.5" />
                )}
              </button>
             <button onClick={(e) => { e.stopPropagation(); onNext?.(); }} className="text-white/60 hover:text-white transition-colors drop-shadow-md">
               <SkipForward size={20} fill="currentColor" />
             </button>
             <div className="hidden sm:flex items-center gap-3 ml-2 group/vol">
                <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="text-white/60 hover:text-white drop-shadow-md">
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <div className="w-0 group-hover/vol:w-16 h-1 bg-white/10 rounded-full overflow-hidden transition-all duration-300">
                   <div className="h-full bg-white w-full opacity-50" />
                 </div>
             </div>
          </div>

          <div className="relative flex items-center gap-2 sm:gap-3 lg:gap-5">
             {/* Floating Speed Selection Popover Menu */}
             {showSpeedMenu && (
               <div className="absolute right-0 bottom-12 z-40 p-2.5 rounded-xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 w-48 animate-in fade-in zoom-in-95">
                 <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 flex items-center justify-between">
                   <span>Playback Speed</span>
                   <button onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(false); }} className="text-zinc-500 hover:text-white">
                     <X size={12} />
                   </button>
                 </div>
                 <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                   {speeds.map((sp) => (
                     <button
                       key={sp}
                       onClick={(e) => { e.stopPropagation(); selectSpeed(sp); }}
                       className={cn(
                         "px-2 py-1 rounded-lg text-xs font-bold transition-all text-center",
                         playbackSpeed === sp 
                           ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" 
                           : "bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                       )}
                     >
                       {sp}x
                     </button>
                   ))}
                 </div>
               </div>
             )}

             <button 
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                className={cn(
                  "flex items-center justify-center h-7 lg:h-8 px-2 lg:px-3 rounded-lg border text-[10px] lg:text-xs font-bold transition-all tracking-wider drop-shadow-md",
                  playbackSpeed !== 1 ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                )}
                title="Playback Speed"
             >
                {playbackSpeed}X
             </button>
             
             {sidebarContent && (
               <button 
                  onClick={(e) => { e.stopPropagation(); if (onOpenSidebar) onOpenSidebar(); }}
                  className="flex text-white/40 hover:text-white transition-colors drop-shadow-md"
                  title="Playlist & Notes"
               >
                  <ListVideo size={18} />
               </button>
             )}
             <button 
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="text-white/40 hover:text-white transition-colors drop-shadow-md"
                title="Fullscreen"
             >
                <Maximize size={18} />
             </button>
          </div>
        </div>
      </div>
      </>
      )}
      
      {/* SIDEBAR OVERLAY */}
      {sidebarContent && (
        <>
          <div 
            className={cn(
              "absolute top-0 right-0 h-full bg-[#111113]/95 backdrop-blur-xl border-l border-zinc-800/50 transition-transform duration-300 z-50 flex flex-col w-full sm:w-[400px]",
              isSidebarOpen ? "translate-x-0" : "translate-x-full"
            )}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between p-3 border-b border-zinc-800/50 bg-[#18181b]/50">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-2">Menu</span>
              <button 
                onClick={onCloseSidebar} 
                className="p-1.5 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                title="Close sidebar (Swipe right on mobile)"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {sidebarContent}
            </div>
          </div>


        </>
      )}
    </div>
  )
})

VideoPlayer.displayName = "VideoPlayer"

export default VideoPlayer
