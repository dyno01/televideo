'use client'

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import '@videojs/react/video/skin.css'
import { createPlayer } from '@videojs/react'
import { VideoSkin, Video as VjsVideo, videoFeatures } from '@videojs/react/video'
import { Video, saveProgress, API_BASE } from '@/lib/api'
import { AlertCircle, Play, Pause, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const Player = createPlayer({ features: videoFeatures })

interface VideoPlayerProps {
  video: Video
}

export interface VideoPlayerHandle {
  seekTo: (t: number) => void
  getCurrentTime: () => number
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({ video }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [streamError, setStreamError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const streamUrl = `${API_BASE}/api/stream/${video.id}`
  const telegramUrl = video.channel_username ? `https://t.me/${video.channel_username}/${video.message_id}` : null

  useImperativeHandle(ref, () => ({
    seekTo: (t: number) => { if (videoRef.current) videoRef.current.currentTime = t },
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
  }))

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      if (video.last_timestamp > 5) {
        videoRef.current.currentTime = video.last_timestamp
      }
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) videoRef.current.play()
    else videoRef.current.pause()
    resetControlsTimeout()
  }

  const skip = (seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime += seconds
    resetControlsTimeout()
  }

  const resetControlsTimeout = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 1500)
  }

  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        if (videoRef.current) {
          const durationToUse = isNaN(videoRef.current.duration) || videoRef.current.duration === 0 
            ? video.duration 
            : videoRef.current.duration;
            
          const safeDuration = durationToUse > 0 ? durationToUse : 1;
          
          saveProgress(video.id, videoRef.current.currentTime, safeDuration).catch(() => {})
        }
      }, 5000)
      resetControlsTimeout()
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      setShowControls(true)
    }
    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current) }
  }, [isPlaying, video.id])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!videoRef.current) return

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'j': skip(-10); break
        case 'l': skip(10); break
        case 'f':
          if (document.fullscreenElement) document.exitFullscreen()
          else videoRef.current.parentElement?.requestFullscreen()
          break
        case 'arrowright': skip(5); break
        case 'arrowleft': skip(-5); break
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [])

  return (
    <div className="w-full flex justify-center">
      <Card 
        className="relative w-full max-w-[1400px] overflow-hidden bg-black border-none shadow-2xl rounded-2xl group/player"
        onMouseMove={resetControlsTimeout}
        onClick={resetControlsTimeout}
      >
        <div className="relative w-full h-full max-h-[85vh] aspect-video">
          <Player.Provider>
            <VideoSkin className="w-full h-full">
              <VjsVideo
                ref={videoRef}
                src={streamUrl}
                playsInline
                className="w-full h-full object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setStreamError(true)}
              />
            </VideoSkin>
          </Player.Provider>

          {/* Cinematic Centered Controls */}
          {!streamError && (
            <div className={cn(
              "absolute inset-0 z-40 flex items-center justify-center gap-8 bg-black/20 transition-opacity duration-300",
              showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
            )}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 text-white shrink-0 transition-transform active:scale-90"
                onClick={(e) => { e.stopPropagation(); skip(-10); }}
              >
                <RotateCcw size={28} />
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-3xl border border-white/10 text-white shadow-2xl shrink-0 transition-transform active:scale-90"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              >
                {isPlaying ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1" />}
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 text-white shrink-0 transition-transform active:scale-90"
                onClick={(e) => { e.stopPropagation(); skip(10); }}
              >
                <RotateCw size={28} />
              </Button>

            </div>
          )}

          {streamError && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-8 text-center">
              <div className="p-4 rounded-full bg-destructive/10 mb-6">
                <AlertCircle className="w-12 h-12 text-destructive" />
              </div>
              <h3 className="text-xl font-bold mb-3 tracking-tight">Stream Connection Interrupted</h3>
              <p className="text-muted-foreground text-sm max-w-[320px] mb-8 leading-relaxed">
                The content could not be retrieved from the server. Try refreshing or use the original link.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="font-bold h-11 px-6 rounded-xl" onClick={() => window.location.reload()}>
                  Retry Connection
                </Button>
                {telegramUrl && (
                  <Button asChild className="font-bold h-11 px-6 rounded-xl">
                    <a href={telegramUrl} target="_blank" rel="noopener noreferrer">
                      Original Link
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'
export default VideoPlayer
