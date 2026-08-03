'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  X, 
  Download, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight,
  Minus,
  Plus,
  RotateCw,
  FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PdfViewerProps {
  fileUrl: string
  fileName: string
  mimeType: string
  onClose?: () => void
  isStandalone?: boolean
}

export default function PdfViewer({ fileUrl, fileName, mimeType, onClose, isStandalone = false }: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android|iphone|ipad|ipod/i.test(userAgent.toLowerCase())) {
      setIsMobile(true)
    }
  }, [])

  useEffect(() => {
    setPageInput(currentPage.toString())
  }, [currentPage])

  const handleClose = useCallback(() => {
    if (onClose) onClose()
    else if (isStandalone) window.close()
  }, [onClose, isStandalone])

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }, [])

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1)
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(50, prev - 25))
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(300, prev + 25))
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrevPage()
      } else if (e.key === 'ArrowRight') {
        handleNextPage()
      } else if (e.key === '=' || e.key === '+') {
        handleZoomIn()
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, handlePrevPage, handleNextPage, handleZoomIn, handleZoomOut])

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const p = parseInt(pageInput)
    if (!isNaN(p) && p > 0) {
      setCurrentPage(p)
    } else {
      setPageInput(currentPage.toString())
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0b] flex flex-col text-[#fafafa]">
      {/* TOOLBAR */}
      <div className="sticky top-0 h-14 border-b border-[#27272a] bg-[#0a0a0b] flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button 
            onClick={handleClose}
            className="p-2 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-lg transition-colors"
            aria-label="Close viewer"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-[#18181b] rounded-md text-[#a1a1aa] shrink-0">
              <FileText size={16} />
            </div>
            <h1 className="text-sm font-medium truncate max-w-[200px] sm:max-w-md">{fileName}</h1>
          </div>
        </div>

        {isPdf && (
          <div className="flex items-center justify-center flex-1">
            <div className="flex items-center gap-1 bg-[#111113] border border-[#27272a] rounded-lg p-1">
              <button 
                onClick={handlePrevPage}
                className="p-1.5 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-md transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <form onSubmit={handlePageSubmit} className="flex items-center">
                <input 
                  type="text"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="w-10 h-7 bg-transparent text-center text-sm font-medium focus:outline-none focus:bg-[#18181b] rounded-md"
                />
              </form>
              <button 
                onClick={handleNextPage}
                className="p-1.5 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-md transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-1 justify-end">
          {isPdf && (
            <div className="hidden sm:flex items-center gap-1 bg-[#111113] border border-[#27272a] rounded-lg p-1 mr-2">
              <button onClick={handleZoomOut} className="p-1.5 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-md transition-colors">
                <Minus size={16} />
              </button>
              <span className="text-xs font-medium w-12 text-center text-[#a1a1aa]">{zoom}%</span>
              <button onClick={handleZoomIn} className="p-1.5 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-md transition-colors">
                <Plus size={16} />
              </button>
              <div className="w-px h-4 bg-[#27272a] mx-1" />
              <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-1.5 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-md transition-colors">
                <RotateCw size={16} />
              </button>
            </div>
          )}
          
          <button onClick={toggleFullscreen} className="p-2 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-lg transition-colors">
            <Maximize2 size={18} />
          </button>
          
          <a 
            href={fileUrl}
            download={fileName}
            className="p-2 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded-lg transition-colors flex items-center gap-2"
          >
            <Download size={18} />
          </a>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className={cn("flex-1 overflow-auto bg-[#111113] p-4 sm:p-8 flex justify-center custom-scrollbar")}>
        {isPdf ? (
          <div 
            className="w-full max-w-5xl transition-transform duration-200 ease-out origin-top flex justify-center"
            style={{ 
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`
            }}
          >
            <div className="w-full bg-[#18181b] shadow-2xl min-h-[1100px] ring-1 ring-[#27272a] rounded-sm overflow-hidden">
              <iframe
                src={isMobile 
                  ? `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true` 
                  : `${fileUrl}#page=${currentPage}&toolbar=0`
                }
                className="w-full h-full min-h-[1100px] border-none"
                title={fileName}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-8 max-w-sm w-full text-center flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-[#27272a] rounded-2xl flex items-center justify-center text-[#a1a1aa]">
                <FileText size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-[#fafafa]">Preview not available</h3>
                <p className="text-sm text-[#a1a1aa]">This file type cannot be previewed directly in the browser.</p>
              </div>
              <a 
                href={fileUrl}
                download={fileName}
                className="inline-flex items-center justify-center gap-2 bg-[#fafafa] text-[#0a0a0b] hover:bg-[#e4e4e7] h-10 px-6 rounded-lg text-sm font-medium transition-colors w-full"
              >
                <Download size={16} />
                Download File
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
