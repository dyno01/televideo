'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, Search, Tv, FileText, FolderOpen, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { scanChannel, getChannels, Channel } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function HomePage() {
  const router = useRouter()
  const [channelInput, setChannelInput] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)

  useEffect(() => {
    getChannels()
      .then(setChannels)
      .catch(() => {})
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
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-6xl mx-auto px-6 py-12 lg:py-24 space-y-24">
        
        {/* --- Hero --- */}
        <section className="text-center space-y-6 max-w-2xl mx-auto">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-2">
            <GraduationCap className="w-10 h-10" />
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight">
            Telegram <span className="text-muted-foreground">Learning</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Organize Telegram content into a premium dashboard. Track progress, notes, and resources seamlessly.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <div className="relative flex-1 group">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
               <Input 
                placeholder="Enter channel link or @username" 
                className="pl-9 h-12 border-muted/50 focus-visible:ring-primary/20"
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isScanning && handleScan()}
               />
            </div>
            <Button size="lg" className="h-12 px-8 font-semibold" onClick={handleScan} disabled={isScanning || !channelInput.trim()}>
              {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Scan Channel
            </Button>
          </div>

          {scanError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/5 p-3 rounded-lg border border-destructive/10 animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4" />
              <span>{scanError}</span>
            </div>
          )}
        </section>

        {/* --- Features --- */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card/50 border-muted/30 hover:border-primary/30 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-2">
                <Tv className="w-5 h-5" />
              </div>
              <CardTitle className="text-base">Video Library</CardTitle>
              <CardDescription className="text-xs">Structured video lectures with real-time progress saving.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="bg-card/50 border-muted/30 hover:border-amber-500/30 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mb-2">
                <FileText className="w-5 h-5" />
              </div>
              <CardTitle className="text-base">Document Viewer</CardTitle>
              <CardDescription className="text-xs">In-app PDF and image viewing with a premium modal experience.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="bg-card/50 border-muted/30 hover:border-emerald-500/30 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2">
                <FolderOpen className="w-5 h-5" />
              </div>
              <CardTitle className="text-base">File Manager</CardTitle>
              <CardDescription className="text-xs">Chronological organization of all shared resources and files.</CardDescription>
            </CardHeader>
          </Card>
        </section>

        {/* --- Recent Channels --- */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-muted pb-4">
             <h2 className="text-xl font-bold tracking-tight">Your Channels</h2>
             {!loadingChannels && channels.length > 0 && (
               <Badge variant="secondary" className="px-3">{channels.length} Imported</Badge>
             )}
          </div>

          {loadingChannels ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm font-medium">Fetching your workspace...</p>
            </div>
          ) : channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4 border-2 border-dashed border-muted rounded-2xl bg-muted/5">
              <div className="p-4 rounded-full bg-muted/20">
                <GraduationCap className="w-12 h-12 opacity-50" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">No channels found</p>
                <p className="text-sm max-w-xs mx-auto">Start by scanning a Telegram channel above to organize your learning.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {channels.map(ch => (
                <Card 
                  key={ch.id} 
                  className="group cursor-pointer border-muted/50 hover:border-primary/50 hover:bg-muted/10 transition-all duration-300"
                  onClick={() => router.push(`/channel/${ch.username}`)}
                >
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                    <Avatar className="w-12 h-12 rounded-xl">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-white font-bold text-lg">
                        {ch.title?.charAt(0)?.toUpperCase() || ch.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{ch.title || ch.username}</CardTitle>
                      <CardDescription className="text-xs truncate">@{ch.username}</CardDescription>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity translate-x-1" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-4 pt-2 border-t border-muted/50">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Tv className="w-3.5 h-3.5 text-primary/70" />
                        <span className="font-medium text-foreground">{ch.videoCount}</span> videos
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span className="font-medium text-foreground">{ch.fileCount}</span> files
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
