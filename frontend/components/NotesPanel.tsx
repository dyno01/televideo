'use client'

import { useState, useEffect, RefObject } from 'react'
import { Plus, Trash2, ChevronRight, StickyNote, Loader2, Sparkles, Clock } from 'lucide-react'
import { getNotes, createNote, deleteNote, Note } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

interface NotesPanelProps {
  videoId: number
  playerRef: RefObject<{ seekTo: (t: number) => void; getCurrentTime?: () => number }>
}

export default function NotesPanel({ videoId, playerRef }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getNotes(videoId)
      .then(setNotes)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [videoId])

  async function handleAddNote() {
    const text = noteText.trim()
    if (!text) return

    const currentTime = playerRef.current?.getCurrentTime?.() ?? 0

    setSaving(true)
    try {
      const newNote = await createNote(videoId, currentTime, text)
      setNotes((prev) =>
        [...prev, newNote].sort((a, b) => a.timestamp_sec - b.timestamp_sec)
      )
      setNoteText('')
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await deleteNote(id).catch(() => {})
  }

  function handleSeek(ts: number) {
    playerRef.current?.seekTo(ts)
  }

  return (
    <Card className="h-full flex flex-col border-border/50 bg-card/30 backdrop-blur-xl shadow-2xl overflow-hidden rounded-3xl">
      <CardHeader className="px-6 py-4 border-b border-border/50 flex flex-row items-center justify-between space-y-0 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <StickyNote size={16} />
          </div>
          <CardTitle className="text-sm font-bold tracking-tight">Lecture Notes</CardTitle>
        </div>
        {notes.length > 0 && (
          <Badge variant="secondary" className="font-mono text-[10px] bg-primary/10 text-primary border-none">
            {notes.length}
          </Badge>
        )}
      </CardHeader>

      <ScrollArea className="flex-1">
        <CardContent className="p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
              <p className="text-xs font-medium">Loading annotations...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <div className="p-4 rounded-full bg-muted/20 w-16 h-16 mx-auto flex items-center justify-center text-muted-foreground/30">
                <Sparkles size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground/80">Context-Aware Notes</p>
                <p className="text-[11px] text-muted-foreground max-w-[180px] mx-auto leading-relaxed">
                  Annotate key moments. Each note is saved with the exact video timestamp.
                </p>
              </div>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="group relative bg-muted/30 hover:bg-muted/50 border border-border/10 hover:border-primary/20 p-3.5 rounded-2xl transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSeek(note.timestamp_sec)}
                    className="h-6 px-2 text-[10px] font-bold font-mono bg-primary/10 text-primary border-none rounded-lg hover:bg-primary/20 group/btn"
                  >
                    <Clock size={10} className="mr-1.5" />
                    {formatTimestamp(note.timestamp_sec)}
                    <ChevronRight size={10} className="ml-1 opacity-50 group-hover/btn:translate-x-0.5 transition-transform" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(note.id)}
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>

                <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                  {note.note_text}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </ScrollArea>

      <CardFooter className="p-6 border-t border-border/50 bg-muted/20 flex flex-col gap-4">
        <Textarea
          className="min-h-[100px] resize-none bg-background/50 border-border/50 focus-visible:ring-primary/20 rounded-2xl p-4 text-sm"
          placeholder="Jot down a thought... (Ctrl+Enter to save)"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAddNote();
            }
          }}
          disabled={saving}
        />
        <Button
          className="w-full font-bold h-11 shadow-sm rounded-xl"
          onClick={handleAddNote}
          disabled={saving || !noteText.trim()}
        >
          {saving ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Plus size={16} className="mr-2" />
          )}
          {saving ? 'Syncing...' : 'Add Context Note'}
        </Button>
      </CardFooter>
    </Card>
  )
}
