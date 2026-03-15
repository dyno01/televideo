'use client'

import { Video } from '@/lib/api'
import { cn, cleanTitle } from '@/lib/utils'
import { Play } from 'lucide-react'
import Link from 'next/link'

interface LectureListProps {
  videos: Video[]
  channelUsername: string
  currentVideoId?: number
}

// Simple Equalizer Icon for Active state
const EqualizerIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    width="16" 
    height="16" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    fill="none" 
    className={className}
  >
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="12" />
    <line x1="12" y1="20" x2="12" y2="9" />
  </svg>
)

export default function LectureList({ videos, channelUsername, currentVideoId }: LectureListProps) {
  const completedCount = videos.filter(v => v.completed).length
  const progressPercentage = Math.round((completedCount / (videos.length || 1)) * 100)

  return (
    <section className="flex flex-col gap-4">
      {/* --- Playlist Header --- */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Course Playlist</h4>
        <div className="text-[11px] font-bold uppercase tracking-widest text-white/90">
          {completedCount} / {videos.length} COMPLETED
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-1">
        {videos.map((video, index) => {
          const isCurrent = video.id === currentVideoId
          const cleaned = cleanTitle(video.title)
          
          return (
            <Link 
              key={video.id} 
              href={`/video/${video.id}`}
              className={cn(
                "group relative flex items-center gap-4 p-3 rounded-xl transition-all duration-300 border",
                isCurrent 
                  ? "bg-[#121212] border-white/10" 
                  : "bg-transparent border-transparent hover:bg-zinc-900/40"
              )}
            >
              {/* Thumbnail Area - Compact */}
              <div className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center">
                 {isCurrent ? (
                   <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <Play size={16} fill="white" className="text-white" />
                   </div>
                 ) : video.completed ? (
                   <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                      <div className="size-5 rounded-full border border-white/20 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                   </div>
                 ) : null}
                 <div className="size-full bg-zinc-800/50" />
              </div>

              {/* Info Area - Sleek */}
              <div className="flex flex-col min-w-0 flex-1">
                <h5 className={cn(
                  "text-[13px] font-bold leading-tight transition-colors mb-1 truncate pr-2",
                  isCurrent ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                )}>
                  {cleaned}
                </h5>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                  {isCurrent ? 'CURRENT' : `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
