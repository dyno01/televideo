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
    .replace(/Batch Name\s*:\s*.+/gi, '')
    .replace(/Extracted By\s*>.+/gi, '')
    .replace(/\s*[|•-]\s*$/g, '')
    .trim()
}

export function truncateTitle(title: string, limit: number = 60): string {
  if (title.length <= limit) return title
  return title.slice(0, limit) + '...'
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
