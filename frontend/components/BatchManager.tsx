'use client'

import { useState, useEffect } from 'react'
import { Plus, List, Video as VideoIcon, File as FileIcon, Edit2, Trash2, Link as LinkIcon, ChevronRight, BookOpen, Clock, CheckCircle, Loader2 } from 'lucide-react'
import { Channel, Batch, getBatches, deleteBatch, getBatchSequence, SequenceItem, Video, TelegramFile, API_BASE } from '@/lib/api'
import NewBatchModal from './NewBatchModal'
import DocumentModal from './DocumentModal'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, cleanTitle } from '@/lib/utils'

interface BatchManagerProps {
  channelId: number
  channelUsername: string
}

export default function BatchManager({ channelId, channelUsername }: BatchManagerProps) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)

  const fetchBatches = async () => {
    try {
      const data = await getBatches(channelId)
      setBatches(data)
      if (selectedBatch) {
        const updated = data.find(b => b.id === selectedBatch.id)
        if (updated) setSelectedBatch(updated)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBatches()
  }, [channelId])

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this batch? Items will be untagged but not deleted.')) return
    await deleteBatch(id)
    fetchBatches()
    if (selectedBatch?.id === id) setSelectedBatch(null)
  }

  const handleEdit = (batch: Batch, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingBatch(batch)
    setShowModal(true)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[600px] animate-in fade-in duration-500">
      {/* --- Sidebar: Batch Inventory --- */}
      <aside className="w-full lg:w-[320px] shrink-0 space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-extrabold tracking-tight">Your Batches</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => { setEditingBatch(null); setShowModal(true); }}
            className="rounded-xl hover:bg-primary/10 hover:text-primary transition-all h-9 w-9"
          >
            <Plus size={20} />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-22rem)] min-h-[400px]">
          <div className="flex flex-col gap-2.5 pr-4">
            {batches.map((b) => (
              <Card 
                key={b.id}
                onClick={() => setSelectedBatch(b)}
                className={cn(
                  "group relative cursor-pointer transition-all duration-300 border-border/40 overflow-hidden shadow-none",
                  selectedBatch?.id === b.id 
                    ? "bg-primary/[0.03] border-primary/40 ring-1 ring-primary/20" 
                    : "bg-card/30 hover:bg-muted/50 hover:border-primary/20"
                )}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className={cn(
                      "font-bold text-sm truncate leading-tight",
                      selectedBatch?.id === b.id ? "text-primary" : "text-foreground"
                    )}>
                      {b.name}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 uppercase font-black tracking-widest leading-none">
                      <span className="flex items-center gap-1.5"><VideoIcon size={12} /> {b.videoCount}</span>
                      <span className="flex items-center gap-1.5"><FileIcon size={12} /> {b.fileCount}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    <Button 
                      variant="secondary" 
                      size="icon"
                      onClick={(e) => handleEdit(b, e)}
                      className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="icon"
                      onClick={(e) => handleDelete(b.id, e)}
                      className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {batches.length === 0 && !loading && (
              <div className="text-center py-16 border border-dashed border-border/40 rounded-3xl bg-muted/5">
                <BookOpen size={24} className="mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-6">
                  Vault Empty
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* --- Main View: Batch Studio --- */}
      <section className="flex-1 min-w-0 lg:border-l lg:border-border/50 lg:pl-8">
        {selectedBatch ? (
          <BatchDetail batch={selectedBatch} channelUsername={channelUsername} />
        ) : (
          <div className="max-w-3xl mx-auto w-full flex flex-col items-center justify-center text-center p-12 min-h-[500px] bg-muted/5 rounded-[40px] border border-dashed border-border/40 animate-pulse-subtle">
            <div className="relative mb-8">
               <div className="absolute inset-0 bg-primary/20 blur-[80px] rounded-full" />
               <div className="relative w-24 h-24 rounded-[32px] bg-background border border-border/50 flex items-center justify-center text-muted-foreground/20 shadow-2xl">
                 <List size={48} />
               </div>
            </div>
            <div className="space-y-4 max-w-sm">
              <h3 className="text-2xl font-black tracking-tight uppercase">Select a Batch</h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed opacity-60">
                Choose a curated batch from the sidebar to view its sequenced content and resources.
              </p>
            </div>
          </div>
        )}
      </section>

      <NewBatchModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)}
        onSuccess={fetchBatches}
        channelId={channelId}
        editingBatch={editingBatch}
      />
    </div>
  )
}

