'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertCircle, Loader2, ChevronRight, Info, Layers, ExternalLink, Clock, BarChart3, StickyNote } from 'lucide-react'
import { getVideo, getVideos, getBatchSequence, getVideoFiles, Video, TelegramFile } from '@/lib/api'
import { VideoPlayerHandle } from '@/components/VideoPlayer'
import VideoPlayer from '@/components/VideoPlayer'
import NotesPanel from '@/components/NotesPanel'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, cleanTitle, truncateTitle } from '@/lib/utils'

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = parseInt(params.id as string, 10)

  const [video, setVideo] = useState<Video | null>(null)
  const [channelVideos, setChannelVideos] = useState<Video[]>([])
  const [videoFiles, setVideoFiles] = useState<TelegramFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNotes, setShowNotes] = useState(true) // Collapsible sidebar state
  const playerRef = useRef<VideoPlayerHandle>(null)

  useEffect(() => {
    if (isNaN(videoId)) { 
      setError('Invalid video ID specified in the navigation path.')
      setLoading(false) 
      return 
    }

    setLoading(true)
    getVideo(videoId)
      .then(async (v) => {
        setVideo(v)
        // Load architectural context (batch or channel)
        if (v.batch_id) {
          getBatchSequence(v.batch_id).then(seq => {
            const vids = seq.filter(i => i.item_type === 'video') as Video[]
            setChannelVideos(vids)
          }).catch(() => [])
        } else if (v.channel_username) {
          getVideos(v.channel_username).then(setChannelVideos).catch(() => [])
        }
        // Associated materials
        getVideoFiles(videoId).then(setVideoFiles).catch(() => [])
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'The requested lecture could not be retrieved.')
      })
      .finally(() => setLoading(false))
  }, [videoId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Initializing context...</p>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full p-8 text-center border-destructive/20 bg-destructive/5 space-y-6">
          <AlertCircle size={48} className="mx-auto text-destructive" />
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-destructive">Playback Interrupted</h3>
            <p className="text-sm text-destructive/80 leading-relaxed font-medium">{error || 'Resource not found.'}</p>
          </div>
          <Button variant="outline" className="w-full font-bold h-11" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Return Home
          </Button>
        </Card>
      </div>
    )
  }

  // Navigation Logic: Find current sequence boundaries
  const currentIdx = channelVideos.findIndex(v => v.id === videoId)
  const prevVideoId = currentIdx > 0 ? channelVideos[currentIdx - 1].id : null
  const nextVideoId = currentIdx !== -1 && currentIdx < channelVideos.length - 1 ? channelVideos[currentIdx + 1].id : null

  const telegramUrl = video.channel_username ? `https://t.me/${video.channel_username}/${video.message_id}` : null

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* --- High-Density Context Header --- */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="icon" asChild className="shrink-0 h-9 w-9 rounded-xl hover:bg-muted">
              <Link href={video.channel_username ? `/channel/${video.channel_username}` : '/'}>
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            
            <div className="flex flex-col min-w-0">
               <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 whitespace-nowrap">
                    {video.channel_title || 'Workspace'}
                  </span>
                  <ChevronRight size={10} className="text-muted-foreground/30" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                    Now Playing
                  </span>
               </div>
               <h1 className="text-sm lg:text-base font-bold truncate leading-tight">
                 {cleanTitle(video.title)}
               </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
              <div className="hidden md:flex items-center gap-2 border-r border-border/50 pr-4">
                 <Badge variant="secondary" className="bg-primary/5 text-primary border-none flex items-center gap-1.5 px-2.5 h-6 text-[10px] font-bold uppercase tracking-wider">
                   <Clock size={12} /> {formatDuration(video.duration)}
                 </Badge>
                 {video.watched_percentage > 0 && (
                   <Badge variant="outline" className={cn(
                     "flex items-center gap-1.5 px-2.5 h-6 text-[10px] font-bold border-none uppercase tracking-wider",
                     video.completed === 1 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-600"
                   )}>
                     <BarChart3 size={12} /> {video.completed === 1 ? 'Finished' : `${Math.round(video.watched_percentage)}%`}
                   </Badge>
                 )}
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/20 border border-border/10 backdrop-blur-md">
                  {prevVideoId !== null && (
                    <Button variant="ghost" size="sm" asChild className="h-9 px-4 rounded-xl font-bold text-xs hover:bg-background hover:shadow-lg transition-all">
                      <Link href={`/video/${prevVideoId}`}>
                        <ChevronRight className="w-4 h-4 mr-1.5 rotate-180" /> Previous
                      </Link>
                    </Button>
                  )}
                  {nextVideoId !== null && (
                    <Button variant="default" size="sm" asChild className="h-9 px-6 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/30 transition-all active:scale-95 border-none">
                      <Link href={`/video/${nextVideoId}`}>
                        Next Lecture <ChevronRight className="w-4 h-4 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
                  <Button 
                    variant={showNotes ? "default" : "secondary"} 
                    size="sm" 
                    onClick={() => setShowNotes(!showNotes)}
                    className={cn(
                      "h-9 px-4 rounded-xl font-bold text-xs transition-all",
                      showNotes ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <StickyNote className={cn("w-4 h-4 mr-2", showNotes && "animate-pulse")} />
                    <span className="hidden sm:inline">{showNotes ? 'Hide Notes' : 'Show Notes'}</span>
                    <span className="sm:hidden">Notes</span>
                  </Button>

                  {video.channel_username && (
                    <Button variant="secondary" size="sm" asChild className="h-9 px-4 rounded-xl font-bold text-xs">
                      <Link href={`/channel/${video.channel_username}?tab=batches`}>
                        <Layers className="w-4 h-4 mr-2 text-primary" />
                        <span className="hidden sm:inline">Batches</span>
                      </Link>
                    </Button>
                  )}

                  {telegramUrl && (
                    <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-xl border-border/50 hover:bg-muted">
                      <a href={telegramUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
              </div>
          </div>
        </div>
      </header>

      {/* --- Main Immersive Studio Layout --- */}
      <div className={cn(
        "max-w-[1920px] mx-auto w-full p-4 lg:p-6 grid gap-6 flex-1 min-h-0 overflow-hidden transition-all duration-500",
        showNotes ? "grid-cols-1 xl:grid-cols-[1fr_400px]" : "grid-cols-1"
      )}>
        
        {/* Playback & Exploration Layer */}
        <div className="flex flex-col gap-6 lg:h-full min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 rounded-3xl lg:border lg:border-border/10 bg-muted/5 h-full">
            <div className="space-y-8 p-4 lg:p-6">
              {/* Cinematic Player Centerpiece */}
              <VideoPlayer video={video} ref={playerRef} />
              
              {/* --- High-Visibility Sequential Discovery --- */}
              {channelVideos.length > 0 && (
                <div className="space-y-6 pt-6 border-t border-border/20">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground/80">
                        {video.batch_id ? 'Batch Playlist' : 'Course Sequence'}
                      </h2>
                    </div>
                    {video.batch_id && (
                      <Badge variant="outline" className="h-7 px-4 rounded-full text-[10px] font-black uppercase tracking-widest border-primary/20 bg-primary/10 text-primary shadow-sm">
                        {cleanTitle(video.batch_name || 'Curated')}
                      </Badge>
                    )}
                  </div>
                  
                  <Card className="border-none bg-muted/10 p-1 rounded-[32px] overflow-hidden">
                    <LectureList videos={channelVideos} channelUsername={video.channel_username || ''} currentVideoId={videoId} />
                  </Card>
                </div>
              )}

              {/* --- Grid Layout: Materials & Detail --- */}
              {videoFiles.length > 0 && (
                <div className="space-y-6 pt-10 border-t border-border/10">
                   <div className="flex items-center gap-3 px-1">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <h2 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground/80">
                        Associated Materials
                      </h2>
                   </div>
                   <Card className="bg-card/30 border-border/10 p-6 rounded-[32px] shadow-none">
                     <FileLibrary files={videoFiles} channelUsername={video?.channel_username || ''} />
                   </Card>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Studio Utilities Sidebar (Persistent on Desktop, Collapsible) */}
        {showNotes && (
          <aside className="lg:h-full lg:overflow-hidden min-w-0 animate-in slide-in-from-right-4 duration-500">
            <NotesPanel videoId={videoId} playerRef={playerRef} />
          </aside>
        )}
      </div>
    </main>
  )
}
