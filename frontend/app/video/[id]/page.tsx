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
  ListOrdered,
  Link2,
  UploadCloud,
  Copy,
  Check,
  Video as VideoIcon
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
  linkStreamtapeUrl,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<TelegramFile | null>(null)
  const [seqFilter, setSeqFilter] = useState<'all' | 'videos' | 'files'>('all')

  // Direct Streamtape linking (Bandwidth limit bypass)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [streamtapeLinkInput, setStreamtapeLinkInput] = useState('')
  const [isLinking, setIsLinking] = useState(false)

  const handleLinkStreamtape = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!streamtapeLinkInput.trim() || !video) return
    setIsLinking(true)
    try {
      const res = await linkStreamtapeUrl(video.id, streamtapeLinkInput.trim())
      setVideo(prev => prev ? {
        ...prev,
        streamtape_id: res.streamtape_id,
        streamtape_url: res.streamtape_url,
        streamtape_status: 'ready',
        upload_percentage: 100,
      } : null)
      setIsLinkModalOpen(false)
      setStreamtapeLinkInput('')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to link Streamtape URL.')
    } finally {
      setIsLinking(false)
    }
  }

  const [copiedStream, setCopiedStream] = useState(false)
  const [copiedDownload, setCopiedDownload] = useState(false)

  const handleCopyStreamUrl = () => {
    if (!video) return
    const apiBase = getApiBase()
    const url = `${apiBase}/api/stream/${video.id}`
    navigator.clipboard.writeText(url)
    setCopiedStream(true)
    setTimeout(() => setCopiedStream(false), 2000)
  }

  const handleCopyDownloadUrl = () => {
    if (!video) return
    const apiBase = getApiBase()
    const url = `${apiBase}/api/stream/${video.id}?download=1`
    navigator.clipboard.writeText(url)
    setCopiedDownload(true)
    setTimeout(() => setCopiedDownload(false), 2000)
  }

  const [triggeringUpload, setTriggeringUpload] = useState(false)

  const handleTriggerUpload = async () => {
    if (!video) return
    setTriggeringUpload(true)
    try {
      const { triggerVideoUpload } = await import('@/lib/api')
      await triggerVideoUpload(video.id)
      setVideo(prev => prev ? { ...prev, streamtape_status: 'uploading' } : null)
      alert('Upload queued! Streamtape will now remotely fetch and save this video.')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to trigger Streamtape upload. Make sure your Streamtape API credentials are saved in Telegram Settings.')
    } finally {
      setTriggeringUpload(false)
    }
  }

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
            const vids = seq.filter(i => i.item_type === 'video') as Video[]
            if (vids.length > 0) {
              setChannelVideos(vids)
            }
          }).catch(() => [])
        }

        // Always fetch channel videos so next/prev and video sequence are never empty
        if (v.channel_username) {
          getVideos(v.channel_username).then(allVids => {
            setChannelVideos(prev => {
              if (prev.length > 0) return prev
              if (v.batch_id) {
                const bVids = allVids.filter(x => x.batch_id === v.batch_id)
                return bVids.length > 0 ? bVids : allVids
              }
              return allVids
            })
          }).catch(() => [])
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

  // Automatically poll and switch when Streamtape upload completes or progress updates
  useEffect(() => {
    if (!video || video.streamtape_status === 'ready') return

    const pollInterval = setInterval(async () => {
      try {
        const fresh = await getVideo(videoId)
        if (fresh) {
          setVideo(prev => prev ? { ...prev, ...fresh } : fresh)
          if (fresh.streamtape_status === 'ready') {
            clearInterval(pollInterval)
          }
        }
      } catch (_) {}
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [videoId, video?.streamtape_status])

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

    const sidebarContent = (
    <>
{/* RIGHT COLUMN */}
        <div className="flex flex-col bg-[#111113] h-full">
          
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
              {(() => {
                // Deduplicate and extract all videos
                const seqVids = (batchSequence.filter(i => i.item_type === 'video') as Video[])
                const vidListRaw = seqVids.length > 0 ? seqVids : channelVideos
                const seenVid = new Set<number>()
                const allVideos = vidListRaw.filter(v => {
                  if (seenVid.has(v.id)) return false
                  seenVid.add(v.id)
                  return true
                })

                // Deduplicate and extract all files
                const seqFiles = (batchSequence.filter(i => i.item_type === 'file') as TelegramFile[])
                const fileListRaw = seqFiles.length > 0 ? seqFiles : (channelFiles.length > 0 ? channelFiles : videoFiles)
                const seenFile = new Set<number>()
                const allFiles = fileListRaw.filter(f => {
                  if (seenFile.has(f.id)) return false
                  seenFile.add(f.id)
                  return true
                })

                const completedCount = allVideos.filter(v => v.completed === 1 || (v.watched_percentage || 0) >= 90).length

                return (
                  <>
                    {video.batch_id && video.batch_name ? (
                      <div className="p-3.5 border-b border-zinc-800 bg-[#18181b] flex items-center justify-between shrink-0">
                        <div>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Batch Curriculum</p>
                          <p className="text-xs font-bold text-zinc-50 truncate max-w-[220px]">{video.batch_name}</p>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">
                          {completedCount} / {allVideos.length} Done
                        </Badge>
                      </div>
                    ) : null}

                    {/* Sub-filter tabs */}
                    <div className="flex items-center gap-1.5 p-2 bg-[#18181b]/70 border-b border-zinc-800/80 text-[11px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setSeqFilter('all')}
                        className={cn(
                          "px-2.5 py-1 rounded-md font-medium transition-all",
                          seqFilter === 'all' ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        All ({allVideos.length + allFiles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeqFilter('videos')}
                        className={cn(
                          "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                          seqFilter === 'videos' ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-bold" : "text-zinc-400 hover:text-zinc-200"
                        )}
                      >
                        <Play size={10} fill="currentColor" />
                        Videos ({allVideos.length})
                      </button>
                      {allFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSeqFilter('files')}
                          className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                            seqFilter === 'files' ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          <FileText size={10} />
                          Docs ({allFiles.length})
                        </button>
                      )}
                    </div>

                    <ScrollArea className="h-full flex-1">
                      <div className="p-3 pb-16 space-y-4">
                        {/* Videos List (Shown when 'videos' or 'all') */}
                        {(seqFilter === 'videos' || seqFilter === 'all') && (
                          <div className="space-y-1.5">
                            {seqFilter === 'all' && (
                              <div className="flex items-center justify-between px-1 pb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                                  <VideoIcon size={12} /> Batch Videos & Lectures
                                </span>
                                <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-300">
                                  {allVideos.length} Video{allVideos.length === 1 ? '' : 's'}
                                </Badge>
                              </div>
                            )}

                            {allVideos.length === 0 ? (
                              <p className="text-xs text-zinc-500 py-4 text-center">No videos found in this curriculum.</p>
                            ) : (
                              allVideos.map((vid, idx) => {
                                const isCurrent = vid.id === videoId
                                const isCompleted = vid.completed === 1 || (vid.watched_percentage || 0) >= 90
                                return (
                                  <div
                                    key={`bseq-vid-${vid.id}`}
                                    onClick={() => {
                                      if (!isCurrent) handleNavigateToVideo(vid.id)
                                    }}
                                    className={cn(
                                      "group flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer",
                                      isCurrent
                                        ? "bg-indigo-500/15 border-indigo-500/40 text-white shadow-sm"
                                        : "bg-[#18181b]/50 border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={cn(
                                        "size-6 rounded flex items-center justify-center shrink-0 font-bold text-[10px]",
                                        isCurrent ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40" : isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                                      )}>
                                        {isCurrent ? (
                                          <Play size={11} fill="currentColor" />
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
                                        {vid.streamtape_status === 'uploading' && (
                                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                                            <Loader2 size={10} className="animate-spin" />
                                            {typeof vid.upload_percentage === 'number' && vid.upload_percentage > 0 ? `${vid.upload_percentage}%` : 'Uploading'}
                                          </span>
                                        )}
                                        <span>{formatDuration(vid.duration || 0)}</span>
                                        {vid.watched_percentage > 0 && !isCompleted && (
                                          <span className="text-indigo-400 font-bold">({Math.round(vid.watched_percentage)}%)</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}

                        {/* Files List (Shown when 'files' or 'all') */}
                        {(seqFilter === 'files' || seqFilter === 'all') && (
                          <div className={cn("space-y-1.5", seqFilter === 'all' && allVideos.length > 0 && "pt-3 border-t border-zinc-800/80")}>
                            {seqFilter === 'all' && (
                              <div className="flex items-center justify-between px-1 pb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                                  <FileText size={12} /> PDFs & Documents
                                </span>
                                <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-300">
                                  {allFiles.length} File{allFiles.length === 1 ? '' : 's'}
                                </Badge>
                              </div>
                            )}

                            {allFiles.length === 0 ? (
                              <p className="text-xs text-zinc-500 py-4 text-center">No documents in this batch.</p>
                            ) : (
                              allFiles.map((file) => {
                                const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
                                return (
                                  <div
                                    key={`bseq-file-${file.id}`}
                                    onClick={() => setSelectedDoc(file)}
                                    className="group flex items-center justify-between p-1.5 rounded-lg bg-[#18181b]/50 border border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700 transition-all cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className="size-6 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
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
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )
              })()}
            </div>

            <div className={cn("absolute inset-0 flex-col bg-[#111113]", activeTab === 'notes' ? 'flex' : 'hidden')}>
              <NotesPanel 
                videoId={video.id} 
                playerRef={playerRef}
              />
            </div>
          </div>
        </div>

          </>
  )

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
      <div className="flex-1 flex flex-col xl:flex-row bg-[#0a0a0b] overflow-hidden">
        
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col border-r border-zinc-800 bg-[#0a0a0b] overflow-y-auto">
          
          <VideoPlayer
            video={video}
            ref={playerRef}
            initialPercentage={video.watched_percentage}
            initialTimestamp={video.last_timestamp}
            sidebarContent={sidebarContent}
            isSidebarOpen={isSidebarOpen}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onOpenTelegramAuth={() => setIsAuthModalOpen(true)}
            onTimeUpdate={(c, d) => persistProgress(c, d, false)}
            onPause={(c, d) => persistProgress(c, d, true)}
            onEnded={() => {
              if (video.duration) {
                persistProgress(video.duration, video.duration, true)
              }
              const playlist = channelVideos.length > 0 ? channelVideos : (batchSequence.filter(i => i.item_type === 'video') as Video[])
              const idx = playlist.findIndex(v => v.id === videoId)
              if (idx !== -1 && idx < playlist.length - 1) {
                handleNavigateToVideo(playlist[idx + 1].id)
              }
            }}
            onPrev={() => {
              const playlist = channelVideos.length > 0 ? channelVideos : (batchSequence.filter(i => i.item_type === 'video') as Video[])
              const idx = playlist.findIndex(v => v.id === videoId)
              if (idx > 0) {
                handleNavigateToVideo(playlist[idx - 1].id)
              }
            }}
            onNext={() => {
              const playlist = channelVideos.length > 0 ? channelVideos : (batchSequence.filter(i => i.item_type === 'video') as Video[])
              const idx = playlist.findIndex(v => v.id === videoId)
              if (idx !== -1 && idx < playlist.length - 1) {
                handleNavigateToVideo(playlist[idx + 1].id)
              }
            }}
          />

          <div className="p-4 lg:p-8 flex flex-col gap-8 max-w-[1200px] mx-auto w-full">
            <div className="space-y-4">
              <h1 className="text-xl lg:text-3xl font-bold text-zinc-50 tracking-tight">
                {cleanTitle(video.title)}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-medium">
                <span className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-lg text-indigo-300 font-semibold">
                  {formatDuration(video.duration)}
                </span>
                {video.watched_percentage > 0 && (
                  <span className="text-zinc-400">• {Math.round(video.watched_percentage)}% Watched</span>
                )}

                {/* Server Upload Status Badge */}
                {video.streamtape_status === 'uploading' && (
                  <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-300 gap-1.5 py-1 animate-pulse font-mono text-xs">
                    <Loader2 size={12} className="animate-spin text-amber-400" />
                    <span>
                      {(video as any).upload_progress && (video as any).upload_progress.bytesTotal > 0
                        ? `Streamtape Cloud: ${(video as any).upload_progress.pct}% (${((video as any).upload_progress.bytesLoaded / 1024 / 1024).toFixed(1)}MB / ${((video as any).upload_progress.bytesTotal / 1024 / 1024).toFixed(1)}MB)`
                        : typeof video.upload_percentage === 'number' && video.upload_percentage > 1
                        ? `Streamtape Cloud: ${video.upload_percentage}%`
                        : 'Streamtape Cloud: Remote Download Queued...'}
                    </span>
                  </Badge>
                )}
                {video.streamtape_status === 'failed' && (
                  <Badge variant="outline" className="bg-rose-500/10 border-rose-500/30 text-rose-400 gap-1.5 py-1 text-xs">
                    ⚠️ Upload Failed (Click Upload to Retry)
                  </Badge>
                )}
                {video.streamtape_status === 'ready' && (
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 gap-1.5 py-1">
                    🟢 Streamtape CDN (Ready)
                  </Badge>
                )}

                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/80 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Directly link or change Streamtape video (0 Render server bandwidth)"
                >
                  <Link2 size={12} className="text-emerald-400" /> Link Streamtape
                </button>

                {video && video.streamtape_status !== 'ready' && video.streamtape_status !== 'uploading' && (
                  <button
                    type="button"
                    onClick={handleTriggerUpload}
                    disabled={triggeringUpload}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-800/80 hover:border-emerald-700 bg-emerald-950/40 transition-all flex items-center gap-1.5 shadow-sm"
                    title="Manual upload to Streamtape (Always uploads immediately, bypassing daily limit)"
                  >
                    <UploadCloud size={12} className={triggeringUpload ? "animate-pulse text-emerald-400" : "text-emerald-400"} />
                    {triggeringUpload ? 'Queueing...' : 'Upload to Streamtape'}
                  </button>
                )}

                {(video as any).daily_uploads && (
                  <span 
                    className="text-[10px] text-zinc-500 font-mono self-center px-1" 
                    title={`Automated daily upload quota (${(video as any).daily_uploads.count}/${(video as any).daily_uploads.limit}). Clicking "Upload to Streamtape" manually uploads anytime without limit.`}
                  >
                    Daily Auto: {(video as any).daily_uploads.count}/{(video as any).daily_uploads.limit}
                  </span>
                )}

                <a
                  href={video ? `${getApiBase()}/api/stream/${video.id}?download=1` : '#'}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-blue-300 hover:text-blue-100 border border-blue-800/60 hover:border-blue-700 bg-blue-950/40 hover:bg-blue-900/60 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Directly download this video file to your computer/phone"
                >
                  <Download size={12} className="text-blue-400" /> Direct Download
                </a>

                <button
                  type="button"
                  onClick={handleCopyDownloadUrl}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/80 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Copy direct download link (ideal for pasting into Streamtape Remote Upload or download managers)"
                >
                  {copiedDownload ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedDownload ? 'Download Link Copied!' : 'Copy Download Link'}
                </button>

                <button
                  type="button"
                  onClick={handleCopyStreamUrl}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-300 border border-zinc-800/80 hover:border-zinc-700 bg-zinc-950 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Copy direct Telegram video stream URL (inline stream format)"
                >
                  {copiedStream ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedStream ? 'Stream URL Copied!' : 'Stream URL'}
                </button>
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

        {/* RIGHT COLUMN (DESKTOP) - Hidden when fullscreen or mobile */}
        <div className="hidden xl:flex w-[400px] border-l border-zinc-800 bg-[#111113] overflow-hidden shrink-0 flex-col">
          {sidebarContent}
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

      {/* Streamtape Direct Link Dialog (Bandwidth Limit Bypass) */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <UploadCloud size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Direct Streamtape Link</h3>
                  <p className="text-[11px] text-zinc-500">Zero Render bandwidth streaming</p>
                </div>
              </div>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              If your Render server bandwidth is reached or you uploaded this video directly on Streamtape, paste the video link or ID below. It will connect immediately and play with <strong>0 Render server bandwidth</strong>.
            </p>

            <form onSubmit={handleLinkStreamtape} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400">Streamtape Video URL or ID</label>
                <Input
                  type="text"
                  placeholder="https://streamtape.com/v/abcd1234 or abcd1234"
                  value={streamtapeLinkInput}
                  onChange={(e) => setStreamtapeLinkInput(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-xs font-mono h-10 text-white"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsLinkModalOpen(false)}
                  className="text-xs text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isLinking || !streamtapeLinkInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5 h-9 px-4 rounded-xl"
                >
                  {isLinking ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                  Connect Streamtape Link
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
