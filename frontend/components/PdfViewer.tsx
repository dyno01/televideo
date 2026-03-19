'use client'

import { useState, useEffect } from 'react'
import { 
  X, 
  Download, 
  Maximize2, 
  Search, 
  Share2, 
  Printer, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  Grid,
  List as ListIcon,
  FileText,
  Bookmark,
  Edit2,
  StickyNote,
  Sparkles,
  MessageSquare,
  RotateCw,
  Minus,
  Plus,
  Menu,
  ArrowLeft,
  PanelLeftClose,
  PanelRightClose,
  PanelLeft,
  PanelRight,
  MessageCircle,
  History,
  Settings2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface PdfViewerProps {
  fileUrl: string
  fileName: string
  mimeType: string
  onClose?: () => void
  isStandalone?: boolean
}

export default function PdfViewer({ fileUrl, fileName, mimeType, onClose, isStandalone = false }: PdfViewerProps) {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [isMobileLeftOpen, setIsMobileLeftOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'thumbnails' | 'outline' | 'bookmarks'>('thumbnails')
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [isMobile, setIsMobile] = useState(false)
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  // Detect mobile
  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android|iphone|ipad|ipod/i.test(userAgent.toLowerCase())) {
      setIsMobile(true)
    }
  }, [])

  // Update page input when current page changes
  useEffect(() => {
    setPageInput(currentPage.toString())
  }, [currentPage])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return
    setCurrentPage(newPage)
  }

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
      document.documentElement.requestFullscreen()
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: fileName,
          url: window.location.href
        })
      } catch (err) {
        console.error('Error sharing:', err)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('Link copied to clipboard')
    }
  }

  const handlePrint = () => {
    const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement
    if (iframe) {
      iframe.contentWindow?.print()
    } else {
      window.print()
    }
  }

  const LeftSidebar = (
    <div className="flex flex-col h-full bg-[#09090b] border-r border-zinc-900 overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-8">
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Navigation</h2>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileLeftOpen(false)} className="text-zinc-500">
              <X size={18} />
            </Button>
          </div>

          <div>
            <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Content</h3>
            <nav className="flex flex-col gap-1">
              <button 
                onClick={() => setActiveTab('thumbnails')}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all group/nav",
                  activeTab === 'thumbnails' ? "bg-[#1a1a1a] text-white shadow-sm shadow-black/20" : "text-zinc-500 hover:bg-[#121212] hover:text-zinc-300"
                )}
              >
                <Grid size={18} className={cn("transition-colors", activeTab === 'thumbnails' ? "text-white" : "text-zinc-400 group-hover/nav:text-white")} />
                Thumbnails
              </button>
              <button 
                onClick={() => setActiveTab('outline')}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all group/nav",
                  activeTab === 'outline' ? "bg-[#1a1a1a] text-white shadow-sm shadow-black/20" : "text-zinc-500 hover:bg-[#121212] hover:text-zinc-300"
                )}
              >
                <ListIcon size={18} className={cn("transition-colors", activeTab === 'outline' ? "text-white" : "text-zinc-600 group-hover/nav:text-zinc-400")} />
                Outline
              </button>
              <button 
                onClick={() => setActiveTab('bookmarks')}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs transition-all group/nav",
                  activeTab === 'bookmarks' ? "bg-[#1a1a1a] text-white shadow-sm shadow-black/20" : "text-zinc-500 hover:bg-[#121212] hover:text-zinc-300"
                )}
              >
                <Bookmark size={18} className={cn("transition-colors", activeTab === 'bookmarks' ? "text-white" : "text-zinc-600 group-hover/nav:text-zinc-400")} />
                Bookmarks
              </button>
            </nav>
          </div>

          <div>
            <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Annotate</h3>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-zinc-900 bg-zinc-950/50 hover:border-zinc-700 hover:bg-[#121212] transition-all text-zinc-500 hover:text-white group/ann">
                <Edit2 size={18} className="text-zinc-600 group-hover/ann:text-white" />
                <span className="text-[10px] font-bold">Highlight</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-zinc-900 bg-zinc-950/50 hover:border-zinc-700 hover:bg-[#121212] transition-all text-zinc-500 hover:text-white group/ann">
                <StickyNote size={18} className="text-zinc-600 group-hover/ann:text-white" />
                <span className="text-[10px] font-bold">Note</span>
              </button>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )

  const RightSidebar = (
    <div className="flex flex-col h-full bg-[#09090b] border-l border-zinc-900 overflow-hidden">
      <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-white" />
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">AI Assistant</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setRightSidebarOpen(false)} className="text-zinc-500 h-8 w-8">
           <X size={14} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#121212] border border-zinc-900 space-y-3">
              <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">How can I help you understand this document today?</p>
              <div className="flex flex-wrap gap-2">
                {['Summarize', 'Key Concepts', 'Explain Notation'].map(tag => (
                  <button key={tag} className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-zinc-800 text-[9px] font-bold text-zinc-500 hover:text-white hover:border-zinc-600 transition-all">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center gap-2 px-1">
                <History size={14} className="text-zinc-700" />
                <h4 className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Session Logic</h4>
             </div>
             <div className="flex flex-col gap-2">
                {[
                  { icon: <MessageCircle size={14} />, text: 'Chat active', color: 'text-green-500' },
                  { icon: <Settings2 size={14} />, text: 'Model: Pro 1.5', color: 'text-zinc-500' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/50 border border-zinc-900">
                    <div className={item.color}>{item.icon}</div>
                    <span className="text-[10px] font-bold text-zinc-500">{item.text}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-zinc-900">
        <div className="relative">
          <input 
            className="w-full h-11 bg-[#1a1a1a] border border-zinc-800 rounded-xl pl-4 pr-10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:ring-1 focus:ring-white/5 transition-all outline-none"
            placeholder="Ask AI..."
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:scale-110 transition-transform">
             <ArrowLeft className="rotate-180" size={16} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-screen w-screen bg-[#09090b] flex flex-col overflow-hidden text-zinc-300 select-none">
      {/* --- Header --- */}
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-4 sm:px-6 bg-[#121212] z-[60] shrink-0">
        <div className="flex items-center gap-4 lg:gap-8 min-w-0 flex-1">
          <div className="flex items-center gap-2">
             <Button 
               variant="ghost" 
               size="icon" 
               className="text-zinc-500 hover:text-white hover:bg-[#1a1a1a] rounded-lg" 
               onClick={() => {
                 if (onClose) onClose()
                 else if (isStandalone) window.close()
               }}
             >
               <X size={20} />
             </Button>

             <div className="w-px h-6 bg-zinc-800 mx-1 hidden md:block" />

             <button 
              className="md:hidden size-10 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-[#1a1a1a] rounded-lg transition-all"
              onClick={() => setIsMobileLeftOpen(true)}
             >
              <Menu size={20} />
             </button>
             
             <button 
               className="hidden md:flex size-10 items-center justify-center text-zinc-500 hover:text-white hover:bg-[#1a1a1a] rounded-lg transition-all"
               onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
             >
               {leftSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
             </button>
          </div>

          <div className="flex items-center gap-4 min-w-0">
            <div className="size-9 bg-white rounded-lg flex items-center justify-center text-zinc-950 shadow-xl shadow-white/5 shrink-0">
              <FileText size={20} fill="currentColor" />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-sm font-bold text-white leading-none truncate max-w-[150px] sm:max-w-[400px]">{fileName}</h1>
              <span className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider font-bold truncate">{mimeType}</span>
            </div>
          </div>

          <div className="hidden lg:block w-px h-6 bg-zinc-800" />
          
          <nav className="hidden lg:flex items-center gap-1.5">
            {['File', 'Edit', 'Annotate'].map(item => (
              <button key={item} className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 max-w-lg px-8 hidden lg:block">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 size-4 group-focus-within:text-zinc-300 transition-colors" />
            <input 
              className="w-full h-10 bg-[#1a1a1a] border border-zinc-900 rounded-xl pl-11 pr-4 text-[13px] text-zinc-300 placeholder:text-zinc-600 focus:ring-1 focus:ring-white/5 transition-all outline-none" 
              placeholder="Search in document..." 
              type="text"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 flex-1 justify-end">
           <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-xl shadow-inner border border-zinc-900">
             <button 
               className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" 
               title="Share"
               onClick={handleShare}
             >
               <Share2 size={18} />
             </button>
             <button 
               className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" 
               title="Print"
               onClick={handlePrint}
             >
               <Printer size={18} />
             </button>
             <a 
               href={fileUrl} 
               download={fileName}
               className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" 
               title="Download"
             >
               <Download size={18} />
             </a>
           </div>
           
           <div className="w-px h-6 bg-zinc-800 mx-1 hidden md:block" />
           
           <button 
             className={cn(
               "size-10 flex items-center justify-center rounded-lg transition-all",
               rightSidebarOpen ? "bg-white text-zinc-950" : "text-zinc-500 hover:text-white hover:bg-[#1a1a1a]"
             )}
             onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
           >
             {rightSidebarOpen ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
           </button>
        </div>
      </header>

      {/* --- Main Contents --- */}
      <div className="flex-1 flex overflow-hidden relative">
        <aside className={cn(
          "fixed inset-y-16 left-0 w-64 md:relative md:inset-y-0 transition-all duration-500 ease-in-out z-[70]",
          leftSidebarOpen ? "md:translate-x-0" : "md:-translate-x-full md:-ml-64",
          isMobileLeftOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          {LeftSidebar}
        </aside>

        {/* Mobile Left Overlay */}
        {isMobileLeftOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] md:hidden"
            onClick={() => setIsMobileLeftOpen(false)}
          />
        )}

        {/* Viewport */}
        <main className="flex-1 bg-[#121212] relative flex flex-col overflow-hidden">
           {/* --- Floating Segmented Control Bar --- */}
           {isPdf && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center p-1.5 bg-[#1a1a1a]/90 backdrop-blur-2xl rounded-xl border border-zinc-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-4 duration-700">
               <div className="flex items-center gap-1 px-2 border-r border-zinc-800/40">
                  <button 
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                     <ChevronLeft size={18} />
                  </button>
                  <form onSubmit={handlePageSubmit} className="flex items-center gap-1 text-sm font-bold text-white px-2">
                     <input 
                       className="w-10 h-10 rounded-lg bg-[#242424] border border-zinc-800 text-center p-0 outline-none focus:ring-1 focus:ring-white/10 text-xs" 
                       value={pageInput}
                       onChange={(e) => setPageInput(e.target.value)}
                     />
                  </form>
                  <button 
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                     <ChevronRight size={18} />
                  </button>
               </div>
               <div className="flex items-center gap-1 px-2 border-r border-zinc-800/50">
                  <button onClick={() => setZoom(Math.max(50, zoom - 25))} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                    <Minus size={18} />
                  </button>
                  <span className="text-xs font-bold text-white min-w-[3.5rem] text-center">{zoom}%</span>
                  <button onClick={() => setZoom(Math.min(300, zoom + 25))} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
                    <Plus size={18} />
                  </button>
               </div>
               <div className="flex items-center gap-1 px-2">
                  <button 
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    <Maximize2 size={18} />
                  </button>
                  <button 
                    onClick={() => setRotation((rotation + 90) % 360)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    <RotateCw size={18} />
                  </button>
               </div>
            </div>
          )}

          <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar p-6 sm:p-10 pt-24 lg:pt-28 flex justify-center scroll-smooth">
            <div 
              className="max-w-4xl w-full flex flex-col gap-10 transition-all duration-500"
              style={{ 
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`, 
                transformOrigin: 'top center' 
              }}
            >
              {isPdf ? (
                <div className="w-full bg-[#1e1e1e] shadow-[0_40px_80px_rgba(0,0,0,0.6)] rounded-sm min-h-[1100px] relative overflow-hidden ring-1 ring-white/5 group">
                   <iframe
                      id="pdf-iframe"
                      src={isMobile 
                        ? `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true` 
                        : `${fileUrl}#page=${currentPage}&toolbar=0`
                      }
                      className="w-full h-full border-none opacity-90 group-hover:opacity-100 transition-opacity"
                      title={fileName}
                    />
                    {isMobile && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
                        <Button variant="outline" className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 text-[10px] font-black uppercase tracking-widest px-6" asChild>
                          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                            View Fullscreen <ExternalLink size={14} className="ml-2" />
                          </a>
                        </Button>
                      </div>
                    )}
                </div>
              ) : (
                <div className="w-full h-[600px] rounded-[32px] border border-zinc-900 bg-[#09090b] flex flex-col items-center justify-center gap-8 p-12 text-center shadow-3xl">
                    <div className="size-24 rounded-3xl bg-[#1a1a1a] border border-zinc-900 flex items-center justify-center text-zinc-800 shadow-inner">
                       <FileText size={48} strokeWidth={1.5} />
                    </div>
                    <div className="space-y-4 max-w-sm">
                       <h3 className="text-xl font-black text-white uppercase tracking-tight">Preview Unavailable</h3>
                       <p className="text-zinc-600 text-xs font-bold leading-relaxed uppercase tracking-widest">Local rendering required for this resource stream.</p>
                    </div>
                    <Button className="bg-white text-zinc-950 font-black h-11 px-8 rounded-xl text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5" asChild>
                       <a href={fileUrl} download={fileName}>
                          <Download size={16} className="mr-3" /> Download Resource
                       </a>
                    </Button>
                </div>
              )}
              
            </div>
          </div>

          <footer className="h-8 border-t border-zinc-900 bg-[#09090b] flex items-center justify-between px-4 text-[9px] text-zinc-600 font-bold uppercase tracking-wider shrink-0 z-40">
            <div className="flex items-center gap-2">
               <ArrowLeft size={10} className="text-zinc-700" />
               <span className="hover:text-zinc-400 cursor-pointer">Project Vault</span>
               <ChevronRight size={8} />
               <span className="text-zinc-400">{fileName}</span>
            </div>
            <div className="hidden sm:flex items-center gap-4">
               <span>PDF Dynamic Stream</span>
               <div className="w-1 h-1 rounded-full bg-zinc-800" />
               <span>Ready</span>
            </div>
          </footer>
        </main>

        {/* Right Sidebar */}
        <aside className={cn(
          "fixed inset-y-16 right-0 w-80 md:relative md:inset-y-0 transition-all duration-500 ease-in-out z-[70]",
          rightSidebarOpen ? "translate-x-0" : "translate-x-full md:-mr-80"
        )}>
          {RightSidebar}
        </aside>
      </div>
    </div>
  )
}
