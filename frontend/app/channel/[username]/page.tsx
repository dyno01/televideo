'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, Video as VideoIcon, FileText, Folder, RefreshCw, Loader2, AlertCircle, 
  Layers, LayoutDashboard, Settings, Menu, X, Play, ChevronRight, BookOpen, Lock
} from 'lucide-react'
import { getChannel, getVideos, getFiles, scanChannel, getBatches, getBatchVideos, type Channel, type Video, type TelegramFile, type Batch } from '@/lib/api'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import BatchManager from '@/components/BatchManager'
import TelegramAuthModal from '@/components/TelegramAuthModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, cleanTitle } from '@/lib/utils'

type Tab = 'videos' | 'pdfs' | 'files' | 'batches' | 'overview'

export default function ChannelPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string

  const [channel, setChannel] = useState<Channel | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [files, setFiles] = useState<TelegramFile[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchVideos, setBatchVideos] = useState<Record<number, Video[]>>({})
  
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rescanning, setRescanning] = useState(false)

  const [initialBatchId, setInitialBatchId] = useState<number | undefined>(undefined)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tab = searchParams.get('tab') as Tab
    const bId = searchParams.get('batchId')
    if (bId) {
      const parsed = parseInt(bId, 10)
      if (!isNaN(parsed)) setInitialBatchId(parsed)
    }
    if (tab && ['videos', 'pdfs', 'files', 'batches', 'overview'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [ch, vids, fls] = await Promise.all([
        getChannel(username),
        getVideos(username),
        getFiles(username),
      ])
      setChannel(ch)
      setVideos(vids)
      setFiles(fls)

      const bList = await getBatches(ch.id)
      setBatches(bList)

      const bvMap: Record<number, Video[]> = {}
      await Promise.all(bList.map(async (b) => {
        bvMap[b.id] = await getBatchVideos(b.id)
      }))
      setBatchVideos(bvMap)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load channel data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [username])

  async function handleRescan() {
    setRescanning(true)
    try {
      await scanChannel(username)
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Re-scan failed.')
    } finally {
      setRescanning(false)
    }
  }

  const pdfs = files.filter(f => f.mime_type === 'application/pdf')
  const docs = files.filter(f => f.mime_type !== 'application/pdf')
  
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4 text-[#a1a1aa] bg-[#0a0a0b]">
      <Loader2 className="w-8 h-8 animate-spin text-[#fafafa]" />
      <p className="text-sm font-bold uppercase tracking-widest text-[#52525b]">Retrieving Intelligence...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0b]">
      <Card className="max-w-md w-full p-8 text-center border-red-900/20 bg-red-900/5 space-y-6">
        <AlertCircle size={48} className="mx-auto text-red-500" />
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-red-500">Wait, something went wrong</h3>
          <p className="text-sm text-red-400">{error}</p>
        </div>
        <Button variant="outline" className="w-full text-[#fafafa] border-[#27272a] hover:bg-[#18181b]" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>
      </Card>
    </div>
  )
  
  const watchedCount = videos.filter(v => (v.watched_percentage || 0) > 90).length
  const completionRate = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} /> },
    { id: 'batches', label: 'Batches / Modules', icon: <Layers size={20} /> },
    { id: 'videos', label: 'All Videos', icon: <VideoIcon size={20} /> },
    { id: 'pdfs', label: 'PDF Resources', icon: <FileText size={20} /> },
    { id: 'files', label: 'Other Files', icon: <Folder size={20} /> },
  ]

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0a0b]">
      <div className="p-6 border-b border-[#27272a]">
        <Link href="/" className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#fafafa] transition-colors text-sm font-medium mb-8">
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <Avatar className="size-10 rounded-xl bg-[#111113] border border-[#27272a]">
            <AvatarFallback className="text-[#fafafa] font-bold bg-[#18181b]">
              {channel?.title?.charAt(0).toUpperCase() || 'C'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#fafafa] truncate">{channel?.title}</h2>
            <p className="text-xs text-[#a1a1aa] truncate">@{channel?.username}</p>
          </div>
        </div>
      </div>
      
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-4">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as Tab)
                setIsSidebarOpen(false)
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                activeTab === item.id 
                  ? "bg-[#18181b] text-[#fafafa]" 
                  : "text-[#a1a1aa] hover:bg-[#111113] hover:text-[#fafafa]"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </ScrollArea>
      
      <div className="p-4 border-t border-[#27272a] space-y-2">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 bg-transparent text-[#a1a1aa] border-[#27272a] hover:text-[#fafafa] hover:bg-[#18181b]"
          onClick={handleRescan}
          disabled={rescanning}
        >
          <RefreshCw size={16} className={cn(rescanning && "animate-spin")} />
          {rescanning ? 'Synchronizing...' : 'Synchronize'}
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]"
          onClick={() => setIsAuthModalOpen(true)}
        >
          <Settings size={16} />
          Telegram Settings
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
          onClick={() => {
            localStorage.removeItem('app_passcode_token')
            window.dispatchEvent(new Event('app_passcode_required'))
          }}
        >
          <Lock size={16} />
          Lock App
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#0a0a0b] text-[#fafafa] overflow-hidden">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] border-r border-[#27272a] z-20 shrink-0">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-[260px] bg-[#0a0a0b] border-r border-[#27272a] z-50 transition-transform duration-300 lg:hidden shadow-2xl",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {SidebarContent}
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0b] overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden h-14 border-b border-[#27272a] flex items-center px-4 bg-[#0a0a0b] z-30 sticky top-0 shrink-0">
          <button 
            className="mr-3 text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <h1 className="text-sm font-bold text-[#fafafa] truncate">{channel?.title}</h1>
        </header>

        <div className="p-6 md:p-8 max-w-6xl mx-auto w-full pb-20">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6 bg-[#111113] border-[#27272a] rounded-xl shadow-none">
                  <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Total Videos</h3>
                  <p className="text-3xl font-bold text-[#fafafa]">{videos.length}</p>
                </Card>
                <Card className="p-6 bg-[#111113] border-[#27272a] rounded-xl shadow-none">
                  <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Total Files</h3>
                  <p className="text-3xl font-bold text-[#fafafa]">{files.length}</p>
                </Card>
                <Card className="p-6 bg-[#111113] border-[#27272a] rounded-xl shadow-none">
                  <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2">Completion</h3>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-3xl font-bold text-[#fafafa]">{completionRate}%</p>
                  </div>
                  <Progress value={completionRate} className="h-1.5 bg-[#18181b] [&>div]:bg-[#6366f1]" />
                </Card>
              </div>

              {/* Channel & Batch Continue Watching */}
              <div>
                <h2 className="text-lg font-bold text-[#fafafa] mb-4 flex items-center gap-2">
                  <BookOpen size={20} className="text-[#6366f1]" />
                  Continue Watching
                </h2>
                
                {/* 1. All Channel Videos in-progress fallback */}
                {videos.filter(v => ((v.watched_percentage || 0) > 0 || (v.last_timestamp || 0) > 0) && !v.completed).length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-3">Recent Channel Progress</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {videos.filter(v => ((v.watched_percentage || 0) > 0 || (v.last_timestamp || 0) > 0) && !v.completed).slice(0, 3).map(vid => (
                        <Card key={vid.id} className="p-4 bg-[#111113] border-[#27272a] rounded-xl flex flex-col justify-between gap-3 shadow-none hover:border-[#52525b] transition-colors">
                          <div>
                            <h3 className="font-semibold text-sm text-[#fafafa] line-clamp-2 leading-tight" title={vid.title}>{cleanTitle(vid.title)}</h3>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs text-[#a1a1aa] mb-1">
                                <span>Progress</span>
                                <span>{Math.round(vid.watched_percentage || 0)}%</span>
                              </div>
                              <Progress value={vid.watched_percentage || 0} className="h-1.5 bg-[#18181b] [&>div]:bg-[#6366f1]" />
                            </div>
                            <Button size="sm" className="w-full gap-2 bg-[#6366f1] hover:bg-[#6366f1]/90 text-[#fafafa] rounded-lg" onClick={() => router.push(`/video/${vid.id}`)}>
                              <Play size={14} fill="currentColor" /> Resume
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Batch Continue Watching */}
                {batches.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {batches.map(batch => {
                      const vids = batchVideos[batch.id] || []
                      const inProgress = vids.filter(v => (v.watched_percentage || 0) > 0 && !v.completed)
                      const lastVideo = inProgress.length > 0 ? inProgress[inProgress.length - 1] : null
                      
                      if (!lastVideo) return null
                      
                      return (
                        <Card key={batch.id} className="p-5 bg-[#111113] border-[#27272a] rounded-xl flex flex-col gap-4 shadow-none hover:border-[#52525b] transition-colors">
                          <div>
                            <Badge variant="outline" className="mb-3 border-[#52525b] text-[#a1a1aa] bg-[#18181b]">{batch.name}</Badge>
                            <h3 className="font-semibold text-[#fafafa] line-clamp-2 leading-tight" title={lastVideo.title}>{cleanTitle(lastVideo.title)}</h3>
                          </div>
                          <div className="mt-auto space-y-4">
                            <div>
                              <div className="flex justify-between text-xs text-[#a1a1aa] mb-1.5">
                                <span>Progress</span>
                                <span>{Math.round(lastVideo.watched_percentage)}%</span>
                              </div>
                              <Progress value={lastVideo.watched_percentage} className="h-1.5 bg-[#18181b] [&>div]:bg-[#22c55e]" />
                            </div>
                            <div className="flex gap-2">
                              <Button className="flex-1 gap-2 bg-[#6366f1] hover:bg-[#6366f1]/90 text-[#fafafa] rounded-lg" onClick={() => router.push(`/video/${lastVideo.id}`)}>
                                <Play size={16} fill="currentColor" /> Resume
                              </Button>
                              <Button variant="outline" className="flex-1 border-[#27272a] bg-transparent text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa] rounded-lg" onClick={() => { setInitialBatchId(batch.id); setActiveTab('batches'); }}>
                                View Batch
                              </Button>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
                
                {videos.filter(v => (v.watched_percentage || 0) > 0 && !v.completed).length === 0 && batches.every(b => {
                  const vids = batchVideos[b.id] || []
                  return vids.filter(v => (v.watched_percentage || 0) > 0 && !v.completed).length === 0
                }) && (
                  <div className="text-[#a1a1aa] text-sm p-6 bg-[#111113] border border-[#27272a] rounded-xl text-center">
                    No in-progress videos found. Play a video to start tracking progress!
                  </div>
                )}
              </div>

                {/* Recent Videos Quick Access */}
                <div>
                  <h2 className="text-lg font-bold text-[#fafafa] mb-4 flex items-center gap-2">
                    <VideoIcon size={20} className="text-[#6366f1]" />
                    Recent Videos
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videos.slice(0, 6).map(vid => (
                       <Card key={vid.id} className="p-3 bg-[#111113] border-[#27272a] rounded-xl hover:bg-[#18181b] hover:border-[#52525b] transition-colors cursor-pointer flex items-center gap-3 shadow-none group" onClick={() => router.push(`/video/${vid.id}`)}>
                         <div className="size-10 rounded-lg bg-[#0a0a0b] border border-[#27272a] flex flex-shrink-0 items-center justify-center text-[#a1a1aa] group-hover:bg-[#6366f1] group-hover:text-[#fafafa] group-hover:border-[#6366f1] transition-colors">
                            <Play size={16} className={cn(vid.watched_percentage > 0 && vid.watched_percentage < 100 && "fill-current")} />
                         </div>
                         <div className="min-w-0 flex-1">
                           <p className="text-sm font-semibold text-[#fafafa] truncate group-hover:text-white transition-colors" title={vid.title}>{cleanTitle(vid.title)}</p>
                           <p className="text-[11px] text-[#52525b] mt-0.5 uppercase tracking-wider font-bold">
                             {vid.watched_percentage > 0 ? `${Math.round(vid.watched_percentage)}% watched` : 'Not started'}
                           </p>
                         </div>
                       </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'batches' && channel && (
              <div className="animate-in fade-in duration-500">
                <BatchManager channelId={channel.id} channelUsername={username} initialBatchId={initialBatchId} />
              </div>
            )}

            {activeTab === 'videos' && (
              <div className="animate-in fade-in duration-500">
                <LectureList videos={videos} channelUsername={username} currentVideoId={undefined} />
              </div>
            )}

            {activeTab === 'pdfs' && (
              <div className="animate-in fade-in duration-500">
                <FileLibrary files={pdfs} channelUsername={username} />
              </div>
            )}

            {activeTab === 'files' && (
              <div className="animate-in fade-in duration-500">
                <FileLibrary files={docs} channelUsername={username} />
              </div>
            )}
          </div>
      </main>

      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  )
}
