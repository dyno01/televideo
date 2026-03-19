'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, AlertCircle, UserCircle, Link as LinkIcon, Video as VideoIcon, FileText, Folder, ChevronRight } from 'lucide-react'
import { scanChannel, getChannels, Channel } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function HomePage() {
  const router = useRouter()
  const [channelInput, setChannelInput] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch((err) => {
        setFetchError('Failed to connect to the server. It might be restarting or asleep.')
      })
      .finally(() => setLoadingChannels(false))
  }, [])

  function parseUsername(input: string): string {
    return input
      .trim()
      .replace(/^https?:\/\/t\.me\//, '')
      .replace(/^@/, '')
      .split('/')[0]
  }

  async function handleScan() {
    const username = parseUsername(channelInput)
    if (!username) return

    setScanError('')
    setIsScanning(true)

    try {
      const result = await scanChannel(username)
      router.push(`/channel/${result.channel.username}`)
    } catch (err: any) {
      setScanError(err?.response?.data?.error || 'Scan failed. Make sure the channel is public and backend is running.')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#09090b] text-zinc-100 font-sans selection:bg-white selection:text-black">
      {/* --- Top Navigation --- */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-zinc-900 px-8 md:px-16 py-4 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
           <div className="text-xl font-black tracking-tighter text-white">LOGO</div>
        </div>
        <div className="flex flex-1 justify-end gap-12 items-center">
          <nav className="hidden md:flex items-center gap-10">
            <a className="text-white text-[13px] font-semibold tracking-tight transition-colors hover:text-zinc-300" href="#">Features</a>
            <a className="text-zinc-500 hover:text-white text-[13px] font-semibold tracking-tight transition-colors" href="#">How it Works</a>
            <a className="text-zinc-500 hover:text-white text-[13px] font-semibold tracking-tight transition-colors" href="#">Pricing</a>
          </nav>
          <div className="flex items-center gap-6">
            <Button variant="outline" className="hidden sm:flex border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900">
               Get Started
            </Button>
            <button className="flex items-center justify-center rounded-full h-9 w-9 bg-zinc-900/50 border border-zinc-800 text-zinc-500 hover:text-white transition-all hover:border-zinc-700">
               <UserCircle size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col items-center">
        <div className="max-w-[1200px] w-full px-6 md:px-12">
          
          {/* --- Hero Section --- */}
          <section className="flex flex-col gap-12 py-20 md:py-32 lg:flex-row items-center">
            <div className="flex flex-col gap-8 flex-1 text-center lg:text-left">
              <div className="inline-flex self-center lg:self-start items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 text-zinc-400 border border-zinc-800 text-[10px] font-bold uppercase tracking-[0.2em]">
                <Search size={14} className="text-zinc-500" />
                Instant Organization
              </div>
              <h1 className="text-white text-5xl font-black leading-[1.1] tracking-tight md:text-7xl">
                Master Your <br className="hidden md:block"/><span className="text-white">Telegram Content</span>
              </h1>
              <p className="text-zinc-500 text-lg md:text-xl font-medium leading-relaxed max-w-xl mx-auto lg:mx-0">
                Transform chaotic channels into beautifully organized learning hubs. 
                Just paste a link to start scanning and indexing your educational resources.
              </p>

              <div className="flex flex-col sm:row w-full max-w-[560px] mx-auto lg:mx-0 gap-3 mt-4">
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-700 group-focus-within:text-zinc-500 transition-colors">
                      <LinkIcon size={20} />
                    </div>
                    <Input 
                      className="w-full h-14 pl-12 pr-4 rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-100 focus:ring-0 focus:border-zinc-600 outline-none transition-all placeholder:text-zinc-700" 
                      placeholder="Channel link or @username"
                      value={channelInput}
                      onChange={e => setChannelInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !isScanning && handleScan()}
                    />
                  </div>
                  <Button 
                    className="h-14 px-8 rounded-xl bg-white text-zinc-950 font-bold text-base transition-all hover:bg-zinc-200 active:scale-95 whitespace-nowrap shadow-xl shadow-white/5"
                    onClick={handleScan}
                    disabled={isScanning || !channelInput.trim()}
                  >
                    {isScanning ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : "Scan Channel"}
                  </Button>
                </div>
                {scanError && (
                  <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 p-3 rounded-lg border border-destructive/20 mt-2">
                    <AlertCircle size={14} />
                    <span>{scanError}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4 justify-center lg:justify-start mt-2">
                <div className="flex -space-x-2">
                   {[1,2,3].map(i => (
                     <div key={i} className="size-8 rounded-full border-2 border-[#09090b] bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                       {i}
                     </div>
                   ))}
                </div>
                <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.15em]"><span className="text-zinc-300">10k+</span> learners joined this month</p>
              </div>
            </div>

            <div className="flex-1 w-full max-w-[500px] relative hidden lg:block">
              <div className="absolute -inset-4 bg-zinc-400/5 rounded-3xl blur-3xl opacity-40"></div>
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl flex items-center justify-center">
                 <div className="text-zinc-800 text-9xl font-black opacity-10">TVO</div>
              </div>
            </div>
          </section>

          {/* --- Features Section --- */}
          <section className="py-24 border-t border-zinc-900">
            <div className="flex flex-col gap-4 mb-16 text-center md:text-left">
              <h2 className="text-white text-4xl font-bold tracking-tight">Powerful Organization</h2>
              <p className="text-zinc-500 text-lg font-medium max-w-2xl leading-relaxed">
                Everything you need to manage educational content from Telegram in one unified workspace.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: 'Video Library', desc: 'Stream and organize video lessons seamlessly. Auto-detect timestamps.', icon: <VideoIcon size={24} /> },
                { title: 'Document Viewer', desc: 'View PDFs, slides, and spreadsheets directly in your browser.', icon: <FileText size={24} /> },
                { title: 'File Manager', desc: 'Categorize files with advanced tagging and unified global search.', icon: <Folder size={24} /> },
              ].map((f, i) => (
                <div key={i} className="group flex flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 transition-all hover:bg-zinc-900/50 card-hover">
                  <div className="size-14 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center group-hover:bg-white group-hover:text-zinc-950 transition-all duration-300">
                    {f.icon}
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-white text-xl font-bold">{f.title}</h3>
                    <p className="text-zinc-500 text-[15px] leading-relaxed font-medium">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* --- Your Channels Section --- */}
          <section className="py-24 border-t border-zinc-900">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-white text-3xl font-bold tracking-tight">Your Channels</h2>
              <button className="text-zinc-400 text-[11px] font-bold tracking-[0.15em] uppercase flex items-center gap-2 hover:text-white transition-all">
                View all <ChevronRight size={18} />
              </button>
            </div>

            {loadingChannels ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">Accessing Vault...</p>
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-4 border border-dashed border-destructive/50 rounded-2xl bg-destructive/10">
                 <AlertCircle className="w-8 h-8 text-destructive" />
                 <p className="font-semibold text-destructive">{fetchError}</p>
                 <Button onClick={() => window.location.reload()} variant="outline" className="mt-2" size="sm">
                   Try Again
                 </Button>
              </div>
            ) : channels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-4 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/10">
                 <p className="font-semibold text-zinc-500">No channels in your library</p>
                 <p className="text-sm max-w-xs text-center">Scan a public Telegram channel to start building your knowledge base.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {channels.map(ch => (
                  <div 
                    key={ch.id} 
                    className="group flex flex-col bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer card-hover"
                    onClick={() => router.push(`/channel/${ch.username}`)}
                  >
                    <div className="aspect-video w-full bg-zinc-900 relative">
                       <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-transparent"></div>
                       <div className="absolute bottom-4 left-4 flex items-center gap-2">
                          <Avatar className="size-8 border border-zinc-800 shadow-lg">
                            <AvatarFallback className="bg-zinc-800 text-white font-bold text-xs uppercase">
                              {ch.title?.charAt(0) || ch.username.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                       </div>
                       <div className="absolute top-4 right-4 bg-white text-zinc-950 text-[9px] font-black px-2 py-1 rounded uppercase tracking-wider">
                         {ch.videoCount} Videos
                       </div>
                    </div>
                    <div className="p-6">
                      <h4 className="text-white text-[15px] font-bold mb-4 flex justify-between items-center truncate">
                        {ch.title || ch.username}
                      </h4>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase tracking-[0.1em]">
                          <FileText size={14} className="text-zinc-600" />
                          {ch.fileCount} files
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase tracking-[0.1em]">
                          <LinkIcon size={14} className="text-zinc-600" />
                          @{ch.username}
                        </div>
                      </div>
                      <div className="mt-6">
                        <button className="w-full h-11 rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-400 text-[12px] font-bold uppercase tracking-widest group-hover:bg-white group-hover:text-zinc-950 group-hover:border-white transition-all duration-300">
                          Open Vault
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* --- Footer --- */}
      <footer className="mt-auto py-20 px-6 md:px-12 border-t border-zinc-900 bg-[#09090b] flex flex-col items-center">
        <div className="max-w-[1200px] w-full flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="flex flex-col items-start gap-4">
            <div className="text-xl font-black text-white px-2 py-1 border border-white/20 rounded">TVO</div>
            <p className="text-zinc-500 text-[14px] font-medium max-w-xs leading-relaxed">
              Making Telegram knowledge accessible and organized for everyone. Built for modern learners.
            </p>
          </div>
          <div className="flex flex-wrap gap-16">
            <div className="flex flex-col gap-5">
              <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-zinc-800 pb-1 inline-block">Platform</span>
              <div className="flex flex-col gap-3">
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">Pricing</a>
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">API</a>
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">Extension</a>
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-zinc-800 pb-1 inline-block">Support</span>
              <div className="flex flex-col gap-3">
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">Guide</a>
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">Privacy</a>
                <a className="text-zinc-500 text-[13px] font-bold hover:text-white transition-colors" href="#">Terms</a>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-[1200px] w-full mt-20 pt-8 border-t border-zinc-900 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-zinc-700 text-[10px] font-bold uppercase tracking-[0.2em]">© 2024 Telegram Learning. All rights reserved.</p>
          <div className="flex gap-6">
            <a className="text-zinc-700 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]" href="#">Twitter</a>
            <a className="text-zinc-700 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]" href="#">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