function BatchDetail({ batch, channelUsername }: { batch: Batch; channelUsername: string }) {
  const [items, setItems] = useState<SequenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<TelegramFile | null>(null)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await getBatchSequence(batch.id)
        setItems(data)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [batch.id])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm font-medium">Assembling sequence...</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-10">
      <div className="space-y-6 p-1">
        <h1 className="text-4xl font-black tracking-tight leading-none truncate">{batch.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="px-4 py-1.5 bg-primary/10 text-primary border-none text-[10px] font-black uppercase tracking-[0.1em] rounded-full">
            <LinkIcon size={12} className="mr-2" /> Range: {batch.start_msg_id} - {batch.end_msg_id}
          </Badge>
          <Badge variant="outline" className="px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] border-border/60 rounded-full">
            {items.length} Elements Discovered
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border border-border/10 rounded-[32px] overflow-hidden bg-muted/5 p-4 shadow-2xl shadow-black/20">
        {items.map((item) => {
          const isVideo = item.item_type === 'video'
          const file = item as TelegramFile
          const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
          const isViewable = !isVideo && ['PDF', 'JPG', 'PNG', 'JPEG', 'WEBP'].includes(ext)

          const CardContentInner = (
            <Card className="border-none bg-transparent hover:bg-card/40 transition-all cursor-pointer rounded-2xl overflow-hidden p-1">
              <CardContent className="p-3 flex items-center gap-5">
                <div className={cn(
                  "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 shadow-lg",
                  isVideo ? "bg-primary text-white" : "bg-muted/40 text-muted-foreground"
                )}>
                  {isVideo ? <VideoIcon size={20} className="fill-current" /> : <FileIcon size={20} />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-base font-bold truncate transition-colors group-hover:text-primary leading-tight">
                      {cleanTitle(isVideo ? (item as Video).title : file.file_name)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-black tabular-nums border border-border/20 px-2.5 py-1 rounded-lg uppercase tracking-widest bg-muted/20">
                      ID {item.message_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 font-black uppercase tracking-widest">
                    {isVideo ? (
                       <span className="flex items-center gap-2">
                         {(item as Video).completed 
                           ? <span className="text-emerald-500 flex items-center gap-1.5"><CheckCircle size={12} /> Finished</span> 
                           : <span className="flex items-center gap-2 italic"><Clock size={12} /> {Math.round((item as Video).watched_percentage || 0)}% Progress</span>}
                       </span>
                    ) : (
                      <span className="lowercase font-mono text-[9px]">{file.mime_type}</span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          )

          if (isVideo) {
            return (
              <Link 
                key={`${item.item_type}-${item.id}`}
                href={`/video/${item.id}`}
                className="group block"
              >
                {CardContentInner}
              </Link>
            )
          }

          return (
            <div 
              key={`${item.item_type}-${item.id}`}
              className="group block"
              onClick={() => isViewable ? setSelectedFile(file) : window.open(`https://t.me/${channelUsername}/${item.message_id}`, '_blank')}
            >
              {CardContentInner}
            </div>
          )
        })}
        {items.length === 0 && (
          <div className="py-32 text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-muted/20 flex items-center justify-center text-muted-foreground/10 outline outline-4 outline-muted/5">
              <List size={40} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/40">Empty Corridor</p>
              <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto font-medium">
                No items were found within this message range yet.
              </p>
            </div>
          </div>
        )}
      </div>
      {selectedFile && (
        <DocumentModal
          isOpen={!!selectedFile}
          onClose={() => setSelectedFile(null)}
          fileUrl={`${API_BASE}/api/stream/file/${selectedFile.id}`}
          fileName={selectedFile.file_name || 'Document'}
          mimeType={selectedFile.mime_type || 'application/octet-stream'}
        />
      )}
    </div>
  )
}
