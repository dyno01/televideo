'use client'

import { useState } from 'react'
import { FileText, File, Sheet, Archive, Download, Eye, Image as ImageIcon } from 'lucide-react'
import { TelegramFile, API_BASE } from '@/lib/api'
import DocumentModal from './DocumentModal'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatSize(bytes: number | null): string {
  if (!bytes) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getFileIcon(mimeType: string, fileName: string) {
  const lower = (mimeType + fileName).toLowerCase()
  if (lower.includes('pdf')) return <FileText className="w-5 h-5 text-destructive" />
  if (lower.includes('sheet') || lower.includes('xlsx') || lower.includes('csv') || lower.includes('xls'))
    return <Sheet className="w-5 h-5 text-emerald-500" />
  if (lower.includes('zip') || lower.includes('rar') || lower.includes('7z') || lower.includes('tar'))
    return <Archive className="w-5 h-5 text-amber-500" />
  if (lower.includes('jpg') || lower.includes('png') || lower.includes('jpeg'))
    return <ImageIcon className="w-5 h-5 text-primary" />
  return <File className="w-5 h-5 text-muted-foreground" />
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE'
}

interface FileLibraryProps {
  files: TelegramFile[]
  channelUsername: string
}

export default function FileLibrary({ files, channelUsername }: FileLibraryProps) {
  const [selectedFile, setSelectedFile] = useState<TelegramFile | null>(null)

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {files.map((file) => {
          const ext = getFileExtension(file.file_name || 'unknown')
          const isViewable = ['PDF', 'JPG', 'PNG', 'JPEG', 'WEBP'].includes(ext.toUpperCase())
          const telegramUrl = `https://t.me/${channelUsername}/${file.message_id}`

          return (
            <Card 
              key={file.id} 
              className="group relative flex flex-col h-full bg-card/40 border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden cursor-pointer shadow-sm hover:shadow-md"
              onClick={() => isViewable ? setSelectedFile(file) : window.open(telegramUrl, '_blank')}
            >
              <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                <div className="p-2.5 rounded-xl bg-muted/50 border border-border/50 group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                  {getFileIcon(file.mime_type || '', file.file_name || '')}
                </div>
                <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest px-1.5 h-5 border-none bg-muted/80">
                  {ext}
                </Badge>
              </CardHeader>

              <CardContent className="px-4 pb-4 flex-1">
                <h4 className="text-sm font-bold leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
                  {file.file_name || 'Untitled Discovery'}
                </h4>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                    {formatSize(file.file_size)}
                  </span>
                  <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">
                    Msg #{file.message_id}
                  </span>
                </div>
              </CardContent>

              <CardFooter className="px-4 py-3 bg-muted/20 border-t border-border/40 flex items-center justify-between group-hover:bg-primary/5 transition-colors">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                  {isViewable ? <Eye size={12} /> : <Download size={12} />}
                  {isViewable ? 'Preview' : 'Download'}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download size={12} />
                </Button>
              </CardFooter>
            </Card>
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
    </>
  )
}
