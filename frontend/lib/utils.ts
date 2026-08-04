import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cleanTitle(title: string): string {
  if (!title) return ''
  return title
    .replace(/[📹🎞🎬]Vid Id\s*:\s*\d+/gi, '')
    .replace(/[📁📂]Video Title\s*:\s*/gi, '')
    .replace(/[📁📂]Batch Name\s*:\s*/gi, '')
    .replace(/@\w+/g, '')
    .replace(/\.mkv|\.mp4/gi, '')
    .replace(/\[\d+x\d+p\]/gi, '') // Remove resolution [640x360p]
    .replace(/Extracted By\s*>.+/gi, '') // Remove Extracted By info
    .replace(/Join\s*⭐/gi, '') // Remove Join stars
    .replace(/https?:\/\/\S+/gi, '') // Remove any links
    .replace(/[💖📚🌟✨🔥🚀]/g, '') // Remove common emojis
    .replace(/Video Title\s*:\s*.+/gi, '')
    .replace(/Batch Name\s*:\s*.+/gi, '')
    .replace(/\s*[|•-]\s*$/g, '')
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim()
}

export function truncateTitle(title: string, limit: number = 60): string {
  if (title.length <= limit) return title
  return title.slice(0, limit) + '...'
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`
  }
  if (mins > 0) {
    return secs > 0 && mins < 5 ? `${mins} min ${secs}s` : `${mins} min`
  }
  return `${secs}s`
}

export function getMediaTokenQuery(): string {
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('app_passcode_token')
    if (t) return `?token=${encodeURIComponent(t)}`
  }
  return ''
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
