'use client'

import { useState, useEffect, RefObject } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { getNotes, createNote, deleteNote, Note } from '@/lib/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
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
  const [showInput, setShowInput] = useState(false)
  const [bookmarkTime, setBookmarkTime] = useState<number | null>(null)

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
      setNotes((prev) => [...prev, newNote].sort((a, b) => a.timestamp_sec - b.timestamp_sec))
      setNoteText('')
      setShowInput(false)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteNote(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this note?')) return
    try {
      await deleteNote(id)
      setNotes((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }

  function handleSeek(timestamp: number) {
    const currentTime = playerRef.current?.getCurrentTime?.() ?? 0
    // Set bookmark to current time before jumping
    setBookmarkTime(currentTime)
    playerRef.current?.seekTo(timestamp)
  }

  function handleReturn() {
    if (bookmarkTime !== null) {
      playerRef.current?.seekTo(bookmarkTime)
      setBookmarkTime(null)
    }
  }

  return (
    <section className="flex flex-col gap-10 h-full">
        {/* --- Header --- */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col gap-1">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Context Notes</h4>
            {bookmarkTime !== null && (
              <button 
                onClick={handleReturn}
                className="text-[10px] font-bold text-white hover:text-zinc-400 underline underline-offset-4 decoration-white/20"
              >
                RETURN TO SEGMENT ({formatTimestamp(bookmarkTime)})
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowInput(!showInput)}
            className="flex items-center gap-2 text-[11px] font-bold text-white hover:text-zinc-400 transition-colors"
          >
            <Plus size={14} /> NEW NOTE
          </button>
        </div>

        {/* --- Timeline Space --- */}
        <ScrollArea className="max-h-[300px] -mx-4 px-4">
          <div className="relative pl-6 pr-4 space-y-12">
            {/* Timeline Line */}
            <div className="absolute left-2 top-2 bottom-6 w-px bg-zinc-800/50" />

            {loading ? (
              <div className="flex items-center justify-center py-10 text-zinc-700">
                <Loader2 className="animate-spin" size={16} />
              </div>
            ) : notes.length === 0 ? (
               <div className="py-10 text-center opacity-40">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                    Empty context.
                  </p>
               </div>
            ) : notes.map((note) => (
              <div 
                key={note.id} 
                className="relative group cursor-pointer hover:bg-white/5 -mx-4 px-4 py-2 rounded-lg transition-colors"
                onClick={() => handleSeek(note.timestamp_sec)}
              >
                {/* Timeline Marker (White Solid) */}
                <div className="absolute left-[0.15rem] top-3.5 size-2.5 rounded-full bg-white ring-4 ring-[#09090b]" />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-white uppercase tracking-wider tabular-nums">
                        {formatTimestamp(note.timestamp_sec)} MARKER
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase">
                        {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <button 
                        onClick={(e) => handleDeleteNote(e, note.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-500 transition-all p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-[15px] text-zinc-400 italic font-medium leading-relaxed pr-6">
                    "{note.note_text}"
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* --- Input Area (Toggable) --- */}
        {showInput && (
          <div className="flex flex-col gap-3 pt-6 border-t border-zinc-900/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="relative">
                <Textarea 
                  placeholder="Capture a thought..."
                  className="bg-zinc-900/40 border-zinc-800 rounded-xl min-h-[100px] text-sm text-zinc-300 placeholder:text-zinc-700 focus:border-zinc-700 transition-colors py-4 px-5"
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleAddNote();
                    }
                  }}
                />
                <button 
                  onClick={handleAddNote}
                  disabled={saving || !noteText.trim()}
                  className="absolute right-3 bottom-3 h-8 px-4 bg-white text-zinc-950 rounded-lg text-xs font-bold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : 'Add'}
                </button>
             </div>
          </div>
        )}
    </section>
  )
}
