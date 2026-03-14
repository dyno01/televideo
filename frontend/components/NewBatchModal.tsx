'use client'

import { useState, useEffect } from 'react'
import { Loader2, Link as LinkIcon, Info } from 'lucide-react'
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {editingBatch ? 'Modify Batch' : 'Assemble New Batch'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editingBatch 
              ? 'Update the name or range for this curated channel segment.' 
              : 'Define a specific range of messages to organize as a learning batch.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="batch-name" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mr-1">
              Title
            </Label>
            <Input
              id="batch-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Physics Phase 01: Kinematics"
              className="bg-card border-border/50 focus-visible:ring-primary/20 h-10"
              maxLength={120}
            />
            <div className="flex justify-end pr-1">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{name.length}/120</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg-link" className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
              Telegram Blueprint (Link or Range)
            </Label>
            <div className="relative group">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={14} />
              <Input
                id="tg-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="pl-9 bg-card border-border/50 focus-visible:ring-primary/20 h-10"
                placeholder="https://t.me/c/123/100-200"
              />
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-normal">
                Format: <code className="bg-background px-1 rounded font-mono text-[9px]">.../ID/start-end</code>
                {editingBatch && <span className="block mt-1 font-bold text-amber-500/80 italic">Updating the range will trigger a sequence rescan.</span>}
              </p>
            </div>
          </div>

          {error && (
            <div className="text-[11px] font-semibold text-destructive bg-destructive/5 p-2.5 rounded-lg border border-destructive/10 animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={loading || !name}
              className="w-full font-bold shadow-sm h-10"
            >
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              {editingBatch ? 'Synchronize Changes' : 'Initialize Discovery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
