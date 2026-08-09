'use client'

import { useState, useMemo } from 'react'
import { Video } from '@/lib/api'
import { cn, cleanTitle, formatDuration } from '@/lib/utils'
import { Play, Search, X } from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'

interface LectureListProps {
  videos: Video[]
  channelUsername: string
  currentVideoId?: number
  showSearch?: boolean
}

export default function LectureList({ videos, channelUsername, currentVideoId, showSearch = true }: LectureListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos
    const q = searchQuery.toLowerCase().trim()
    return videos.filter(v => 
      cleanTitle(v.title).toLowerCase().includes(q) ||
      (v.title && v.title.toLowerCase().includes(q))
    )
  }, [videos, searchQuery])

  const completedCount = videos.filter(v => v.completed).length

  return (
    <section className="flex flex-col gap-4">
      {/* --- Playlist Header & Search --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Course Playlist</h4>
          <span className="text-xs text-zinc-600 font-medium">({filteredVideos.length} videos)</span>
        </div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
          {completedCount} / {videos.length} COMPLETED
        </div>
      </div>

      {showSearch && (
        <div className="relative w-full group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos by title or keyword..."
            className="pl-10 pr-9 h-10 bg-[#111113] border-zinc-800 focus-visible:ring-indigo-500 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {filteredVideos.length === 0 ? (
        <div className="p-8 text-center bg-[#111113] border border-zinc-800 rounded-xl text-zinc-500 text-xs font-medium space-y-1">
          <p>No videos match "{searchQuery}"</p>
          <button onClick={() => setSearchQuery('')} className="text-indigo-400 font-bold hover:underline">
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filteredVideos.map((video, idx) => {
            const isCurrent = video.id === currentVideoId
            const cleaned = cleanTitle(video.title)
            const isCompleted = video.completed === 1 || (video.watched_percentage || 0) >= 90
            
            return (
              <Link 
                key={video.id} 
                href={`/video/${video.id}`}
                className={cn(
                  "group relative flex items-center justify-between p-2.5 rounded-xl transition-all duration-300 border",
                  isCurrent 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-white" 
                    : "bg-[#111113]/60 border-zinc-800/60 hover:bg-[#18181b] hover:border-zinc-700"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Badge / Play Icon */}
                  <div className={cn(
                    "size-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs",
                    isCurrent ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : isCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800/80 text-zinc-400"
                  )}>
                    {isCurrent ? (
                      <Play size={14} fill="currentColor" />
                    ) : isCompleted ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>

                  {/* Title */}
                  <div className="min-w-0 flex-1">
                    <h5 className={cn(
                      "text-xs font-semibold leading-snug truncate pr-2",
                      isCurrent ? "text-indigo-200 font-bold" : "text-zinc-300 group-hover:text-white"
                    )}>
                      {cleaned}
                    </h5>
                  </div>

                  {/* Duration Badge */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono shrink-0 pl-2">
                    <span>{isCurrent ? 'Playing' : formatDuration(video.duration)}</span>
                    {video.watched_percentage > 0 && !isCompleted && (
                      <span className="text-indigo-400 font-bold">({Math.round(video.watched_percentage)}%)</span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
