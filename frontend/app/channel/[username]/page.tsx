'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Video as VideoIcon, FileText, Folder as FolderIcon, RefreshCw, Loader2, AlertCircle, Layers, ChevronRight } from 'lucide-react'
import { getChannel, getVideos, getFiles, scanChannel, type Channel, type Video, type TelegramFile } from '@/lib/api'
import LectureList from '@/components/LectureList'
import FileLibrary from '@/components/FileLibrary'
import BatchManager from '@/components/BatchManager'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'

type Tab = 'videos' | 'pdfs' | 'files' | 'batches'

export default function ChannelPage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string

  const [channel, setChannel] = useState<Channel | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [files, setFiles] = useState<TelegramFile[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('batches')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tab = searchParams.get('tab') as Tab
    if (tab && ['videos', 'pdfs', 'files', 'batches'].includes(tab)) {
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

  const counts = {
    videos: videos.length,
    pdfs: pdfs.length,
    files: docs.length
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4 text-muted-foreground bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm font-medium">Fetching contents...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-8 text-center border-destructive/20 bg-destructive/5 space-y-6">
        <AlertCircle size={48} className="mx-auto text-destructive" />
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-destructive">Wait, something went wrong</h3>
          <p className="text-sm text-destructive/80">{error}</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Workspace
        </Button>
      </Card>
    </div>
  )

  const totalContent = videos.length + files.length

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      {/* --- Sticky Header --- */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex text-muted-foreground hover:text-foreground">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" /> Home
              </Link>
            </Button>
            
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="w-10 h-10 rounded-xl">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-white font-bold">
                  {(channel?.title || username).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="font-bold text-sm truncate leading-tight">
                  {channel?.title || username}
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter">
                  {username.startsWith('__private__') ? `Private: ${username.replace('__private__', '')}` : `@${username}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex flex-col items-end text-right mr-4 border-r pr-4 border-border/50">
               <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Researched</span>
               <span className="text-lg font-black tracking-tighter">{totalContent} items</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRescan} 
              disabled={rescanning}
              className="bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 hover:text-primary"
            >
              {rescanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              <span className="hidden sm:inline">Refresh Data</span>
              <span className="sm:hidden">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* --- Main Dashboard --- */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        
        <Tabs value={activeTab} className="w-full flex flex-col items-center" onValueChange={(v) => setActiveTab(v as Tab)}>
          {/* Centered Tab Bar */}
          <div className="flex justify-center w-full mb-12">
            <div className="p-1 rounded-[24px] bg-muted/10 border border-border/10 backdrop-blur-xl shadow-2xl">
              <TabsList className="bg-transparent h-12 gap-1 p-1">
                <TabsTrigger value="batches" className="px-8 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl data-[state=active]:text-primary transition-all font-bold">
                  <Layers className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline whitespace-nowrap">Custom Batches</span>
                  <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-none px-1.5 h-4 text-[10px] font-black">PRO</Badge>
                </TabsTrigger>
                <TabsTrigger value="videos" className="px-8 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl data-[state=active]:text-primary transition-all font-bold">
                  <VideoIcon className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Videos</span>
                  <Badge variant="secondary" className="ml-2 bg-muted/50 text-muted-foreground border-none px-1.5 h-4 text-[10px] font-black">{counts.videos}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pdfs" className="px-8 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl data-[state=active]:text-primary transition-all font-bold">
                  <FileText className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">PDFs</span>
                  <Badge variant="secondary" className="ml-2 bg-muted/50 text-muted-foreground border-none px-1.5 h-4 text-[10px] font-black">{counts.pdfs}</Badge>
                </TabsTrigger>
                <TabsTrigger value="files" className="px-8 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl data-[state=active]:text-primary transition-all font-bold">
                  <FolderIcon className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Other Files</span>
                  <Badge variant="secondary" className="ml-2 bg-muted/50 text-muted-foreground border-none px-1.5 h-4 text-[10px] font-black">{counts.files}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Centered Content Cards */}
          <div className="w-full max-w-6xl mx-auto">
            <Card className="border-none bg-transparent shadow-none">
            <TabsContent value="batches" className="mt-0 focus-visible:outline-none">
               {channel && <BatchManager channelId={channel.id} channelUsername={username} />}
            </TabsContent>

            <TabsContent value="videos" className="mt-0 focus-visible:outline-none">
              {videos.length === 0 ? (
                <EmptyState icon={<VideoIcon className="w-12 h-12" />} message="No video lectures discovered in this channel yet." />
              ) : (
                <LectureList videos={videos} channelUsername={username} />
              ) }
            </TabsContent>

            <TabsContent value="pdfs" className="mt-0 focus-visible:outline-none">
              {pdfs.length === 0 ? (
                <EmptyState icon={<FileText className="w-12 h-12" />} message="No study guides or PDF notes found." />
              ) : (
                <FileLibrary files={pdfs} channelUsername={username} />
              )}
            </TabsContent>

            <TabsContent value="files" className="mt-0 focus-visible:outline-none">
              {docs.length === 0 ? (
                <EmptyState icon={<FolderIcon className="w-12 h-12" />} message="No other associated files discovered." />
              ) : (
                <FileLibrary files={docs} channelUsername={username} />
              )}
            </TabsContent>
          </Card>
        </div>
      </Tabs>
      </div>
    </main>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center space-y-6 rounded-3xl border-2 border-dashed border-muted/50 bg-muted/5">
      <div className="p-6 rounded-full bg-muted/20 text-muted-foreground/40">
        {icon}
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-lg">Nothing here yet</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{message}</p>
      </div>
      <Button variant="ghost" className="text-primary hover:bg-primary/5" onClick={() => window.location.reload()}>
        Refresh Discovery <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}
