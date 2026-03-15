'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  ChevronRight, 
  Share2, 
  Download,
  Clock,
  Layout,
  ExternalLink
} from 'lucide-react'
import { getVideo, getVideos, getBatchSequence, getVideoFiles, Video, TelegramFile } from '@/lib/api'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/VideoPlayer'
import NotesPanel from '@/components/NotesPanel'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, cleanTitle } from '@/lib/utils'

export default function VideoPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = parseInt(params.id as string, 10)

  const [video, setVideo] = useState<Video | null>(null)
  const [channelVideos, setChannelVideos] = useState<Video[]>([])
  const [videoFiles, setVideoFiles] = useState<TelegramFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'playlist' | 'notes'>('playlist')
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
        if (v.batch_id) {
          getBatchSequence(v.batch_id).then(seq => {
            const vids = seq.filter(i => i.item_type === 'video') as Video[]
            setChannelVideos(vids)
          }).catch(() => [])
        } else if (v.channel_username) {
          getVideos(v.channel_username).then(setChannelVideos).catch(() => [])
        }
        getVideoFiles(videoId).then(setVideoFiles).catch(() => [])
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'The requested lecture could not be retrieved.')
      })
      .finally(() => setLoading(false))
  }, [videoId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-[#09090b]">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
        <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">Initializing context...</p>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#09090b]">
        <Card className="max-w-md w-full p-10 text-center border-zinc-800 bg-zinc-900/50 space-y-8 rounded-[32px] shadow-2xl">
          <AlertCircle size={64} className="mx-auto text-zinc-700" />
          <div className="space-y-3">
            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Playback Interrupted</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">{error || 'Resource not found.'}</p>
          </div>
          <Button variant="outline" className="w-full font-bold h-12 rounded-xl border-zinc-800 hover:bg-white hover:text-black transition-all" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Return Home
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {/* Top Navigation */}
      <header className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-zinc-900 bg-[#09090b]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={video.channel_username ? `/channel/${video.channel_username}` : '/'}
            className="flex items-center justify-center p-2 rounded-full hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800 shrink-0"
          >
            <ArrowLeft size={18} className="text-zinc-400" />
          </Link>
          <div className="flex flex-col min-w-0">
            <h1 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] truncate">Video Studio</h1>
            <h2 className="text-base lg:text-lg font-black text-white leading-tight tracking-tight truncate">
              {cleanTitle(video.title)}
            </h2>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <Button variant="outline" className="h-9 px-4 rounded-lg bg-zinc-950 border-zinc-800 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 transition-all">
            <Share2 size={14} className="mr-2" /> Share
          </Button>
        </div>
      </header>

      {/* --- Main Studio Layout --- */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8 lg:gap-12 px-4 lg:px-12 pt-6 lg:pt-10 pb-12 overflow-hidden">
        
        {/* Left Column: Player & Meta */}
        <div className="flex flex-col gap-6 lg:gap-10 overflow-y-auto pr-2 no-scrollbar">
          
          {/* Cinematic Player */}
          <VideoPlayer
            video={video}
            ref={playerRef}
            initialPercentage={video.watched_percentage}
            onPrev={() => {
              const idx = channelVideos.findIndex(v => v.id === videoId)
              if (idx > 0) {
                router.push(`/video/${channelVideos[idx - 1].id}`)
              }
            }}
            onNext={() => {
              const idx = channelVideos.findIndex(v => v.id === videoId)
              if (idx !== -1 && idx < channelVideos.length - 1) {
                router.push(`/video/${channelVideos[idx + 1].id}`)
              }
            }}
          />

          {/* Video Meta Section */}
          <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
            <div className="flex flex-col gap-4 max-w-2xl">
              <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                In this lecture, we explore the core principles of {cleanTitle(video.title)}.
                We'll dive deep into the architecture, best practices, and real-world implementations
                to ensure a comprehensive understanding of the topic.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
               <Button className="h-10 lg:h-12 px-6 lg:px-8 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 transition-all">
                  <Download size={16} className="lg:mr-3 mr-2" /> Assets
               </Button>
               <Button className="h-10 lg:h-12 px-6 lg:px-8 rounded-xl bg-white text-zinc-950 font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all">
                  <Share2 size={16} className="lg:mr-3 mr-2" /> Share
               </Button>
            </div>
          </div>

          {/* Linked Resources Strip */}
          {videoFiles && videoFiles.length > 0 && (
             <div className="pt-8 lg:pt-10 border-t border-zinc-900">
                <FileLibrary files={videoFiles} channelUsername={video.channel_username || ''} />
             </div>
          )}
        </div>

        {/* Right Column: Dynamic Sidebar (Playlist & Notes) */}
        <div className="flex flex-col gap-8 h-full min-h-[500px] xl:h-[calc(100vh-140px)] border-t lg:border-t-0 lg:border-l border-zinc-900 pt-8 lg:pt-0 lg:pl-8">
          
          {/* Universal Tab Switcher */}
          <div className="flex items-center p-1 bg-zinc-900/50 rounded-xl mb-8 self-start border border-white/5">
             <button
               onClick={() => setActiveTab('playlist')}
               className={cn(
                 "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                 activeTab === 'playlist' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
               )}
             >
               Playlist
             </button>
             <button
               onClick={() => setActiveTab('notes')}
               className={cn(
                 "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                 activeTab === 'notes' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
               )}
             >
               Notes
             </button>
          </div>

          <div className={cn("flex flex-col gap-8 h-full", activeTab === 'playlist' ? 'flex' : 'hidden')}>
            <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
              <LectureList
                videos={channelVideos}
                currentVideoId={videoId}
                channelUsername={video.channel_username || ''}
              />
            </div>
          </div>

          <div className={cn("flex flex-col gap-8 h-full", activeTab === 'notes' ? 'flex' : 'hidden')}>
            <NotesPanel videoId={videoId} playerRef={playerRef} />
          </div>
        </div>
      </div>
    </main>
  )
}
