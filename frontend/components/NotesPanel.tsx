'use client'

import { useState, useEffect, RefObject } from 'react'
import { Plus, Trash2, Loader2, Play } from 'lucide-react'
import { getNotes, createNote, deleteNote, Note } from '@/lib/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function formatTimestamp(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

interface NotesPanelProps {
  videoId: number
  playerRef: RefObject<{ seekTo: (t: number) => void; play?: () => void; getCurrentTime?: () => number }>
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
    // Instant deletion without browser confirm popup
    try {
      setNotes((prev) => prev.filter((n) => n.id !== id))
      await deleteNote(id)
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }

  function handleSeek(timestamp: number) {
    const currentTime = playerRef.current?.getCurrentTime?.() ?? 0
    // Set bookmark to current time before jumping
    setBookmarkTime(currentTime)
    playerRef.current?.seekTo(timestamp)
    playerRef.current?.play?.()
  }

  function handleReturn() {
    if (bookmarkTime !== null) {
      playerRef.current?.seekTo(bookmarkTime)
      playerRef.current?.play?.()
      setBookmarkTime(null)
    }
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      {/* --- Header --- */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Timestamped Notes</h4>
          <p className="text-[10px] text-zinc-500">{notes.length} notes saved for this video</p>
        </div>
        
        <button 
          onClick={() => setShowInput(!showInput)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
        >
          <Plus size={14} /> New Note
        </button>
      </div>

      {bookmarkTime !== null && (
        <button 
          onClick={handleReturn}
          className="flex items-center justify-between px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-xs font-bold text-indigo-300 transition-all group"
        >
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-full bg-indigo-500 text-white flex items-center justify-center">
              <Play size={10} fill="currentColor" className="ml-0.5" />
            </div>
            <span>Return to former timestamp</span>
          </div>
          <span className="font-mono text-[11px] text-indigo-400">{formatTimestamp(bookmarkTime)}</span>
        </button>
      )}

      {/* --- Input Area (Collapsible) --- */}
      {showInput && (
        <div className="p-3 bg-[#18181b] border border-zinc-800 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <Textarea 
            placeholder="Type your notes here... (saved at current video position)"
            className="bg-[#111113] border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-indigo-500 min-h-[80px] p-3 resize-none"
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
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-mono">Tip: Ctrl + Enter to save</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowInput(false)}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddNote}
                disabled={saving || !noteText.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all"
              >
                {saving ? <Loader2 className="animate-spin size-3.5" /> : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Notes List --- */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-zinc-600">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : notes.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 space-y-1">
            <p className="text-xs font-semibold text-zinc-400">No notes added yet</p>
            <p className="text-[11px]">Click "+ New Note" to bookmark key moments.</p>
          </div>
        ) : (
          <div className="space-y-2.5 pb-6">
            {notes.map((note) => (
              <div 
                key={note.id} 
                className="group relative p-3.5 bg-[#18181b]/60 border border-zinc-800/80 hover:border-zinc-700 hover:bg-[#18181b] rounded-xl transition-all space-y-2 cursor-pointer"
                onClick={() => handleSeek(note.timestamp_sec)}
              >
                <div className="flex items-center justify-between">
                  {/* Timestamp Play Button Badge */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSeek(note.timestamp_sec); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 text-xs font-mono font-bold transition-all"
                  >
                    <Play size={10} fill="currentColor" />
                    <span>{formatTimestamp(note.timestamp_sec)}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteNote(e, note.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 transition-all"
                      title="Delete Note"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-normal pl-0.5">
                  {note.note_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
