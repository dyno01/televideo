/**
 * lib/api.ts
 * Centralized Axios instance for all backend API calls.
 */
import axios, { AxiosResponse } from 'axios'

export const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Types ───────────────────────────────────────────────────────────────────

export interface Channel {
  id: number
  username: string
  title: string
  photo_url: string | null
  scanned_at: string
  videoCount: number
  fileCount: number
}

export interface Video {
  id: number
  channel_id: number
  message_id: number
  title: string
  duration: number
  file_id: string
  access_hash: string
  mime_type: string
  size: number
  created_at: string
  channel_username?: string
  channel_title?: string
  watched_percentage: number
  last_timestamp: number
  completed: number
  batch_id?: number
  batch_name?: string
}

export interface TelegramFile {
  id: number
  channel_id: number
  message_id: number
  file_name: string
  mime_type: string
  file_size: number
  created_at: string
  parent_video_id?: number
}

export type SequenceItem = (Video | TelegramFile) & { item_type: 'video' | 'file' }

export interface Progress {
  video_id: number
  watched_percentage: number
  last_timestamp: number
  completed: number
}

export interface Note {
  id: number
  video_id: number
  timestamp_sec: number
  note_text: string
  created_at: string
}

export interface ScanResult {
  success: boolean
  channel: { id: number; username: string; title: string }
  stats: { scannedMessages: number; videos: number; files: number }
}

// ── API Functions ────────────────────────────────────────────────────────────

const d = <T>(r: AxiosResponse<T>): T => r.data

export const scanChannel = (channelUsername: string): Promise<ScanResult> =>
  api.post<ScanResult>('/api/channel/scan', { channelUsername }).then(d)

export const getChannels = (): Promise<Channel[]> =>
  api.get<Channel[]>('/api/channels').then(d)

export const getChannel = (username: string): Promise<Channel> =>
  api.get<Channel>(`/api/channel/${username}`).then(d)

export const getVideos = (username: string): Promise<Video[]> =>
  api.get<Video[]>(`/api/channel/${username}/videos`).then(d)

export const getVideo = (id: number): Promise<Video> =>
  api.get<Video>(`/api/video/${id}`).then(d)

export const getFiles = (username: string): Promise<TelegramFile[]> =>
  api.get<TelegramFile[]>(`/api/channel/${username}/files`).then(d)

export const getFile = (id: number): Promise<TelegramFile> =>
  api.get<TelegramFile>(`/api/file/${id}`).then(d)

export const getProgress = (videoId: number): Promise<Progress> =>
  api.get<Progress>(`/api/progress/${videoId}`).then(d)

export const saveProgress = (
  videoId: number,
  currentTime: number,
  duration: number
): Promise<{ success: boolean; watched_percentage: number; completed: number }> =>
  api.post('/api/progress', { videoId, currentTime, duration }).then(d)

export const getNotes = (videoId: number): Promise<Note[]> =>
  api.get<Note[]>(`/api/notes/${videoId}`).then(d)

export const createNote = (
  videoId: number,
  timestampSec: number,
  noteText: string
): Promise<Note> =>
  api.post<Note>('/api/notes', { videoId, timestampSec, noteText }).then(d)

export const deleteNote = (
  id: number
): Promise<{ success: boolean }> =>
  api.delete<{ success: boolean }>(`/api/notes/${id}`).then(d)

// ── Batch API ────────────────────────────────────────────────────────────────

export interface Batch {
  id: number
  channel_id: number
  name: string
  tg_link: string
  start_msg_id: number
  end_msg_id: number
  scanned_at: string
  videoCount: number
  fileCount: number
}

export interface BatchScanResult {
  success: boolean
  batch: Batch
  stats: { scanned: number; videos: number; files: number }
}

export const createBatch = (
  channelId: number, name: string, tgLink: string
): Promise<BatchScanResult> =>
  api.post<BatchScanResult>('/api/batches', { channelId, name, tgLink }, { timeout: 120000 }).then(d)

export const getBatches = (channelId: number): Promise<Batch[]> =>
  api.get<Batch[]>(`/api/batches/channel/${channelId}`).then(d)

export const getBatch = (id: number): Promise<Batch> =>
  api.get<Batch>(`/api/batches/${id}`).then(d)

export const getBatchVideos = (id: number): Promise<Video[]> =>
  api.get<Video[]>(`/api/batches/${id}/videos`).then(d)

export const getBatchFiles = (id: number): Promise<TelegramFile[]> =>
  api.get<TelegramFile[]>(`/api/batches/${id}/files`).then(d)

export const getBatchSequence = (id: number): Promise<SequenceItem[]> =>
  api.get<SequenceItem[]>(`/api/batches/${id}/sequence`).then(d)

export const updateBatch = (id: number, data: { name?: string; link?: string }): Promise<{ success: boolean }> =>
  api.put<{ success: boolean }>(`/api/batches/${id}`, data).then(d)

export const deleteBatch = (id: number): Promise<{ success: boolean }> =>
  api.delete<{ success: boolean }>(`/api/batches/${id}`).then(d)

export const getVideoFiles = (videoId: number): Promise<TelegramFile[]> =>
  api.get<TelegramFile[]>(`/api/video/${videoId}/files`).then(d)

export default api
