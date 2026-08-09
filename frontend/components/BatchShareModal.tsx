'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Share2, Copy, Check, Download, Upload, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { Batch, createBatch } from '@/lib/api'

// --- EXPORT SHARE MODAL ---
interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  batch: Batch | null
  channelUsername: string
}

export function ExportBatchModal({ isOpen, onClose, batch, channelUsername }: ExportModalProps) {
  const [copied, setCopied] = useState(false)

  if (!batch) return null

  const shareData = {
    type: 'televideo_batch',
    version: '1.0',
    name: batch.name,
    channelUsername: channelUsername,
    tgLink: batch.tg_link,
    startMsgId: batch.start_msg_id,
    endMsgId: batch.end_msg_id,
    exportedAt: new Date().toISOString()
  }

  const shareCode = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))))

  const handleCopy = () => {
    navigator.clipboard.writeText(shareCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(shareData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_batch.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#111113] border-zinc-800 text-zinc-100 p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="size-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Share2 size={20} />
          </div>
          <DialogTitle className="text-xl font-bold text-white">Share Batch Module</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Share <span className="text-white font-semibold">{batch.name}</span> with other users so they can import it into their dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-400">Batch Share Code</label>
            <div className="relative">
              <Textarea 
                readOnly 
                value={shareCode} 
                className="bg-[#18181b] border-zinc-800 text-xs font-mono h-24 text-zinc-300 resize-none pr-12 focus-visible:ring-indigo-500"
              />
              <Button
                size="sm"
                onClick={handleCopy}
                className="absolute right-2 top-2 h-8 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleCopy}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 rounded-xl gap-2"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Code Copied!' : 'Copy Share Code'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              className="bg-[#18181b] border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-semibold h-10 rounded-xl gap-2"
            >
              <Download size={16} /> JSON File
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- IMPORT SHARE MODAL ---
interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  channelId: number
  onSuccess: () => void
}

export function ImportBatchModal({ isOpen, onClose, channelId, onSuccess }: ImportModalProps) {
  const [inputCode, setInputCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleImport = async () => {
    const raw = inputCode.trim()
    if (!raw) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      let parsed: any = null
      
      // Try decoding Base64 first
      try {
        const decoded = decodeURIComponent(escape(atob(raw)))
        parsed = JSON.parse(decoded)
      } catch {
        // Fallback: direct JSON parse
        parsed = JSON.parse(raw)
      }

      if (!parsed || !parsed.name || (!parsed.tgLink && (!parsed.startMsgId || !parsed.endMsgId))) {
        throw new Error('Invalid Batch Share Code format.')
      }

      const tgLink = parsed.tgLink || `https://t.me/c/${parsed.channelId || 0}/${parsed.startMsgId}-${parsed.endMsgId}`
      await createBatch(channelId, parsed.name, tgLink)

      setSuccess(`Successfully imported "${parsed.name}" batch module!`)
      onSuccess()
      setTimeout(() => {
        onClose()
        setInputCode('')
        setSuccess('')
      }, 1500)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to import batch module.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        setInputCode(content)
      }
    }
    reader.readAsText(file)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#111113] border-zinc-800 text-zinc-100 p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="size-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Upload size={20} />
          </div>
          <DialogTitle className="text-xl font-bold text-white">Import Batch Module</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Paste a Share Code or upload a <span className="text-white font-semibold">.json</span> file created by another user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-400">Paste Batch Share Code</label>
            <Textarea
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Paste Base64 share code or JSON content..."
              className="bg-[#18181b] border-zinc-800 text-xs font-mono h-24 text-zinc-200 resize-none focus-visible:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="cursor-pointer text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5">
              <Upload size={14} /> Upload .json File
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <Button
            onClick={handleImport}
            disabled={loading || !inputCode.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 rounded-xl gap-2 shadow-lg shadow-indigo-600/20"
          >
            {loading ? <Loader2 className="animate-spin size-4" /> : 'Import & Scan Batch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
