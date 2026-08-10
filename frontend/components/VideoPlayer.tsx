'use client'

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
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
  ListVideo
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(initialPercentage)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isWaiting, setIsWaiting] = useState(false)
  const [hasStreamError, setHasStreamError] = useState(false)
  const [streamErrorDetails, setStreamErrorDetails] = useState('')
  const hasSeekedInitialRef = useRef(false)

  // Seek ripple: { side: 'left'|'right'|'center', icon: 'ccw'|'cw'|'play'|'pause', key: number }
  const [seekRipple, setSeekRipple] = useState<{ side: 'left' | 'right' | 'center'; icon: 'ccw'|'cw'|'play'|'pause'; key: number } | null>(null)

  const triggerSeekRipple = (side: 'left' | 'right' | 'center', icon: 'ccw'|'cw'|'play'|'pause') => {
    setSeekRipple({ side, icon, key: Date.now() })
    setTimeout(() => setSeekRipple(null), 700)
  }

  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
      if (videoRef.current) {
        videoRef.current.currentTime = seconds
      }
    },
    play: () => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    },
    getCurrentTime: () => {
      return videoRef.current?.currentTime ?? 0
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
    const DOUBLE_TAP_DELAY = 300
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
        skip(-10)
        triggerSeekRipple('left', 'ccw')
      } else if (x > width * 0.65) {
        skip(10)
        triggerSeekRipple('right', 'cw')
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
      <video
        ref={videoRef}
        src={`${getApiBase()}/api/stream/${video.id}${getMediaTokenQuery()}`}
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
                {seekRipple.side === 'left' ? '-10s' : '+10s'}
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
          className="relative h-1.5 w-full bg-white/10 rounded-full cursor-pointer mb-6 pointer-events-auto group/progress"
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
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

        {/* Main Controls Rack */}
        <div className="flex items-center justify-between pointer-events-auto mt-2 lg:mt-0">
          <div className="flex items-center gap-4 lg:gap-6">
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
             <div className="flex items-center gap-3 ml-2 group/vol">
                <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="text-white/60 hover:text-white drop-shadow-md">
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <div className="w-0 group-hover/vol:w-16 h-1 bg-white/10 rounded-full overflow-hidden transition-all duration-300">
                   <div className="h-full bg-white w-full opacity-50" />
                 </div>
             </div>
          </div>

          <div className="relative flex items-center gap-3 lg:gap-5">
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
                  className={cn(
                    "text-white/40 hover:text-white transition-colors drop-shadow-md",
                    isFullscreen ? "flex" : "flex xl:hidden"
                  )}
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
