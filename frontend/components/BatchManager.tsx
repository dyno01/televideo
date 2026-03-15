'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, List, Video as VideoIcon, File as FileIcon, Edit2, Trash2, Link as LinkIcon, ChevronRight, BookOpen, Clock, CheckCircle, Loader2, Play, Download, LayoutGrid, FileText, Rocket, Layers } from 'lucide-react'
import { Channel, Batch, getBatches, deleteBatch, getBatchSequence, SequenceItem, Video, TelegramFile, API_BASE } from '@/lib/api'
import NewBatchModal from './NewBatchModal'
import DocumentModal from './DocumentModal'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
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
    <div className="flex flex-col lg:flex-row gap-12 min-h-[700px] animate-in fade-in duration-700">
      {/* --- Sidebar: Batch Inventory --- */}
      <aside className="w-full lg:w-[320px] shrink-0 space-y-8">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-black tracking-tight text-white uppercase">Your Batches</h2>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => { setEditingBatch(null); setShowModal(true); }}
            className="rounded-xl border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-white hover:border-zinc-600 transition-all h-10 w-10 shadow-xl"
          >
            <Plus size={20} />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-25rem)] min-h-[450px]">
          <div className="flex flex-col gap-3 pr-4">
            {batches.map((b) => (
              <div 
                key={b.id}
                onClick={() => setSelectedBatch(b)}
                className={cn(
                  "group relative cursor-pointer px-5 py-5 rounded-[24px] border transition-all duration-500 overflow-hidden",
                  selectedBatch?.id === b.id 
                    ? "bg-white text-zinc-950 border-white shadow-[0_20px_50px_rgba(255,255,255,0.1)] active:scale-[0.98]" 
                    : "bg-zinc-900/20 border-zinc-900/50 hover:bg-zinc-900/40 hover:border-zinc-800"
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className={cn(
                      "font-black text-sm truncate leading-tight uppercase tracking-tight",
                      selectedBatch?.id === b.id ? "text-inherit" : "text-zinc-400 group-hover:text-zinc-200"
                    )}>
                      {b.name}
                    </span>
                    <div className={cn(
                      "flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.15em] leading-none",
                      selectedBatch?.id === b.id ? "text-zinc-600" : "text-zinc-600"
                    )}>
                      <span className="flex items-center gap-1.5"><VideoIcon size={12} strokeWidth={3} /> {b.videoCount}</span>
                      <span className="flex items-center gap-1.5"><FileIcon size={12} strokeWidth={3} /> {b.fileCount}</span>
                    </div>
                  </div>
                  
                  <div className={cn(
                    "flex items-center gap-1 transition-all transform",
                    selectedBatch?.id === b.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                  )}>
                    <button 
                      onClick={(e) => handleEdit(b, e)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        selectedBatch?.id === b.id ? "text-zinc-400 hover:text-zinc-950" : "text-zinc-600 hover:text-white"
                      )}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(b.id, e)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        selectedBatch?.id === b.id ? "text-zinc-400 hover:text-red-500" : "text-zinc-600 hover:text-destructive"
                      )}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {batches.length === 0 && !loading && (
              <div className="text-center py-20 border-2 border-dashed border-zinc-900 rounded-[32px] bg-zinc-900/10">
                <BookOpen size={32} className="mx-auto text-zinc-800 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-700 px-6">
                  Curated Vault Empty
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* --- Main View: Batch Studio --- */}
      <section className="flex-1 min-w-0">
        {selectedBatch ? (
          <BatchDetail batch={selectedBatch} channelUsername={channelUsername} />
        ) : (
          <div className="max-w-4xl mx-auto w-full flex flex-col items-center justify-center text-center p-16 min-h-[600px] bg-zinc-900/10 rounded-[60px] border border-dashed border-zinc-800/50 shadow-inner">
            <div className="relative mb-10">
               <div className="absolute inset-0 bg-white/5 blur-[120px] rounded-full" />
               <div className="relative w-32 h-32 rounded-[48px] bg-[#0d0d0d] border border-zinc-800 flex items-center justify-center text-zinc-800 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
                 <List size={64} strokeWidth={1} />
               </div>
            </div>
            <div className="space-y-6 max-w-sm">
              <h3 className="text-3xl font-black tracking-tighter uppercase text-white">Initialize Sequence</h3>
              <p className="text-zinc-500 font-medium leading-relaxed">
                Unlock the curated learning path by selecting a batch from the sidebar. High-fidelity resources await.
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
  const [filter, setFilter] = useState<'all' | 'video' | 'file'>('all')

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

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(i => i.item_type === filter)
  }, [items, filter])

  const completionStats = useMemo(() => {
    const videos = items.filter(i => i.item_type === 'video') as Video[]
    if (videos.length === 0) return 0
    const watched = videos.filter(v => (v.watched_percentage || 0) > 90).length
    return Math.round((watched / videos.length) * 100)
  }, [items])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-40 space-y-6 text-zinc-500">
      <div className="relative size-16">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-900 border-t-white animate-spin" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-700 animate-pulse">Syncing Sequence</p>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-12 lg:space-y-16">
      {/* Cinematic Hero */}
      <div className="relative p-8 lg:p-16 rounded-[40px] lg:rounded-[48px] overflow-hidden bg-gradient-to-br from-[#121212] to-[#09090b] border border-zinc-800/50 shadow-3xl group">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          <div className="space-y-6 lg:space-y-8 flex-1">
             <nav className="flex items-center gap-3 text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
               <span>Course</span>
               <ChevronRight size={12} />
               <span className="text-zinc-300 truncate max-w-[150px] inline-block">{batch.name}</span>
             </nav>
             <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter leading-tight max-w-2xl">
                Mastering the {batch.name} Sequence
             </h2>
             <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Button className="w-full sm:w-max bg-white text-zinc-950 font-black h-12 px-10 rounded-2xl text-xs uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all active:scale-95 shadow-2xl shadow-white/5 group/btn">
                  <Rocket size={16} className="mr-3 group-hover/btn:-translate-y-1 transition-transform" />
                  Get Started
                </Button>
                <div className="flex items-center gap-6 px-6 h-12 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500 w-full sm:w-auto justify-center sm:justify-start">
                   <span className="text-zinc-300">{items.length} Elements</span>
                   <div className="w-px h-3 bg-zinc-800" />
                   <span className="text-white">ID {batch.start_msg_id}—{batch.end_msg_id}</span>
                </div>
             </div>
          </div>

          <div className="w-full lg:w-72 p-8 rounded-[32px] bg-zinc-950/50 border border-white/5 backdrop-blur-md shadow-2xl">
             <div className="flex justify-between items-center mb-6">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Course Progress</p>
                <span className="text-sm font-black text-white">{items.filter(i => i.item_type === 'video' && (i as Video).watched_percentage > 90).length}/{items.filter(i => i.item_type === 'video').length} Units</span>
             </div>
             <Progress value={completionStats} className="h-1.5 bg-zinc-900" />
             <div className="flex justify-between items-center mt-6">
                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                  {items.filter(i => i.item_type === 'video').length - items.filter(i => i.item_type === 'video' && (i as Video).watched_percentage > 90).length} remaining
                </span>
                <span className="text-sm font-black text-white">{completionStats}%</span>
             </div>
          </div>
        </div>
      </div>

      {/* Content Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-zinc-900 pb-10">
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/50 border border-zinc-800 shadow-inner w-full sm:w-auto overflow-x-auto no-scrollbar">
           {[
             { id: 'all', label: 'All Content', icon: <LayoutGrid size={14} /> },
             { id: 'video', label: 'Videos', icon: <Play size={14} /> },
             { id: 'file', label: 'PDFs', icon: <FileText size={14} /> },
           ].map(t => (
             <button
               key={t.id}
               onClick={() => setFilter(t.id as any)}
               className={cn(
                 "flex items-center gap-3 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                 filter === t.id ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-200"
               )}
             >
               {t.icon}
               {t.label}
             </button>
           ))}
        </div>
        
        <div className="hidden sm:flex items-center gap-4 text-zinc-500 text-[10px] font-black uppercase tracking-widest">
           <span>Sequence Sort</span>
           <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:text-white transition-colors cursor-pointer">
              <ChevronRight size={16} className="rotate-90" />
           </div>
        </div>
      </div>

      {/* Content Cards Grid */}
      <div className="space-y-8 lg:space-y-12">
        <div className="grid grid-cols-1 gap-4 lg:gap-6">
          <div className="pl-2 mb-2">
            <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em] flex items-center gap-6">
               Unit 01: Core Curriculum
               <span className="h-px flex-1 bg-zinc-900/50" />
            </h3>
          </div>
          {filteredItems.map((item) => {
            const isVideo = item.item_type === 'video'
            const file = item as TelegramFile
            const video = item as Video
            const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
            const isViewable = !isVideo && ['PDF', 'JPG', 'PNG', 'JPEG', 'WEBP'].includes(ext)
            const progress = isVideo ? Math.round(video.watched_percentage || 0) : 0

            return (
              <div 
                key={`${item.item_type}-${item.id}`}
                className="group relative flex flex-col sm:flex-row sm:items-center gap-6 p-6 rounded-[28px] lg:rounded-[36px] bg-zinc-950/30 border border-zinc-900/50 hover:bg-white/[0.03] hover:border-white/10 transition-all duration-500 cursor-pointer shadow-lg overflow-hidden"
                onClick={() => {
                  if (isVideo) {
                    window.location.href = `/video/${item.id}`
                  } else {
                    isViewable ? setSelectedFile(file) : window.open(`https://t.me/${channelUsername}/${item.message_id}`, '_blank')
                  }
                }}
              >
                {/* Side highlight */}
                <div className={cn(
                  "absolute left-0 top-0 w-1 h-full shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-opacity opacity-0 group-hover:opacity-100",
                  isVideo ? "bg-white" : "bg-zinc-700"
                )} />

                {/* Media Icon */}
                <div className={cn(
                  "size-14 sm:size-16 shrink-0 rounded-[20px] sm:rounded-[24px] flex items-center justify-center transition-all duration-500 group-hover:scale-105 shadow-inner",
                  isVideo ? "bg-white text-zinc-950 shadow-[0_15px_30px_rgba(255,255,255,0.1)]" : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                )}>
                  {isVideo ? <Play size={24} fill="currentColor" strokeWidth={0} /> : <FileText size={24} />}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col gap-3 lg:gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 lg:gap-6">
                    <div className="min-w-0">
                      <span className="text-lg lg:text-xl font-black truncate text-white block tracking-tight leading-none group-hover:translate-x-1 transition-transform">
                        {cleanTitle(isVideo ? video.title : file.file_name)}
                      </span>
                      <div className="flex items-center gap-3 mt-3">
                         <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest bg-zinc-900/80 px-2 py-0.5 rounded-lg border border-zinc-800/50">
                            {isVideo ? `VID-0${item.id}` : `DOC-0${item.id}`}
                         </span>
                         <span className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest hidden sm:inline">
                           {isVideo ? 'Digital Lecture' : `${ext} Resource`}
                         </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                       {isVideo && progress > 90 ? (
                         <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-500 text-[9px] font-black uppercase tracking-widest">
                           <CheckCircle size={12} />
                           Completed
                         </div>
                       ) : isVideo && progress > 0 ? (
                         <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-500 text-[9px] font-black uppercase tracking-widest">
                           {progress}% retention
                         </div>
                       ) : null}
                       
                       <div className="size-10 sm:size-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700 group-hover:bg-white group-hover:text-zinc-950 group-hover:border-white transition-all shadow-inner">
                          <Download size={18} />
                       </div>
                    </div>
                  </div>

                  {isVideo && (
                     <div className="flex items-center gap-4">
                        <div className="flex-1 h-1 bg-zinc-900/50 rounded-full overflow-hidden">
                           <div className={cn(
                             "h-full transition-all duration-500",
                             progress > 90 ? "bg-white" : "bg-zinc-400"
                           )} style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest shrink-0">
                           {progress > 90 ? 'Finished' : progress > 0 ? 'Learning' : 'Unseen'}
                        </span>
                     </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {items.length === 0 && (
          <div className="py-40 text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
            <div className="w-24 h-24 mx-auto rounded-[40px] bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-800 shadow-2xl">
              <Layers size={48} strokeWidth={1} />
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-800">Void Detected</p>
              <p className="text-zinc-600 max-w-xs mx-auto font-medium leading-relaxed">
                The curators have not yet sequenced resources for this message range.
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
