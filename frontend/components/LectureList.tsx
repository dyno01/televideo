'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Play, CheckCircle, Clock, ArrowUpDown, Layers, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react'
import { Video } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { cn, cleanTitle, truncateTitle } from '@/lib/utils'

// --- Helpers ---
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function extractBatch(title: string): string {
  if (!title) return 'General'
  const m = title.match(/batch(?:\s+name)?\s*[:\-]\s*(.+?)(?:\s*[|\n]|$)/i)
  if (m) return cleanTitle(m[1]).trim().slice(0, 80)
  return 'General'
}

type SortMode = 'date-asc' | 'date-desc' | 'name-asc' | 'name-desc' | 'unwatched' | 'progress'
type GroupMode = 'none' | 'batch' | 'status'

interface LectureListProps {
  videos: Video[]
  channelUsername: string
  currentVideoId?: number
  compact?: boolean
}

export default function LectureList({ videos, channelUsername, currentVideoId, compact }: LectureListProps) {
  const [sortMode, setSortMode] = useState<SortMode>('date-asc')
  const [groupMode, setGroupMode] = useState<GroupMode>('none')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const sorted = useMemo(() => {
    const arr = [...videos]
    switch (sortMode) {
      case 'date-asc': return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
      case 'date-desc': return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
      case 'name-asc': return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      case 'name-desc': return arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''))
      case 'unwatched': return arr.sort((a, b) => a.watched_percentage - b.watched_percentage)
      case 'progress': return arr.sort((a, b) => b.watched_percentage - a.watched_percentage)
      default: return arr
    }
  }, [videos, sortMode])

  const grouped = useMemo(() => {
    if (groupMode === 'none') return { 'All Videos': sorted }
    if (groupMode === 'batch') {
      const map: Record<string, Video[]> = {}
      for (const v of sorted) {
        const key = extractBatch(v.title)
        if (!map[key]) map[key] = []
        map[key].push(v)
      }
      return map
    }
    const complete = sorted.filter(v => v.completed === 1)
    const inProgress = sorted.filter(v => v.completed !== 1 && v.watched_percentage > 0)
    const unwatched = sorted.filter(v => v.completed !== 1 && v.watched_percentage === 0)
    const map: Record<string, Video[]> = {}
    if (unwatched.length) map['⬜ Unwatched'] = unwatched
    if (inProgress.length) map['🟡 In Progress'] = inProgress
    if (complete.length) map['✅ Completed'] = complete
    return map
  }, [sorted, groupMode])

  const toggleGroup = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort</span>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-asc">Oldest First</SelectItem>
                  <SelectItem value="date-desc">Newest First</SelectItem>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                  <SelectItem value="unwatched">Unwatched First</SelectItem>
                  <SelectItem value="progress">Progress High-Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group</span>
              <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
                <SelectTrigger className="h-8 w-[140px] text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="batch">By Batch</SelectItem>
                  <SelectItem value="status">By Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 bg-background">
            {videos.length} Lectures Found
          </Badge>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([groupName, groupVideos]) => (
          <div key={groupName} className="space-y-3">
            {groupMode !== 'none' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleGroup(groupName)}
                className="group p-0 h-auto hover:bg-transparent text-primary hover:text-primary/80"
              >
                {collapsed[groupName] ? <ChevronRight className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                <span className="text-xs font-bold uppercase tracking-widest">{groupName}</span>
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1 text-[10px] font-bold border-none bg-primary/10 text-primary">
                  {groupVideos.length}
                </Badge>
              </Button>
            )}

            {!collapsed[groupName] && (
              <div className={cn("grid gap-2", (compact && groupVideos.length > 5) ? "max-h-[400px] overflow-y-auto pr-2 scrollbar-thin" : "")}>
                {groupVideos.map((video, idx) => {
                  const isCurrent = video.id === currentVideoId
                  const isComplete = video.completed === 1
                  const inProgress = !isComplete && video.watched_percentage > 0

                  return (
                    <Link key={video.id} href={`/video/${video.id}`}>
                      <Card className={cn(
                        "group relative border-border/40 bg-card/20 hover:bg-muted/50 transition-all cursor-pointer",
                        compact ? "p-2.5 rounded-xl" : "p-3 rounded-2xl",
                        isCurrent && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 shadow-lg",
                            compact ? "w-8 h-8" : "w-10 h-10",
                            isComplete ? "bg-emerald-500/10 text-emerald-500" : isCurrent ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20 shadow-primary/40" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                          )}>
                            {isComplete ? <CheckCircle size={compact ? 16 : 20} /> : isCurrent ? <div className="w-2.5 h-2.5 bg-background rounded-full animate-pulse shadow-[0_0_12px_rgba(255,255,255,0.8)]" /> : <Play size={compact ? 12 : 16} className="ml-0.5" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className={cn(
                              "font-bold truncate leading-tight mb-1.5 transition-colors",
                              compact ? "text-xs" : "text-sm",
                              isCurrent ? "text-primary tracking-tight" : "text-foreground group-hover:text-primary"
                            )}>
                              {truncateTitle(cleanTitle(video.title || `Lecture ${idx + 1}`), compact ? 60 : 100)}
                            </h4>
                            <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 leading-none">
                              <span className="flex items-center gap-1.5 shrink-0 bg-muted/30 px-2 py-1 rounded-md"><Clock size={10} /> {formatDuration(video.duration)}</span>
                              {inProgress && (
                                <span className="flex items-center gap-1.5 text-amber-500/80 shrink-0 font-black">
                                   • {Math.round(video.watched_percentage)}% DONE
                                </span>
                              )}
                              {isCurrent && (
                                <Badge variant="secondary" className="ml-auto h-5 px-2 bg-primary/10 text-primary border-none text-[9px] font-black animate-pulse">
                                  NOW PLAYING
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {!compact && <ChevronRight className="w-5 h-5 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />}
                        </div>
                        
                        {(inProgress || isComplete) && (
                          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-muted/20 rounded-b-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full transition-all duration-700",
                                isComplete ? "bg-emerald-500" : "bg-primary"
                              )}
                              style={{ width: `${isComplete ? 100 : video.watched_percentage}%` }}
                            />
                          </div>
                        )}
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
