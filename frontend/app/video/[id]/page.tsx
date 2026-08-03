'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  Tag, 
  X, 
  Plus, 
  FileText, 
  Download, 
  ExternalLink,
  Play
} from 'lucide-react'
import { 
  getVideo, 
  getVideos, 
  getVideoFiles, 
  getBatchSequence, 
  saveProgress, 
  getVideoTags, 
  addVideoTag, 
  removeVideoTag, 
  Video, 
  TelegramFile, 
  VideoTag, 
  SequenceItem, 
  API_BASE 
} from '@/lib/api'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/VideoPlayer'
import NotesPanel from '@/components/NotesPanel'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import TelegramAuthModal from '@/components/TelegramAuthModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn, cleanTitle } from '@/lib/utils'

export default function VideoPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = parseInt(params.id as string, 10)

  const [video, setVideo] = useState<Video | null>(null)
  const [channelVideos, setChannelVideos] = useState<Video[]>([])
  const [videoFiles, setVideoFiles] = useState<TelegramFile[]>([])
  const [tags, setTags] = useState<VideoTag[]>([])
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'playlist' | 'notes'>('playlist')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isTagging, setIsTagging] = useState(false)
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
        getVideoTags(videoId).then(setTags).catch(() => [])
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'The requested lecture could not be retrieved.')
      })
      .finally(() => setLoading(false))
  }, [videoId])

  const handleAddTag = async () => {
    const t = newTag.trim().toLowerCase()
    if (!t) return
    setIsTagging(true)
    try {
      const added = await addVideoTag(videoId, t)
      setTags(prev => [...prev, added])
      setNewTag('')
    } catch (e) {
      console.error(e)
    } finally {
      setIsTagging(false)
    }
  }

  const handleRemoveTag = async (id: number) => {
    try {
      await removeVideoTag(id)
      setTags(prev => prev.filter(tag => tag.id !== id))
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-[#0a0a0b]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">Initializing context...</p>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0b]">
        <Card className="max-w-md w-full p-10 text-center border-zinc-800 bg-[#111113] space-y-8 rounded-xl shadow-2xl">
          <AlertCircle size={64} className="mx-auto text-zinc-700" />
          <div className="space-y-3">
            <h3 className="text-2xl font-black text-zinc-50 uppercase tracking-tight">Playback Interrupted</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">{error || 'Resource not found.'}</p>
          </div>
          <Button variant="outline" className="w-full font-bold h-12 rounded-lg border-zinc-800 hover:bg-zinc-50 hover:text-[#0a0a0b] transition-all" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Return Home
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-zinc-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-zinc-800 bg-[#111113] sticky top-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={video.channel_username ? `/channel/${video.channel_username}` : '/'}
            className="flex items-center text-sm font-semibold text-zinc-400 hover:text-zinc-50 transition-colors shrink-0"
          >
            <ArrowLeft size={16} className="mr-2" />
            {video.channel_title || video.channel_username || 'Channel'}
          </Link>
        </div>
        <div className="flex items-center min-w-0 flex-1 justify-center px-4">
            <h2 className="text-sm font-semibold text-zinc-50 truncate max-w-lg">
              {cleanTitle(video.title)}
            </h2>
        </div>
        <div className="w-20 shrink-0"></div>
      </header>

      {/* MAIN AREA */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_400px] bg-[#0a0a0b]">
        
        {/* LEFT COLUMN */}
        <div className="flex flex-col border-r border-zinc-800 bg-[#0a0a0b]">
          
          <VideoPlayer
            video={video}
            ref={playerRef}
            initialPercentage={video.watched_percentage}
            onOpenTelegramAuth={() => setIsAuthModalOpen(true)}
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

          <div className="p-4 lg:p-8 flex flex-col gap-8 max-w-[1200px] mx-auto w-full">
            <div className="space-y-4">
              <h1 className="text-xl lg:text-3xl font-bold text-zinc-50 tracking-tight">
                {cleanTitle(video.title)}
              </h1>
              
              {/* VIDEO TAGS SECTION */}
              <div className="flex flex-wrap items-center gap-2">
                <Tag size={16} className="text-zinc-500 mr-1" />
                {tags.map(tag => (
                  <Badge key={tag.id} variant="secondary" className="bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border-none px-2.5 py-1 rounded-md text-xs">
                    {tag.tag}
                    <button onClick={() => handleRemoveTag(tag.id)} className="ml-2 hover:text-indigo-200">
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
                
                <div className="flex items-center gap-2 ml-2">
                  <Input 
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTag()
                    }}
                    placeholder="Add tag..."
                    className="h-7 w-28 text-xs bg-[#111113] border-zinc-800 focus-visible:ring-indigo-500 rounded-md"
                  />
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={handleAddTag} 
                    disabled={!newTag.trim() || isTagging}
                    className="h-7 px-2 hover:bg-[#18181b] text-zinc-400 rounded-md"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>
            </div>

            {/* ATTACHED MATERIALS */}
            {videoFiles && videoFiles.length > 0 && (
               <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} />
                    Attached Materials
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videoFiles.map(file => (
                      <Card key={file.id} className="bg-[#111113] border-zinc-800 p-4 rounded-xl flex flex-col justify-between gap-4">
                        <div className="flex items-start gap-3 overflow-hidden">
                          <div className="p-2 bg-[#18181b] rounded-lg shrink-0">
                            <FileText size={20} className="text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-50 truncate" title={file.file_name}>{file.file_name}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{(file.file_size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <div className="flex gap-2 w-full">
                          <Button variant="secondary" className="flex-1 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 h-8 text-xs rounded-lg" asChild>
                            <a href={`${API_BASE}/api/file/${file.id}/stream`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink size={14} className="mr-2" /> View
                            </a>
                          </Button>
                          <Button variant="secondary" className="flex-1 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 h-8 text-xs rounded-lg" asChild>
                            <a href={`${API_BASE}/api/file/${file.id}/download`}>
                              <Download size={14} className="mr-2" /> Download
                            </a>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
               </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col bg-[#111113] h-full xl:h-[calc(100vh-3.5rem)] border-t xl:border-t-0 border-zinc-800 xl:sticky xl:top-14">
          
          <div className="flex items-center p-2 border-b border-zinc-800">
             <div className="flex bg-[#18181b] rounded-lg p-1 w-full">
               <button
                 onClick={() => setActiveTab('playlist')}
                 className={cn(
                   "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                   activeTab === 'playlist' ? "bg-zinc-800 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                 )}
               >
                 Playlist
               </button>
               <button
                 onClick={() => setActiveTab('notes')}
                 className={cn(
                   "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                   activeTab === 'notes' ? "bg-zinc-800 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                 )}
               >
                 Notes
               </button>
             </div>
          </div>

          <div className="flex-1 overflow-hidden relative min-h-[400px]">
            <div className={cn("absolute inset-0 flex-col bg-[#111113]", activeTab === 'playlist' ? 'flex' : 'hidden')}>
              {video.batch_id && video.batch_name && (
                <div className="p-4 border-b border-zinc-800 bg-[#18181b]">
                  <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-1">Batch Playlist</p>
                  <p className="text-sm font-bold text-zinc-50 truncate">{video.batch_name}</p>
                </div>
              )}
              <ScrollArea className="h-full flex-1">
                <div className="p-4 pb-12">
                  <LectureList
                    videos={channelVideos}
                    currentVideoId={videoId}
                    channelUsername={video.channel_username || ''}
                  />
                </div>
              </ScrollArea>
            </div>

            <div className={cn("absolute inset-0 flex-col bg-[#111113]", activeTab === 'notes' ? 'flex' : 'hidden')}>
              <NotesPanel 
                videoId={video.id} 
                playerRef={playerRef}
              />
            </div>
          </div>
        </div>
      </div>

      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </main>
  )
}
