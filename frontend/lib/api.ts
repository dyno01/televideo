/**
 * lib/api.ts
 * Centralized Axios instance for all backend API calls.
 */
import axios, { AxiosResponse } from 'axios'

export const getApiBase = (): string => {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname
    const protocol = window.location.protocol || 'http:'
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `${protocol}//${host}:4000`
    }
  }
  return 'http://localhost:4000'
}

export const API_BASE = getApiBase()

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  config.baseURL = getApiBase()
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('app_passcode_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && error?.response?.data?.passcodeRequired) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('app_passcode_required'))
      }
    }
    return Promise.reject(error)
  }
)

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
  streamtape_status?: string
  streamtape_id?: string
  streamtape_url?: string
  dismissed?: number
  updated_at?: string
  progress_updated_at?: string
  batch_id?: number | null
  batch_name?: string | null
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
  vcdn_status?: string
  vcdn_id?: string
  vcdn_playback_url?: string
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

export const deleteChannel = (id: number): Promise<{ success: boolean }> =>
  api.delete<{ success: boolean }>(`/api/channel/${id}`).then(d)

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
): Promise<{ success: boolean; watched_percentage: number; completed: number
  vcdn_status?: string
  vcdn_id?: string
  vcdn_playback_url?: string }> =>
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

// ── Telegram Auth API ────────────────────────────────────────────────────────

export interface TelegramUser {
  id: string
  username: string | null
  firstName: string | null
  phone: string | null
}

export interface TelegramStatus {
  configured: boolean
  authenticated: boolean
  hasSession?: boolean
  user: TelegramUser | null
  apiId?: number
  apiHashConfigured?: boolean
  error?: string
}

export const getTelegramStatus = (): Promise<TelegramStatus> =>
  api.get<TelegramStatus>('/api/telegram/status').then(d)

export const sendTelegramCode = (
  apiId: string | number,
  apiHash: string,
  phoneNumber: string
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> =>
  api.post('/api/telegram/send-code', { apiId, apiHash, phoneNumber }).then(d)

export const loginTelegram = (data: {
  phoneNumber: string
  phoneCode: string
  phoneCodeHash: string
  password?: string
}): Promise<{ success?: boolean; needs2FA?: boolean; hint?: string; user?: TelegramUser }> =>
  api.post('/api/telegram/login', data).then(d)

export const saveTelegramSession = (
  apiId: string | number,
  apiHash: string,
  sessionString: string
): Promise<{ success: boolean; user?: TelegramUser }> =>
  api.post('/api/telegram/save-session', { apiId, apiHash, sessionString }).then(d)

export const logoutTelegram = (): Promise<{ success: boolean }> =>
  api.post('/api/telegram/logout').then(d)

// ── Video Tags API ──────────────────────────────────────────────────────────

export interface VideoTag {
  id: number
  video_id: number
  tag: string
}

export const getVideoTags = (videoId: number): Promise<VideoTag[]> =>
  api.get<VideoTag[]>(`/api/tags/${videoId}`).then(d)

export const addVideoTag = (videoId: number, tag: string): Promise<VideoTag> =>
  api.post<VideoTag>('/api/tags', { videoId, tag }).then(d)

export const removeVideoTag = (id: number): Promise<{ success: boolean }> =>
  api.delete<{ success: boolean }>(`/api/tags/${id}`).then(d)

// ── Auth API ───────────────────────────────────────────────────────────────

export const registerUser = (username: string, password: string): Promise<{ success: boolean; token: string }> =>
  api.post<{ success: boolean; token: string }>('/api/telegram/register', { username, password }).then(d)

export const loginUser = (username: string, password: string): Promise<{ success: boolean; token: string }> =>
  api.post<{ success: boolean; token: string }>('/api/telegram/user-login', { username, password }).then(d)

export const getCurrentUser = (): Promise<{ success: boolean; user: { id: number; username: string } }> =>
  api.get<{ success: boolean; user: { id: number; username: string } }>('/api/telegram/me').then(d)

export const changePassword = (currentPassword: string, newPassword: string): Promise<{ success: boolean }> =>
  api.post<{ success: boolean }>('/api/telegram/change-password', { currentPassword, newPassword }).then(d)

// Legacy passcode endpoints for backwards compatibility
export const getPasscodeStatus = (): Promise<{ passcodeSet: boolean, userCount?: number }> =>
  api.get<{ passcodeSet: boolean, userCount?: number }>('/api/telegram/passcode-status').then(d)

export const verifyPasscode = (passcode: string): Promise<{ success: boolean; token: string }> =>
  api.post<{ success: boolean; token: string }>('/api/telegram/verify-passcode', { passcode }).then(d)

export const setAppPasscode = (passcode: string, currentPasscode?: string): Promise<{ success: boolean; token?: string }> =>
  api.post<{ success: boolean; token?: string }>('/api/telegram/set-passcode', { passcode, currentPasscode }).then(d)

export const removeAppPasscode = (currentPasscode: string): Promise<{ success: boolean }> =>
  api.post<{ success: boolean }>('/api/telegram/remove-passcode', { currentPasscode }).then(d)

export default api

export const dismissProgress = (videoId: number): Promise<{ success: boolean }> =>
  api.post(`/api/progress/${videoId}/dismiss`, {}).then(d)
