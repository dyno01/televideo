'use client'

import { useState, useEffect } from 'react'
import { Loader2, Link as LinkIcon, Info, Sparkles } from 'lucide-react'
import { createBatch, updateBatch, Batch } from '@/lib/api'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NewBatchModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (b: Batch) => void
  channelId: number
  editingBatch?: Batch | null
}

export default function NewBatchModal({ isOpen, onClose, onSuccess, channelId, editingBatch }: NewBatchModalProps) {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      if (editingBatch) {
        setName(editingBatch.name)
        setLink(editingBatch.tg_link || '')
      } else {
        setName('')
        setLink('')
      }
      setError('')
    }
  }, [editingBatch, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Batch name is required'); return }
    if (!editingBatch && !link.trim()) { setError('Telegram link is required'); return }
    
    setLoading(true)
    setError('')
    try {
      if (editingBatch) {
        await updateBatch(editingBatch.id, { name, link })
        onSuccess({ ...editingBatch, name, tg_link: link })
      } else {
        const res = await createBatch(channelId, name, link)
        onSuccess(res.batch)
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save batch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] bg-[#1a1a1a] border border-zinc-800 rounded-2xl shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-8 bg-[#1e1e1e] border-b border-zinc-800/50">
          <div className="flex items-center gap-3 mb-4">
             <div className="size-10 rounded-xl bg-white flex items-center justify-center text-zinc-950 shadow-lg">
                <Sparkles size={20} fill="currentColor" />
             </div>
             <div className="flex flex-col">
                <DialogTitle className="text-2xl font-black tracking-tight text-white leading-tight">
                  {editingBatch ? 'Modify Batch' : 'Assemble New Batch'}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 text-xs font-medium uppercase tracking-widest mt-0.5">
                  Knowledge Curation Engine
                </DialogDescription>
             </div>
          </div>
          <p className="text-zinc-500 text-sm leading-relaxed">
            {editingBatch 
              ? 'Update the name or range for this curated channel segment.' 
              : 'Define a specific range of messages to organize as a learning batch.'}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="space-y-3">
            <Label htmlFor="batch-name" className="text-[10px] uppercase font-black tracking-[0.2em] text-zinc-600 block pl-1">
              Vault Title
            </Label>
            <Input
              id="batch-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Physics Phase 01: Kinematics"
              className="bg-zinc-900/50 border-zinc-800 text-zinc-100 focus:border-white h-12 rounded-xl transition-all placeholder:text-zinc-800"
              maxLength={120}
            />
            <div className="flex justify-end pr-1 transition-opacity">
              <span className="text-[10px] font-mono text-zinc-800 uppercase tracking-tighter">{name.length}/120</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="tg-link" className="text-[10px] uppercase font-black tracking-[0.2em] text-zinc-600 block pl-1">
              Telegram Blueprint
            </Label>
            <div className="relative group">
              <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-white transition-colors" size={16} />
              <Input
                id="tg-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="pl-12 bg-zinc-900/50 border-zinc-800 text-zinc-100 focus:border-white h-12 rounded-xl transition-all placeholder:text-zinc-800"
                placeholder="https://t.me/c/123/100-200"
              />
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <Info className="w-4 h-4 text-zinc-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                 <p className="text-[11px] text-zinc-500 leading-relaxed">
                   Enter a message link or range to sync content.
                 </p>
                 <code className="text-zinc-600 font-mono text-[9px] block">/channel/start-end</code>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-[11px] font-bold text-destructive bg-destructive/5 p-4 rounded-xl border border-destructive/10 animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="submit"
              disabled={loading || !name}
              className="w-full bg-white text-zinc-950 font-black h-14 rounded-xl hover:bg-zinc-200 active:scale-95 transition-all text-sm uppercase tracking-widest shadow-xl shadow-white/5"
            >
              {loading && <Loader2 size={18} className="mr-2 animate-spin" />}
              {editingBatch ? 'Sync Changes' : 'Initialize Discovery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
