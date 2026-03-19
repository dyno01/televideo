'use client'

import { useState } from 'react'
import { FileText, File, ExternalLink, Eye, Download, Search, LayoutGrid, List } from 'lucide-react'
import { TelegramFile, API_BASE } from '@/lib/api'
import DocumentModal from './DocumentModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface FileLibraryProps {
  files: TelegramFile[]
  channelUsername: string
}

export default function FileLibrary({ files, channelUsername }: FileLibraryProps) {
  const [selectedFile, setSelectedFile] = useState<TelegramFile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFiles = files.filter(f => 
    f.file_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/10">
        <p className="font-semibold text-zinc-500 text-sm uppercase tracking-widest">Resource Vault Empty</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {/* --- Filter Bar --- */}
      <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
        <div className="relative w-full sm:max-w-md group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-white transition-colors" />
          <Input 
            className="pl-12 h-12 bg-zinc-900/50 border-zinc-800 text-zinc-100 rounded-xl focus:border-zinc-600 outline-none transition-all placeholder:text-zinc-800"
            placeholder="Search across files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
           <button className="p-2 rounded-lg bg-white text-zinc-950 shadow-lg transition-all">
             <LayoutGrid size={18} />
           </button>
           <button className="p-2 rounded-lg text-zinc-600 hover:text-white transition-all">
             <List size={18} />
           </button>
        </div>
      </div>

      {/* --- File Grid --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredFiles.map((file) => {
          const extension = (file.file_name?.split('.').pop() || '').toUpperCase()
          const isViewable = ['PDF', 'JPG', 'PNG', 'JPEG', 'WEBP'].includes(extension) || file.mime_type === 'application/pdf'
          const sizeMB = file.file_size ? (file.file_size / (1024 * 1024)).toFixed(2) : '?'

          return (
            <div 
              key={file.id} 
              className="group flex flex-col bg-[#1a1a1a]/40 border border-zinc-900 rounded-2xl overflow-hidden hover:border-zinc-700 transition-all duration-300 card-hover"
            >
              <div className="aspect-[16/10] relative bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-900/50">
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/10 to-transparent"></div>
                <div className="relative size-16 rounded-2xl bg-[#121212] flex items-center justify-center text-zinc-800 transition-all group-hover:scale-110 shadow-xl border border-zinc-900">
                  <FileText size={32} />
                </div>
                <div className="absolute inset-0 bg-zinc-950/20 group-hover:bg-transparent transition-colors"></div>
              </div>

              <div className="p-6 flex flex-col gap-6">
                <div className="flex flex-col gap-2 min-w-0">
                  <h3 className="text-zinc-100 text-[15px] font-bold truncate leading-snug group-hover:text-white">
                    {file.file_name}
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">{sizeMB} MB</span>
                    <span className="text-zinc-500 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 transition-colors group-hover:bg-white group-hover:text-black group-hover:border-white">
                      {extension}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <Button 
                    variant="outline"
                    className="flex-1 h-10 rounded-xl bg-zinc-900/50 border-zinc-800 text-zinc-400 font-bold text-[11px] uppercase tracking-widest hover:bg-white hover:text-zinc-950 transition-all"
                    onClick={() => isViewable 
                      ? setSelectedFile(file) 
                      : window.open(`https://t.me/${channelUsername}/${file.message_id}`, '_blank')}
                  >
                    {isViewable ? <Eye size={14} className="mr-2" /> : <ExternalLink size={14} className="mr-2" />}
                    {isViewable ? 'Preview' : 'Open'}
                  </Button>
                  <Button 
                    variant="outline"
                    className="size-10 shrink-0 p-0 rounded-xl bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all"
                    asChild
                  >
                    <a href={`${API_BASE}/api/stream/file/${file.id}`} download={file.file_name}>
                       <Download size={14} />
                    </a>
                  </Button>
                </div>
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
          mimeType={selectedFile.mime_type || 'application/octet-stream'}
        />
      )}
    </div>
  )
}
