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

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
