'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  Plus, 
  Video as VideoIcon, 
  File as FileIcon, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  BookOpen, 
  Play, 
  Download, 
  LayoutGrid, 
  FileText, 
  Rocket, 
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Share2,
  Upload
} from 'lucide-react'
import { Batch, getBatches, deleteBatch, getBatchSequence, SequenceItem, Video, TelegramFile, API_BASE } from '@/lib/api'
import NewBatchModal from './NewBatchModal'
import DocumentModal from './DocumentModal'
import { ExportBatchModal, ImportBatchModal } from './BatchShareModal'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn, cleanTitle, formatDuration } from '@/lib/utils'

interface BatchManagerProps {
  channelId: number
  channelUsername: string
  initialBatchId?: number
}

export default function BatchManager({ channelId, channelUsername, initialBatchId }: BatchManagerProps) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [exportingBatch, setExportingBatch] = useState<Batch | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  const fetchBatches = async () => {
    try {
      const data = await getBatches(channelId)
      setBatches(data)
      if (selectedBatch) {
        const updated = data.find(b => b.id === selectedBatch.id)
        if (updated) setSelectedBatch(updated)
      } else if (initialBatchId) {
        const found = data.find(b => b.id === initialBatchId)
        if (found) setSelectedBatch(found)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBatches()
  }, [channelId, initialBatchId])

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-zinc-500">
        <div className="size-8 rounded-full border-2 border-zinc-800 border-t-white animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">Loading Batches...</p>
      </div>
    )
  }

  // --- MODE A: DETAIL VIEW (When user clicks on a batch) ---
  if (selectedBatch) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Button 
          variant="outline" 
          onClick={() => setSelectedBatch(null)}
          className="gap-2 bg-[#111113] border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg text-xs font-semibold"
        >
          <ArrowLeft size={16} /> Back to Batches
        </Button>

        <BatchDetail 
          batch={selectedBatch} 
          channelUsername={channelUsername} 
        />

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

  // --- MODE B: LIST VIEW (Clean scrollable grid/list of batches) ---
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Batches & Modules</h2>
          <p className="text-xs text-zinc-400">Select a batch to access structured lectures and notes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowImportModal(true)}
            className="gap-2 bg-[#111113] border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg text-xs font-semibold px-3 h-9"
          >
            <Upload size={14} /> Import Batch
          </Button>
          <Button 
            onClick={() => { setEditingBatch(null); setShowModal(true); }}
            className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} /> Create Batch
          </Button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-[#111113]">
          <BookOpen size={36} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-sm font-semibold text-zinc-300 mb-1">No Batches Created</p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">Organize your channel's videos into structured modules by creating or importing a batch.</p>
          <div className="flex items-center justify-center gap-3">
            <Button 
              onClick={() => { setEditingBatch(null); setShowModal(true); }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
            >
              Create First Batch
            </Button>
            <Button 
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold rounded-lg"
            >
              Import Batch
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <Card 
              key={b.id}
              onClick={() => setSelectedBatch(b)}
              className="group cursor-pointer p-5 bg-[#111113] border-zinc-800 rounded-xl hover:border-zinc-700 transition-all hover:shadow-xl flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base text-zinc-100 group-hover:text-white line-clamp-2 leading-snug">
                    {b.name}
                  </h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setExportingBatch(b); }}
                      className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10"
                      title="Share / Export Batch"
                    >
                      <Share2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleEdit(b, e)}
                      className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800"
                      title="Edit Batch"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(b.id, e)}
                      className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                      title="Delete Batch"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-zinc-800/60">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <VideoIcon size={14} className="text-indigo-400" /> {b.videoCount} Videos
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <FileIcon size={14} className="text-zinc-500" /> {b.fileCount} Files
                  </span>
                </div>

                <Button className="w-full h-8 bg-[#18181b] hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg justify-between group-hover:text-white transition-colors">
                  <span>Explore Batch</span>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewBatchModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)}
        onSuccess={fetchBatches}
        channelId={channelId}
        editingBatch={editingBatch}
      />

      <ExportBatchModal
        isOpen={!!exportingBatch}
        onClose={() => setExportingBatch(null)}
        batch={exportingBatch}
        channelUsername={channelUsername}
      />

      <ImportBatchModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        channelId={channelId}
        onSuccess={fetchBatches}
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

  // --- CONTINUE WATCHING / LAST WATCHED VIDEO LOGIC ---
  const lastWatchedVideo = useMemo(() => {
    const vids = items.filter(i => i.item_type === 'video') as Video[]
    if (vids.length === 0) return null

    // 1. First priority: video with percentage > 0 and not completed
    const inProgress = vids.filter(v => (v.watched_percentage || 0) > 0 && !v.completed)
    if (inProgress.length > 0) {
      // Pick the highest progress or last updated by progress_updated_at
      const sortedInProgress = [...inProgress].sort((a, b) => {
        const dateA = a.progress_updated_at ? new Date(a.progress_updated_at).getTime() : 0;
        const dateB = b.progress_updated_at ? new Date(b.progress_updated_at).getTime() : 0;
        return dateA - dateB;
      });
      return sortedInProgress[sortedInProgress.length - 1]
    }

    // 2. Fallback: First video of batch if no progress started yet
    return vids[0]
  }, [items])

  const completionStats = useMemo(() => {
    const videos = items.filter(i => i.item_type === 'video') as Video[]
    if (videos.length === 0) return 0
    const watched = videos.filter(v => (v.watched_percentage || 0) >= 90 || v.completed).length
    return Math.round((watched / videos.length) * 100)
  }, [items])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 space-y-3 text-zinc-500">
      <div className="size-8 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
      <p className="text-xs font-semibold text-zinc-500">Loading batch content...</p>
    </div>
  )

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-300">
      
      {/* --- HERO & CONTINUE WATCHING BANNER --- */}
      <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-xs font-semibold">
                Batch Module
              </Badge>
              <span className="text-xs text-zinc-500">• {items.length} items</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{batch.name}</h1>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 p-4 rounded-xl space-y-2 min-w-[240px]">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-zinc-400">Batch Completion</span>
              <span className="text-white">{completionStats}%</span>
            </div>
            <Progress value={completionStats} className="h-1.5 bg-zinc-900 [&>div]:bg-indigo-500" />
          </div>
        </div>

        {/* --- CONTINUE WATCHING CARD AT TOP --- */}
        {lastWatchedVideo && (
          <div className="bg-[#18181b] border border-indigo-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <Sparkles size={14} />
                {(lastWatchedVideo.watched_percentage || 0) > 0 ? 'Continue Watching' : 'Start Next Lecture'}
              </div>
              <h3 className="font-semibold text-base text-white line-clamp-1">
                {cleanTitle(lastWatchedVideo.title)}
              </h3>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                {lastWatchedVideo.duration > 0 && <span>{formatDuration(lastWatchedVideo.duration)}</span>}
                {lastWatchedVideo.duration > 0 && <span>•</span>}
                <span>{(lastWatchedVideo.watched_percentage || 0) > 0 ? `${Math.round(lastWatchedVideo.watched_percentage)}% watched` : 'Not started'}</span>
              </div>
            </div>

            <Button 
              asChild
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg px-6 h-10 shrink-0 gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Link href={`/video/${lastWatchedVideo.id}`}>
                <Play size={16} fill="currentColor" />
                {(lastWatchedVideo.watched_percentage || 0) > 0 ? 'Resume Lecture' : 'Start Lecture'}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* --- CONTENT FILTER TOOLBAR --- */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: 'All Items', icon: <LayoutGrid size={14} /> },
            { id: 'video', label: 'Videos Only', icon: <Play size={14} /> },
            { id: 'file', label: 'Documents Only', icon: <FileText size={14} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                filter === t.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-500 font-medium">
          Showing {filteredItems.length} of {items.length} items
        </span>
      </div>

      {/* --- SEQUENCE LIST --- */}
      <div className="space-y-3">
        {filteredItems.map((item, idx) => {
          const isVideo = item.item_type === 'video'
          const file = item as TelegramFile
          const video = item as Video
          const ext = (file.file_name?.split('.').pop() || '').toUpperCase()
          const isViewable = !isVideo && (['PDF', 'JPG', 'PNG', 'JPEG', 'WEBP'].includes(ext) || file.mime_type === 'application/pdf')

          return (
            <div 
              key={`${item.item_type}-${item.id}`}
              onClick={() => {
                if (isVideo) {
                  window.location.href = `/video/${item.id}`
                } else {
                  isViewable ? setSelectedFile(file) : window.open(`https://t.me/${channelUsername}/${item.message_id}`, '_blank')
                }
              }}
              className="group flex items-center justify-between gap-4 p-4 rounded-xl bg-[#111113] border border-zinc-800 hover:border-zinc-700 hover:bg-[#18181b] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="size-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-colors shrink-0">
                  {isVideo ? <Play size={16} fill={video.watched_percentage > 0 ? "currentColor" : "none"} /> : <FileText size={16} />}
                </div>

                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-zinc-100 group-hover:text-white truncate" title={isVideo ? cleanTitle(video.title) : file.file_name}>
                    {isVideo ? cleanTitle(video.title) : file.file_name}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    <span>{isVideo ? `Video • ${formatDuration(video.duration)}` : `${ext || 'File'} • ${(file.file_size / 1024 / 1024).toFixed(1)} MB`}</span>
                    {isVideo && video.watched_percentage > 0 && (
                      <span className="text-indigo-400 font-medium">• {Math.round(video.watched_percentage)}% watched</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isVideo ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs font-semibold text-zinc-400 group-hover:text-white group-hover:bg-zinc-800">
                    Play <ChevronRight size={14} />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8 text-xs font-semibold text-zinc-400 group-hover:text-white group-hover:bg-zinc-800">
                    {isViewable ? 'View' : 'Download'} <ExternalLink size={14} className="ml-1" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedFile && (
        <DocumentModal 
          isOpen={!!selectedFile}
          onClose={() => setSelectedFile(null)} 
          fileUrl={`${API_BASE}/api/stream/file/${selectedFile.id}`}
          fileName={selectedFile.file_name || 'Document'}
          mimeType={selectedFile.mime_type}
        />
      )}
    </div>
  )
}
