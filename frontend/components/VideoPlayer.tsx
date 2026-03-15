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
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Video, API_BASE } from '@/lib/api'

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void
  getCurrentTime: () => number
}

interface VideoPlayerProps {
  video: Video
  onProgress?: (percentage: number) => void
  initialPercentage?: number
  onEnded?: () => void
  onPrev?: () => void
  onNext?: () => void
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({ video, onProgress, initialPercentage = 0, onEnded, onPrev, onNext }, ref) => {
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

  const speeds = [1, 1.25, 1.5, 2]

  const cycleSpeed = () => {
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    const nextSpeed = speeds[nextIndex]
    setPlaybackSpeed(nextSpeed)
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed
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
    getCurrentTime: () => {
      return videoRef.current?.currentTime ?? 0
    }
  }))

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const handleLoadedMetadata = () => {
      setDuration(v.duration)
      if (initialPercentage > 0) {
        v.currentTime = (initialPercentage / 100) * v.duration
      }
    }

    const handleTimeUpdate = () => {
      if (!v.duration) return
      const p = (v.currentTime / v.duration) * 100
      setProgress(p)
      setCurrentTime(v.currentTime)
      if (onProgress && Math.abs(p - progress) > 1) {
        onProgress(p)
      }
    }

    const handleWaiting = () => setIsWaiting(true)
    const handlePlaying = () => setIsWaiting(false)

    v.addEventListener('loadedmetadata', handleLoadedMetadata)
    v.addEventListener('timeupdate', handleTimeUpdate)
    v.addEventListener('waiting', handleWaiting)
    v.addEventListener('playing', handlePlaying)
    v.addEventListener('canplay', handlePlaying)
    v.addEventListener('ended', onEnded || (() => {}))

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata)
      v.removeEventListener('timeupdate', handleTimeUpdate)
      v.removeEventListener('waiting', handleWaiting)
      v.removeEventListener('playing', handlePlaying)
      v.removeEventListener('canplay', handlePlaying)
      v.removeEventListener('ended', onEnded || (() => {}))
    }
  }, [video.id, onProgress])

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
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
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

  const handleVideoClick = (e: React.MouseEvent) => {
    const now = Date.now()
    const DOUBLE_TAP_DELAY = 300
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const isRightSide = x > rect.width / 2

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected -> skip
      skip(isRightSide ? 10 : -10)
      lastTapRef.current = 0 
    } else {
      // Single tap detected -> toggle controls visibility
      if (showControls) {
        setShowControls(false)
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
      } else {
        resetControlsTimeout()
      }
      lastTapRef.current = now
    }
  }

  return (
    <div 
      className="relative group bg-zinc-950 rounded-2xl overflow-hidden aspect-video border border-zinc-900 shadow-2xl"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => !isDragging && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={`${API_BASE}/api/stream/${video.id}`}
        className="w-full h-full object-contain"
        onClick={handleVideoClick}
        playsInline
      />

      {/* --- Immersive Controls Layer --- */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-500 flex flex-col justify-end p-6 z-20 pointer-events-none",
        showControls || isDragging ? "opacity-100" : "opacity-0"
      )}>
        
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
             <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:scale-110 transition-transform drop-shadow-lg">
               {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" />}
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

          <div className="flex items-center gap-4 lg:gap-6">
             <button 
                onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
                className="flex items-center justify-center h-7 lg:h-8 px-2 lg:px-3 rounded-lg bg-white/5 border border-white/10 text-[9px] lg:text-[10px] font-black text-white hover:bg-white/10 transition-all tracking-widest drop-shadow-md"
             >
                {playbackSpeed}X
             </button>
             <button 
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="text-white/40 hover:text-white transition-colors drop-shadow-md"
             >
                <Maximize size={18} />
             </button>
          </div>
        </div>
      </div>

      {/* Centered Controls: Play, RotateCcw, RotateCw */}
      {showControls && (
        <div className="absolute inset-0 flex items-center justify-center gap-6 lg:gap-12 z-10 pointer-events-none -translate-y-8 lg:translate-y-0">
          {/* Buffering/Loading Spinner */}
          {isWaiting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px] z-20 pointer-events-none">
              <Loader2 className="animate-spin text-white/80" size={48} />
            </div>
          )}

           <button 
             onClick={(e) => { e.stopPropagation(); skip(-10); }}
             className="size-10 lg:size-14 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-95 pointer-events-auto shadow-2xl"
           >
              <RotateCcw size={20} className="lg:size-6" />
           </button>
           
           <button 
             onClick={(e) => { e.stopPropagation(); togglePlay(); }}
             className="size-14 lg:size-20 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-95 pointer-events-auto shadow-2xl"
           >
              {isPlaying ? <Pause size={28} className="lg:size-8" fill="currentColor" /> : <Play size={28} className="lg:size-8 ml-1" fill="currentColor" />}
           </button>

           <button 
             onClick={(e) => { e.stopPropagation(); skip(10); }}
             className="size-10 lg:size-14 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-95 pointer-events-auto shadow-2xl"
           >
              <RotateCw size={20} className="lg:size-6" />
           </button>
        </div>
      )}
    </div>
  )
})

VideoPlayer.displayName = "VideoPlayer"

export default VideoPlayer
