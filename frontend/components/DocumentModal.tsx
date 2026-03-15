'use client'

import { 
  Dialog, 
  DialogContent, 
} from '@/components/ui/dialog'
import PdfViewer from './PdfViewer'

interface DocumentModalProps {
  isOpen: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
  mimeType: string
}

export default function DocumentModal({ isOpen, onClose, fileUrl, fileName, mimeType }: DocumentModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-0 max-w-none w-screen h-screen p-0 bg-[#09090b] border-none flex flex-col shadow-2xl outline-none select-none translate-x-0 translate-y-0 top-0 left-0 rounded-none sm:max-w-none animate-none z-[100]">
        <PdfViewer 
          fileUrl={fileUrl}
          fileName={fileName}
          mimeType={mimeType}
          onClose={onClose}
          isStandalone={false}
        />
      </DialogContent>
    </Dialog>
  )
}
