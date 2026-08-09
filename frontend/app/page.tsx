'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  Link as LinkIcon, 
  Video as VideoIcon, 
  FileText, 
  Trash2, 
  Settings, 
  ShieldCheck, 
  ShieldAlert, 
  BookOpen, 
  TrendingUp, 
  Play,
  Lock,
  X
} from 'lucide-react'
import { 
  scanChannel, 
  getChannels, 
  deleteChannel, 
  getVideos, 
  getTelegramStatus,
  getPasscodeStatus,
  Channel, 
  Video, 
  TelegramStatus 
} from '@/lib/api'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import TelegramAuthModal from '@/components/TelegramAuthModal'
import PasscodeLock from '@/components/PasscodeLock'
import { cleanTitle } from '@/lib/utils'

export default function HomePage() {
  const router = useRouter()
  
  // State
  const [channelInput, setChannelInput] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  
  const [channels, setChannels] = useState<Channel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [fetchError, setFetchError] = useState('')
  
  const [inProgressVideos, setInProgressVideos] = useState<Video[]>([])
  const [dismissedVideoIds, setDismissedVideoIds] = useState<Set<number>>(new Set())
  const [overallCompletion, setOverallCompletion] = useState(0)
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null)
  const [isLocked, setIsLocked] = useState(false)

  const checkTgStatus = async () => {
    try {
      const st = await getTelegramStatus()
      setTelegramStatus(st)
    } catch (_) {}
  }

  const checkPasscode = async () => {
    try {
      const res = await getPasscodeStatus()
      if (res.passcodeSet) {
        const token = localStorage.getItem('app_passcode_token')
        if (!token) setIsLocked(true)
      }
    } catch (_) {}
  }

  useEffect(() => {
    checkPasscode()
    checkTgStatus()
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoadingChannels(true)
      const fetchedChannels = await getChannels()
      setChannels(fetchedChannels)
      
      // Fetch videos for first 3 channels for "continue learning" concurrently
      const videosToFetch = fetchedChannels.slice(0, 3)
      const allResults = await Promise.all(
        videosToFetch.map(async (ch) => {
          try {
            const vids = await getVideos(ch.username)
            return vids.map(v => ({
              ...v,
              channel_username: ch.username,
              channel_title: ch.title || ch.username
            }))
          } catch (e) {
            console.error(`Failed to fetch videos for ${ch.username}`, e)
            return []
          }
        })
      )
      const allFetchedVideos = allResults.flat()
      
      // Continue Learning: deduplicated by ID, (watched_percentage > 0 || last_timestamp > 0) && completed === 0
      const seenIds = new Set<number>()
      const inProgress = allFetchedVideos.filter(v => {
        if (seenIds.has(v.id)) return false
        seenIds.add(v.id)
        return ((v.watched_percentage || 0) > 0 || (v.last_timestamp || 0) > 0) && v.completed === 0
      })
      setInProgressVideos(inProgress)
      
      // Calculate overall completion % (only from fetched videos that have progress)
      const videosWithProgress = allFetchedVideos.filter(v => v.watched_percentage > 0)
      if (videosWithProgress.length > 0) {
        const totalCompletion = videosWithProgress.reduce((sum, v) => sum + (v.completed === 1 ? 100 : v.watched_percentage), 0)
        setOverallCompletion(Math.round(totalCompletion / videosWithProgress.length))
      } else {
        setOverallCompletion(0)
      }
      
    } catch (err) {
      setFetchError('Failed to connect to the server. It might be restarting or asleep.')
    } finally {
      setLoadingChannels(false)
    }
  }

  function parseUsername(input: string): string {
    return input
      .trim()
      .replace(/^https?:\/\/t\.me\//, '')
      .replace(/^@/, '')
      .split('/')[0]
  }

  async function handleScan(e?: React.FormEvent) {
    if (e) e.preventDefault()
    
    const username = parseUsername(channelInput)
    if (!username) return

    setScanError('')
    setIsScanning(true)

    try {
      const result = await scanChannel(username)
      router.push(`/channel/${result.channel.username}`)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Scan failed. Make sure the channel is public and backend is running.'
      setScanError(msg)
      if (err?.response?.data?.authRequired || msg.includes('authorization') || msg.includes('not authorized') || msg.includes('Settings')) {
        setIsAuthModalOpen(true)
      }
    } finally {
      setIsScanning(false)
    }
  }

  async function handleRemoveChannel(e: React.MouseEvent, channelId: number, title: string) {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to remove "${title}" from your library?`)) return

    try {
      await deleteChannel(channelId)
      setChannels(prev => prev.filter(c => c.id !== channelId))
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to remove channel.')
    }
  }

  const totalChannels = channels.length
  const totalVideos = channels.reduce((sum, ch) => sum + ch.videoCount, 0)

  return (
    <div className="min-h-screen w-full bg-[#0a0a0b] text-zinc-100 font-sans selection:bg-indigo-500/30 selection:text-white">
      
      {/* 1. HEADER (sticky top) */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-[#0a0a0b]/90 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-md space-y-3 sm:space-y-0">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Play size={14} fill="currentColor" className="ml-0.5" />
            </div>
            <span className="text-lg font-black tracking-tighter text-white">TeleVideo</span>
          </div>
          
          {/* Desktop Scan Form */}
          <form onSubmit={handleScan} className="hidden sm:flex items-center gap-2 max-w-md w-full mx-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center text-zinc-500 pointer-events-none">
                <Search size={14} />
              </div>
              <Input 
                className="h-9 w-full rounded-lg border border-zinc-800 bg-[#111113] pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500 outline-none"
                placeholder="Paste Telegram link or @username..."
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
              />
            </div>
            <Button 
              type="submit" 
              size="sm" 
              disabled={isScanning || !channelInput.trim()}
              className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 shadow-lg shadow-indigo-600/20"
            >
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : 'Scan Channel'}
            </Button>
          </form>

          {/* User Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold border transition-all ${
                telegramStatus?.authenticated
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              {telegramStatus?.authenticated ? (
                <>
                  <ShieldCheck size={14} />
                  <span className="max-w-[80px] sm:max-w-[140px] truncate">@{telegramStatus.user?.username || telegramStatus.user?.firstName || 'Connected'}</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={14} />
                  <span>Connect TG</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('app_passcode_token')
                window.dispatchEvent(new Event('app_passcode_required'))
              }}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all shrink-0"
              title="Lock Dashboard / Passcode Auth"
            >
              <Lock size={14} className="text-indigo-400" />
              <span className="hidden sm:inline">Lock App</span>
            </button>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center justify-center rounded-lg size-8 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Mobile Scan Form (Row 2) */}
        <form onSubmit={handleScan} className="flex sm:hidden items-center gap-2 w-full pt-1">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center text-zinc-500 pointer-events-none">
              <Search size={14} />
            </div>
            <Input 
              className="h-9 w-full rounded-xl border border-zinc-800 bg-[#111113] pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500 outline-none"
              placeholder="Paste Telegram channel link or @username..."
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
            />
          </div>
          <Button 
            type="submit" 
            size="sm" 
            disabled={isScanning || !channelInput.trim()}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0"
          >
            {isScanning ? <Loader2 size={14} className="animate-spin" /> : 'Scan'}
          </Button>
        </form>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8 flex flex-col gap-10">
        
        {scanError && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertCircle size={16} />
            <span>{scanError}</span>
          </div>
        )}

        {/* 2. STATS BAR */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-4 bg-[#111113] border border-zinc-800 p-5 rounded-xl">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalChannels}</p>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Channels</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-[#111113] border border-zinc-800 p-5 rounded-xl">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <VideoIcon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalVideos}</p>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Videos</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-[#111113] border border-zinc-800 p-5 rounded-xl">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <TrendingUp size={20} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-1">
                <p className="text-2xl font-bold text-white">{overallCompletion}%</p>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Completion</p>
              </div>
              <Progress value={overallCompletion} className="h-1.5" />
            </div>
          </div>
        </section>

        {/* 3. CONTINUE LEARNING */}
        {inProgressVideos.filter(v => !dismissedVideoIds.has(v.id)).length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Play size={18} className="text-indigo-400" />
                Continue Learning
              </h2>
              <button
                onClick={() => setDismissedVideoIds(new Set(inProgressVideos.map(v => v.id)))}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium"
              >
                Clear all
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
              {inProgressVideos.filter(v => !dismissedVideoIds.has(v.id)).map(video => (
                <div 
                  key={video.id} 
                  className="group/card flex-shrink-0 w-[300px] sm:w-[350px] bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden snap-start hover:border-zinc-700 transition-colors relative"
                >
                  {/* Dismiss X button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDismissedVideoIds(prev => new Set(Array.from(prev).concat(video.id))) }}
                    className="absolute top-3 right-3 z-10 size-6 rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-500 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-all opacity-0 group-hover/card:opacity-100"
                    title="Remove from continue watching"
                  >
                    <X size={12} />
                  </button>
                  <div className="p-4 flex flex-col gap-3 h-full">
                    <div className="flex-1 pr-6">
                      <h3 className="text-sm font-bold text-white line-clamp-2 mb-1" title={video.title}>
                        {cleanTitle(video.title) || 'Untitled Video'}
                      </h3>
                      <p className="text-xs font-medium text-zinc-500 line-clamp-1">
                        {video.channel_title}
                      </p>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-auto pt-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                        <span>{video.watched_percentage}% completed</span>
                      </div>
                      <Progress value={video.watched_percentage} className="h-1.5 bg-zinc-800" />
                      
                      <Button 
                        onClick={() => router.push(`/video/${video.id}`)}
                        className="w-full mt-2 h-9 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 hover:text-white font-medium text-xs transition-colors"
                      >
                        Resume Video
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. YOUR CHANNELS */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" />
            Your Channels
          </h2>
          
          {loadingChannels ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm font-medium">Loading your learning hubs...</p>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3 border border-dashed border-rose-500/20 rounded-xl bg-rose-500/5">
              <AlertCircle className="w-6 h-6 text-rose-400" />
              <p className="font-medium text-rose-400">{fetchError}</p>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="mt-2 border-rose-500/30 text-rose-400 hover:bg-rose-500/10">
                Try Again
              </Button>
            </div>
          ) : channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3 border border-dashed border-zinc-800 rounded-xl bg-[#111113]">
              <p className="font-medium text-zinc-400">No channels found</p>
              <p className="text-xs text-center max-w-xs">Use the search bar above to scan and add your first Telegram channel.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {channels.map(ch => {
                const channelCompletion = 0 
                
                return (
                  <div 
                    key={ch.id} 
                    className="group flex flex-col bg-[#111113] rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer relative"
                    onClick={() => router.push(`/channel/${ch.username}`)}
                  >
                    <div className="p-5 flex flex-col gap-4">
                      
                      <div className="flex items-start justify-between">
                        <Avatar className="size-10 border border-zinc-800">
                          <AvatarFallback className="bg-[#18181b] text-zinc-300 font-bold text-sm uppercase">
                            {ch.title?.charAt(0) || ch.username.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <button
                          onClick={(e) => handleRemoveChannel(e, ch.id, ch.title || ch.username)}
                          className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete Channel"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div>
                        <h4 className="text-zinc-100 font-bold text-sm mb-1 line-clamp-1" title={ch.title || ch.username}>
                          {ch.title || ch.username}
                        </h4>
                        <p className="text-zinc-500 text-xs font-medium">@{ch.username}</p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                          <VideoIcon size={14} className="text-zinc-500" />
                          <span>{ch.videoCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                          <FileText size={14} className="text-zinc-500" />
                          <span>{ch.fileCount}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                          <span>Progress</span>
                          <span>{channelCompletion}%</span>
                        </div>
                        <Progress value={channelCompletion} className="h-1 bg-zinc-800" />
                      </div>

                      <Button 
                        className="w-full mt-2 h-9 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 font-medium text-xs transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/channel/${ch.username}`)
                        }}
                      >
                        Open Channel
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        
      </main>

      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onStatusChange={setTelegramStatus}
      />
    </div>
  )
}
