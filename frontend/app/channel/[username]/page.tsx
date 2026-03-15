'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Video as VideoIcon, 
  FileText, 
  Folder as FolderIcon, 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  Layers, 
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronRight
} from 'lucide-react'
import { getChannel, getVideos, getFiles, scanChannel, type Channel, type Video, type TelegramFile } from '@/lib/api'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import BatchManager from '@/components/BatchManager'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type Tab = 'videos' | 'pdfs' | 'files' | 'batches' | 'overview'

export default function ChannelPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string

  const [channel, setChannel] = useState<Channel | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [files, setFiles] = useState<TelegramFile[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tab = searchParams.get('tab') as Tab
    if (tab && ['videos', 'pdfs', 'files', 'batches', 'overview'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rescanning, setRescanning] = useState(false)

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
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4 text-muted-foreground bg-[#121212]">
      <Loader2 className="w-8 h-8 animate-spin text-white" />
      <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">Retrieving Intelligence...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#121212]">
      <Card className="max-w-md w-full p-8 text-center border-destructive/20 bg-destructive/5 space-y-6">
        <AlertCircle size={48} className="mx-auto text-destructive" />
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-destructive">Wait, something went wrong</h3>
          <p className="text-sm text-destructive/80">{error}</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Base
        </Button>
      </Card>
    </div>
  )

  const totalContent = videos.length + files.length
  const watchedCount = videos.filter(v => (v.watched_percentage || 0) > 90).length
  const completionRate = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0

  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'batches', label: 'My Batches', icon: <Layers size={20} /> },
    { id: 'videos', label: 'Video Library', icon: <VideoIcon size={20} /> },
    { id: 'pdfs', label: 'PDF Resources', icon: <FileText size={20} /> },
    { id: 'files', label: 'Other Files', icon: <FolderIcon size={20} /> },
  ]

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-8">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="size-9 bg-white rounded-lg flex items-center justify-center text-zinc-950 shadow-lg shadow-white/5 shrink-0 transition-transform hover:scale-105">
              <Layers size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">Study Studio</h1>
          </div>
          <button 
            className="lg:hidden text-zinc-500 hover:text-white transition-colors"
            onClick={() => setIsSidebarOpen(false)}
          >
            <ArrowLeft size={24} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-1 mb-8">
          <h3 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Learning Vault</h3>
          <p className="text-zinc-700 text-[11px] font-bold italic">Advanced Portal v3.0</p>
        </div>

        <nav className="space-y-1.5">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as Tab);
                setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-sm font-bold",
                activeTab === item.id 
                  ? "bg-white text-zinc-950 shadow-xl shadow-white/5 active:scale-95" 
                  : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200"
              )}
            >
              <div className={cn(
                "shrink-0",
                activeTab === item.id ? "text-inherit" : "text-zinc-600"
              )}>
                {item.icon}
              </div>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-8 border-t border-zinc-900">
         <div className="flex items-center gap-4 px-2 mb-6">
            <Avatar className="size-10 rounded-xl border border-zinc-800 bg-zinc-900 shadow-inner">
              <AvatarFallback className="bg-zinc-900 text-zinc-500 font-bold uppercase text-xs">
                AJ
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-zinc-200 truncate">Alex Johnson</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] font-black">ID: #4429</p>
            </div>
         </div>
         
         <Link href="/" className="flex items-center gap-3 px-4 py-2 text-zinc-600 hover:text-white transition-all text-xs font-bold uppercase tracking-widest group">
            <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span>Exit Workspace</span>
         </Link>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-white selection:text-black overflow-hidden h-screen relative">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- Desktop Sidebar --- */}
      <aside className="hidden lg:flex w-72 border-r border-zinc-900 flex-col bg-[#09090b] shadow-2xl z-20">
        {SidebarContent}
      </aside>

      {/* --- Mobile Sidebar (Drawer) --- */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-80 bg-[#09090b] border-r border-zinc-900 z-[70] transition-transform duration-500 ease-out lg:hidden shadow-[30px_0_60px_rgba(0,0,0,0.5)]",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {SidebarContent}
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#09090b] relative">
        {/* Header */}
        <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-4 sm:px-8 bg-[#09090b]/80 backdrop-blur-xl z-50 sticky top-0">
          <div className="flex items-center gap-4 sm:gap-6 flex-1">
            <button 
              className="lg:hidden size-10 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-xl transition-all"
              onClick={() => setIsSidebarOpen(true)}
            >
              <LayoutDashboard size={20} />
            </button>
            <div className="flex-1 max-w-xl hidden sm:block">
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-200 transition-colors">
                   <LayoutDashboard size={18} />
                </span>
                <input 
                  className="w-full bg-zinc-900/40 border border-zinc-800 rounded-xl py-2 pl-12 pr-4 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-700 focus:ring-0 focus:bg-zinc-900/60 transition-all outline-none" 
                  placeholder="Search resources..." 
                  type="text"
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="size-10 flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50 rounded-xl transition-all">
              <Settings size={20} />
            </button>
            <div className="hidden sm:block w-px h-4 bg-zinc-800 mx-1"></div>
            <div className="size-10 flex items-center justify-center rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-all shadow-lg shadow-white/5 active:scale-95 cursor-pointer">
              <Avatar className="size-full rounded-xl">
                 <AvatarFallback className="bg-transparent text-inherit font-black">U</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-8 lg:p-12 max-w-7xl mx-auto w-full">
            <div className="flex flex-col gap-2 mb-12">
               <nav className="flex items-center gap-2 text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">
                 <span className="hover:text-zinc-400 transition-colors cursor-pointer">Learning</span>
                 <ChevronRight size={12} />
                 <span className="text-zinc-400">{activeTab === 'overview' ? 'Overview' : navItems.find(i => i.id === activeTab)?.label}</span>
               </nav>
               <h2 className="text-4xl lg:text-5xl font-black text-white tracking-tighter">
                 {activeTab === 'overview' ? `Welcome to ${channel?.title || 'Vault'}` : navItems.find(i => i.id === activeTab)?.label}
               </h2>
               {activeTab === 'overview' && (
                 <p className="text-zinc-500 text-lg lg:text-xl max-w-2xl font-medium mt-4 leading-relaxed">
                   Exploration complete by <span className="text-white font-bold">{completionRate}%</span>. 
                   Deep dive into the curated sequences below to master {channel?.title || 'the content'}.
                 </p>
               )}
            </div>

            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                 <section className="lg:col-span-2 flex flex-col gap-10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Your Progress</h3>
                      <button className="text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors" onClick={() => setActiveTab('batches')}>View Batches</button>
                    </div>
                    
                    {/* Highlights Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="bg-zinc-900/40 border-zinc-800 p-8 rounded-[32px] shadow-2xl overflow-hidden relative group">
                         <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                         <h4 className="text-lg font-black text-white mb-6 uppercase tracking-tight">Overall Completion</h4>
                         <div className="space-y-6">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              <span>{watchedCount} / {videos.length} videos</span>
                              <span className="text-white">{completionRate}%</span>
                            </div>
                            <Progress value={completionRate} className="h-1.5" />
                         </div>
                      </Card>
                      <Card className="bg-zinc-900/40 border-zinc-800 p-8 rounded-[32px] shadow-2xl flex flex-col justify-between">
                         <div>
                            <h4 className="text-lg font-black text-white mb-2 uppercase tracking-tight">Batch Status</h4>
                            <div className="flex items-center justify-between text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                               <span>Active Batches</span>
                               <span className="text-white">PRO Member</span>
                            </div>
                         </div>
                         <Button className="w-full mt-8 bg-white text-zinc-950 font-black h-12 rounded-xl text-xs uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5" onClick={() => setActiveTab('batches')}>
                            Manage Batches
                         </Button>
                      </Card>
                    </div>

                    {/* Quick Access */}
                    <div className="flex flex-col gap-8">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Continue Learning</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {videos.slice(0, 4).map(vid => (
                           <div key={vid.id} className="flex items-center gap-5 p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-white/5 hover:border-zinc-700 transition-all cursor-pointer group" onClick={() => router.push(`/video/${vid.id}`)}>
                              <div className="size-12 rounded-[18px] bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-white group-hover:text-zinc-950 transition-all">
                                 <VideoIcon size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold truncate group-hover:text-white leading-tight">{vid.title}</p>
                                 <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mt-1">
                                   {vid.watched_percentage > 0 ? `${Math.round(vid.watched_percentage)}% watched` : 'Not started'}
                                 </p>
                              </div>
                              <ChevronRight size={16} className="text-zinc-800 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                           </div>
                         ))}
                      </div>
                    </div>
                 </section>

                 {/* Activity Sidebar */}
                 <section className="flex flex-col gap-10">
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Resources</h3>
                    <div className="flex flex-col gap-4">
                       {[
                         { label: 'PDF Library', count: pdfs.length, icon: <FileText size={18} />, tab: 'pdfs' },
                         { label: 'Cloud Files', count: docs.length, icon: <FolderIcon size={18} />, tab: 'files' },
                       ].map(item => (
                         <Card key={item.label} className="flex items-center gap-5 p-5 bg-zinc-900/40 border-zinc-800 rounded-2xl cursor-pointer hover:bg-white/5 hover:border-zinc-700 transition-all group" onClick={() => setActiveTab(item.tab as Tab)}>
                            <div className="size-12 rounded-[18px] bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-white transition-colors">
                               {item.icon}
                            </div>
                            <div>
                               <p className="text-sm font-black text-white uppercase tracking-tight">{item.label}</p>
                               <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">{item.count} items found</p>
                            </div>
                         </Card>
                       ))}
                    </div>

                    <div className="mt-6 p-8 rounded-[40px] bg-gradient-to-br from-zinc-900 to-[#09090b] border border-zinc-800 flex flex-col items-center text-center gap-6 shadow-2xl">
                       <div className="size-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white shadow-inner">
                          <RefreshCw size={28} className={cn(rescanning && "animate-spin")} />
                       </div>
                       <div>
                          <h4 className="text-lg font-black text-white uppercase tracking-tight">Vault Synchronization</h4>
                          <p className="text-xs text-zinc-500 mt-2 font-medium leading-relaxed">Refresh your local database to synchronize with Telegram's latest data.</p>
                       </div>
                       <Button variant="outline" className="w-full h-12 rounded-xl bg-zinc-900 border-zinc-800 hover:bg-white hover:text-zinc-950 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95" onClick={handleRescan} disabled={rescanning}>
                          {rescanning ? 'Synchronizing...' : 'Sychronize Now'}
                       </Button>
                    </div>
                 </section>
              </div>
            )}

            {activeTab === 'batches' && channel && (
              <BatchManager channelId={channel.id} channelUsername={username} />
            )}

            {activeTab === 'videos' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <LectureList videos={videos} channelUsername={username} />
              </div>
            )}

            {activeTab === 'pdfs' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <FileLibrary files={pdfs} channelUsername={username} />
              </div>
            )}

            {activeTab === 'files' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <FileLibrary files={docs} channelUsername={username} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
