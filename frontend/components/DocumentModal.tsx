'use client'

import { X, ExternalLink, Download, Maximize2, Loader2, FileText, ImageIcon, AlertCircle } from 'lucide-react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface DocumentModalProps {
  isOpen: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
  mimeType: string
}

export default function DocumentModal({ isOpen, onClose, fileUrl, fileName, mimeType }: DocumentModalProps) {
  const isImage = mimeType.startsWith('image/')
  const isPdf = mimeType.includes('pdf')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-[98vw] w-[98vw] sm:max-w-[98vw] h-[96vh] p-0 gap-0 flex flex-col overflow-hidden border-border/20 bg-background/95 backdrop-blur-2xl shadow-[0_0_80px_rgba(0,0,0,0.5)]"
      >
        {/* --- Header: Sleek Studio Toolbar --- */}
        <DialogHeader className="px-5 border-b border-border/10 flex flex-row items-center justify-between space-y-0 h-16 shrink-0 bg-muted/5 backdrop-blur-xl relative">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105",
              isPdf ? "bg-destructive/10 text-destructive" : isImage ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {isPdf ? <FileText size={18} /> : isImage ? <ImageIcon size={18} /> : <AlertCircle size={18} />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold truncate max-w-lg tracking-tight leading-none mb-1">
                {fileName}
              </DialogTitle>
              <DialogDescription className="text-[9px] uppercase font-black tracking-[0.15em] text-muted-foreground/50 leading-none">
                {isPdf ? 'Sanitized PDF' : 'Image Asset'} • Studio Mode
              </DialogDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-background/40 border border-border/5 shadow-inner">
              <Button variant="ghost" size="sm" asChild className="h-8 px-3 text-[11px] font-bold hover:bg-muted/50 transition-all rounded-lg">
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2 text-primary" /> 
                  <span className="hidden sm:inline">Source</span>
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild className="h-8 px-3 text-[11px] font-bold hover:bg-muted/50 transition-all rounded-lg">
                 <a href={fileUrl} download={fileName}>
                   <Download className="w-3.5 h-3.5 mr-2 text-primary" />
                   <span className="hidden sm:inline">Save</span>
                 </a>
              </Button>
            </div>

            <Button 
              variant="default" 
              size="sm" 
              onClick={onClose}
              className="h-10 px-6 text-[10px] font-black uppercase tracking-[0.25em] bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 rounded-xl transition-all active:scale-95"
            >
              Close Viewer
            </Button>
          </div>
        </DialogHeader>

        {/* --- Viewer Area --- */}
        <div className="flex-1 overflow-hidden relative bg-black/10 flex items-center justify-center">
          {isPdf ? (
            <div className="w-full h-full bg-[#323639] relative">
              <iframe 
                src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} 
                className="w-full h-full border-none inset-0 absolute"
                title={fileName}
              />
            </div>
          ) : isImage ? (
            <div className="w-full h-full p-4 md:p-12 flex items-center justify-center bg-checkered">
               <img 
                src={fileUrl} 
                alt={fileName} 
                className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-700"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8 p-12 text-center max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="w-24 h-24 rounded-[32px] bg-muted/20 flex items-center justify-center text-muted-foreground/30 shadow-inner">
                <Download size={48} />
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-black tracking-tight uppercase">Preview Unavailable</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                  This file type cannot be rendered directly in the dashboard.
                </p>
              </div>
              <Button size="lg" className="px-10 h-12 font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-105 transition-transform" asChild>
                <a href={fileUrl} download={fileName}>Save to Device</a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
