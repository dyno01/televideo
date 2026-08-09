'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Play,
  CheckCircle2,
  ListOrdered
} from 'lucide-react'
import { 
  getVideo, 
  getVideos,
  getFiles,
  getVideoFiles, 
  getBatchSequence, 
  saveProgress, 
  getVideoTags, 
  addVideoTag, 
  removeVideoTag, 
  getApiBase,
  Video, 
  TelegramFile, 
  VideoTag, 
  SequenceItem, 
  API_BASE 
} from '@/lib/api'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/VideoPlayer'
import NotesPanel from '@/components/NotesPanel'
import LectureList from '@/components/LectureList'
import DocumentModal from '@/components/DocumentModal'
import TelegramAuthModal from '@/components/TelegramAuthModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn, cleanTitle, formatDuration } from '@/lib/utils'

export default function VideoPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = parseInt(params.id as string, 10)

  const [video, setVideo] = useState<Video | null>(null)
  const [channelVideos, setChannelVideos] = useState<Video[]>([])
  const [channelFiles, setChannelFiles] = useState<TelegramFile[]>([])
  const [batchSequence, setBatchSequence] = useState<SequenceItem[]>([])
  const [videoFiles, setVideoFiles] = useState<TelegramFile[]>([])
  const [tags, setTags] = useState<VideoTag[]>([])
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'playlist' | 'notes'>('playlist')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isTagging, setIsTagging] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<TelegramFile | null>(null)

  const playerRef = useRef<VideoPlayerHandle>(null)
  const lastSavedRef = useRef<{ time: number; ts: number }>({ time: 0, ts: 0 })
  const currentPosRef = useRef<{ currentTime: number; duration: number }>({ currentTime: 0, duration: 0 })

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('app_passcode_token') : null
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return { headers, token }
  }

  // --- PROGRESS PERSISTENCE (100% Reliable across mobile & desktop) ---
  const persistProgress = useCallback((currentTime: number, duration: number, force: boolean = false) => {
    if (!videoId || isNaN(videoId) || !duration || duration <= 0) return

    currentPosRef.current = { currentTime, duration }

    const now = Date.now()
    if (!force && Math.abs(currentTime - lastSavedRef.current.time) < 3 && now - lastSavedRef.current.ts < 3000) {
      return
    }

    lastSavedRef.current = { time: currentTime, ts: now }

    const { headers } = getAuthHeaders()
    const apiBase = getApiBase()

    fetch(`${apiBase}/api/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ videoId, currentTime, duration }),
      keepalive: true,
    }).catch(() => {})
  }, [videoId])

  // Save progress on unmount / navigation
  useEffect(() => {
    return () => {
      const { currentTime, duration } = currentPosRef.current
      if (videoId && duration > 0) {
        const { headers } = getAuthHeaders()
        const apiBase = getApiBase()
        fetch(`${apiBase}/api/progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ videoId, currentTime, duration }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [videoId])

  // Save progress on mobile visibilitychange, pagehide & beforeunload
  useEffect(() => {
    const handleUnload = () => {
      const { currentTime, duration } = currentPosRef.current
      if (videoId && duration > 0) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('app_passcode_token') : null
        const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : ''
        const apiBase = getApiBase()
        const blob = new Blob([JSON.stringify({ videoId, currentTime, duration })], { type: 'application/json' })
        navigator.sendBeacon(`${apiBase}/api/progress${tokenQuery}`, blob)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleUnload()
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [videoId])

  // Load video & batch/channel context
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
          // Load batch sequence (contains both videos & files in order)
          getBatchSequence(v.batch_id).then(seq => {
            setBatchSequence(seq)
            // Do NOT set channelVideos here — avoid duplication
          }).catch(() => [])
        } else if (v.channel_username) {
          // No batch — load all channel videos as playlist
          getVideos(v.channel_username).then(setChannelVideos).catch(() => [])
        }
        if (v.channel_username) {
          getFiles(v.channel_username).then(setChannelFiles).catch(() => [])
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

  const handleNavigateToVideo = (targetVideoId: number) => {
    // Save current progress before navigating to next/prev video
    const { currentTime, duration } = currentPosRef.current
    if (duration > 0) {
      persistProgress(currentTime, duration, true)
    }
    router.push(`/video/${targetVideoId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-[#0a0a0b]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">Initializing Video Studio...</p>
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

  const backHref = video.channel_username 
    ? (video.batch_id ? `/channel/${video.channel_username}?tab=batches&batchId=${video.batch_id}` : `/channel/${video.channel_username}`)
    : '/'

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-zinc-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-zinc-800 bg-[#111113] sticky top-0 z-50">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={backHref}
            onClick={() => {
              const { currentTime, duration } = currentPosRef.current
              if (duration > 0) persistProgress(currentTime, duration, true)
            }}
            className="flex items-center text-sm font-semibold text-zinc-400 hover:text-zinc-50 transition-colors shrink-0"
          >
            <ArrowLeft size={16} className="mr-2" />
            {video.batch_name ? `Batch: ${video.batch_name}` : (video.channel_title || video.channel_username || 'Channel')}
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
            initialTimestamp={video.last_timestamp}
            onOpenTelegramAuth={() => setIsAuthModalOpen(true)}
            onTimeUpdate={(c, d) => persistProgress(c, d, false)}
            onPause={(c, d) => persistProgress(c, d, true)}
            onEnded={() => {
              if (video.duration) {
                persistProgress(video.duration, video.duration, true)
              }
              const idx = channelVideos.findIndex(v => v.id === videoId)
              if (idx !== -1 && idx < channelVideos.length - 1) {
                handleNavigateToVideo(channelVideos[idx + 1].id)
              }
            }}
            onPrev={() => {
              const idx = channelVideos.findIndex(v => v.id === videoId)
              if (idx > 0) {
                handleNavigateToVideo(channelVideos[idx - 1].id)
              }
            }}
            onNext={() => {
              const idx = channelVideos.findIndex(v => v.id === videoId)
              if (idx !== -1 && idx < channelVideos.length - 1) {
                handleNavigateToVideo(channelVideos[idx + 1].id)
              }
            }}
          />

          <div className="p-4 lg:p-8 flex flex-col gap-8 max-w-[1200px] mx-auto w-full">
            <div className="space-y-4">
              <h1 className="text-xl lg:text-3xl font-bold text-zinc-50 tracking-tight">
                {cleanTitle(video.title)}
              </h1>

              <div className="flex items-center gap-3 text-xs text-zinc-400 font-medium">
                <span className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-lg text-indigo-300 font-semibold">
                  {formatDuration(video.duration)}
                </span>
                {video.watched_percentage > 0 && (
                  <span className="text-zinc-400">• {Math.round(video.watched_percentage)}% Watched</span>
                )}
              </div>
              
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
                          <Button 
                            variant="secondary" 
                            className="flex-1 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 h-8 text-xs rounded-lg"
                            onClick={() => setSelectedDoc(file)}
                          >
                            <ExternalLink size={14} className="mr-2" /> View
                          </Button>
                          <Button variant="secondary" className="flex-1 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 h-8 text-xs rounded-lg" asChild>
                            <a href={`${API_BASE}/api/stream/file/${file.id}`}>
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
                 {video.batch_id ? 'Batch Sequence' : 'Playlist'}
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
              {video.batch_id && video.batch_name ? (
                <div className="p-4 border-b border-zinc-800 bg-[#18181b] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Serial Batch Curriculum</p>
                    <p className="text-xs font-bold text-zinc-50 truncate max-w-[220px]">{video.batch_name}</p>
                  </div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
                    {batchSequence.filter(i => i.item_type === 'video' && (i as Video).completed).length} / {batchSequence.filter(i => i.item_type === 'video').length} Done
                  </Badge>
                </div>
              ) : null}
              
              <ScrollArea className="h-full flex-1">
                <div className="p-3 pb-16 space-y-2">
                  {(() => {
                    // If we have a batch sequence, render items in their original order (videos + files mixed)
                    // Otherwise fall back to channelVideos + channelFiles
                    const hasBatchSeq = batchSequence.length > 0

                    if (hasBatchSeq) {
                      // Deduplicate batch sequence items by id+type
                      const seenKeys = new Set<string>()
                      const deduped = batchSequence.filter(item => {
                        const key = `${item.item_type}-${item.id}`
                        if (seenKeys.has(key)) return false
                        seenKeys.add(key)
                        return true
                      })
                      let videoIdx = 0
                      return (
                        <div className="space-y-1.5">
                          {deduped.map((item) => {
                            if (item.item_type === 'video') {
                              const vid = item as Video
                              const isCurrent = vid.id === videoId
                              const isCompleted = vid.completed === 1 || (vid.watched_percentage || 0) >= 90
                              videoIdx++
                              const vIdx = videoIdx
                              return (
                                <div
                                  key={`bseq-v-${vid.id}`}
                                  onClick={() => { if (!isCurrent) handleNavigateToVideo(vid.id) }}
                                  className={cn(
                                    "group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                                    isCurrent
                                      ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                                      : "bg-[#18181b]/40 border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className={cn(
                                      "size-7 rounded-md flex items-center justify-center shrink-0 font-bold text-[11px]",
                                      isCurrent ? "bg-indigo-600 text-white" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                                    )}>
                                      {isCurrent ? (
                                        <Play size={12} fill="currentColor" />
                                      ) : isCompleted ? (
                                        <CheckCircle2 size={12} />
                                      ) : (
                                        <span>{vIdx}</span>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className={cn(
                                        "text-xs font-semibold truncate leading-tight",
                                        isCurrent ? "text-indigo-200" : "text-zinc-300 group-hover:text-white"
                                      )}>
                                        {cleanTitle(vid.title)}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono shrink-0 pl-2">
                                      <span>{formatDuration(vid.duration || 0)}</span>
                                      {vid.watched_percentage > 0 && !isCompleted && (
                                        <span className="text-indigo-400 font-bold">({Math.round(vid.watched_percentage)}%)</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            } else {
                              // file item
                              const file = item as TelegramFile
                              const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
                              return (
                                <div
                                  key={`bseq-f-${file.id}`}
                                  onClick={() => setSelectedDoc(file)}
                                  className="group flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/15 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="size-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                      <FileText size={13} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-medium text-zinc-200 group-hover:text-white truncate" title={file.file_name}>
                                        {file.file_name}
                                      </h5>
                                      <p className="text-[10px] text-zinc-500">
                                        {ext || 'FILE'} • {file.file_size ? (file.file_size / 1024 / 1024).toFixed(1) + ' MB' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-indigo-300 hover:text-white hover:bg-indigo-600/20">
                                    View <ExternalLink size={12} className="ml-1" />
                                  </Button>
                                </div>
                              )
                            }
                          })}
                        </div>
                      )
                    }

                    // Fallback: no batch — show channel videos then channel+video files
                    const vidMap = new Map<number, Video>()
                    channelVideos.forEach(v => vidMap.set(v.id, v))
                    const uniquePlaylistVideos = Array.from(vidMap.values())

                    const fileMap = new Map<number, TelegramFile>()
                    videoFiles.forEach(f => fileMap.set(f.id, f))
                    channelFiles.forEach(f => fileMap.set(f.id, f))
                    const uniquePlaylistFiles = Array.from(fileMap.values())

                    return (
                      <div className="space-y-4">
                        {/* Videos Section */}
                        <div className="space-y-1.5">
                          {uniquePlaylistVideos.map((vid, idx) => {
                            const isCurrent = vid.id === videoId
                            const isCompleted = vid.completed === 1 || (vid.watched_percentage || 0) >= 90
                            return (
                              <div
                                key={`seq-vid-${vid.id}`}
                                onClick={() => {
                                  if (!isCurrent) handleNavigateToVideo(vid.id)
                                }}
                                className={cn(
                                  "group flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                                  isCurrent
                                    ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                                    : "bg-[#18181b]/40 border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700"
                                )}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className={cn(
                                    "size-7 rounded-md flex items-center justify-center shrink-0 font-bold text-[11px]",
                                    isCurrent ? "bg-indigo-600 text-white" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                                  )}>
                                    {isCurrent ? (
                                      <Play size={12} fill="currentColor" />
                                    ) : isCompleted ? (
                                      <CheckCircle2 size={12} />
                                    ) : (
                                      <span>{idx + 1}</span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h5 className={cn(
                                      "text-xs font-semibold truncate leading-tight",
                                      isCurrent ? "text-indigo-200" : "text-zinc-300 group-hover:text-white"
                                    )}>
                                      {cleanTitle(vid.title)}
                                    </h5>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono shrink-0 pl-2">
                                    <span>{formatDuration(vid.duration || 0)}</span>
                                    {vid.watched_percentage > 0 && !isCompleted && (
                                      <span className="text-indigo-400 font-bold">({Math.round(vid.watched_percentage)}%)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* PDFs & Course Resources Section */}
                        {uniquePlaylistFiles.length > 0 && (
                          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">PDFs & Documents</span>
                              <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-300">
                                {uniquePlaylistFiles.length} File{uniquePlaylistFiles.length === 1 ? '' : 's'}
                              </Badge>
                            </div>
                            {uniquePlaylistFiles.map((file) => {
                              const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
                              return (
                                <div
                                  key={`seq-file-${file.id}`}
                                  onClick={() => setSelectedDoc(file)}
                                  className="group flex items-center justify-between p-2.5 rounded-xl bg-[#18181b]/50 border border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div className="size-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                      <FileText size={13} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-medium text-zinc-200 group-hover:text-white truncate" title={file.file_name}>
                                        {file.file_name}
                                      </h5>
                                      <p className="text-[10px] text-zinc-500">
                                        {ext || 'PDF'} • {file.file_size ? (file.file_size / 1024 / 1024).toFixed(1) + ' MB' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-indigo-300 hover:text-white hover:bg-indigo-600/20">
                                    View <ExternalLink size={12} className="ml-1" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}
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

      {selectedDoc && (
        <DocumentModal 
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
          fileUrl={`${API_BASE}/api/stream/file/${selectedDoc.id}`}
          fileName={selectedDoc.file_name || 'Document'}
          mimeType={selectedDoc.mime_type}
        />
      )}

      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </main>
  )
}
