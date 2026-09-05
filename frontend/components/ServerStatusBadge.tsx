'use client'

import React, { useState, useEffect } from 'react'
import { Server } from 'lucide-react'
import { getApiBase, checkBackendHealth } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ServerStatusBadgeProps {
  onClick?: () => void
  className?: string
  showLatency?: boolean
}

export function formatServerLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return 'Localhost'
    if (host.includes('render.com')) {
      const sub = host.split('.')[0]
      return `Render (${sub.slice(0, 8)})`
    }
    if (host.includes('snapdeploy')) return 'SnapDeploy'
    if (host.includes('back4app')) return 'Back4App'
    if (host.includes('koyeb')) return 'Koyeb'
    if (host.includes('railway')) return 'Railway'
    if (host.includes('fly.dev')) return 'Fly.io'
    return host.length > 16 ? host.slice(0, 14) + '…' : host
  } catch {
    return url.replace(/^https?:\/\//, '').slice(0, 14) || 'Backend'
  }
}

export default function ServerStatusBadge({
  onClick,
  className,
  showLatency = true,
}: ServerStatusBadgeProps) {
  const [activeUrl, setActiveUrl] = useState<string>('')
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [failoverAlert, setFailoverAlert] = useState<string | null>(null)

  const verifyHealth = async (url: string) => {
    if (!url) return
    setChecking(true)
    const res = await checkBackendHealth(url)
    setIsHealthy(res.ok)
    setLatency(res.latency)
    setChecking(false)
  }

  useEffect(() => {
    const current = getApiBase()
    setActiveUrl(current)
    verifyHealth(current)

    const handleBackendChange = (e: any) => {
      const newUrl = e.detail?.url || getApiBase()
      setActiveUrl(newUrl)
      verifyHealth(newUrl)
    }

    const handleFailover = (e: any) => {
      const newUrl = e.detail?.newUrl || getApiBase()
      setActiveUrl(newUrl)
      verifyHealth(newUrl)
      const label = formatServerLabel(newUrl)
      setFailoverAlert(`⚡ Auto-failover switched to ${label}`)
      setTimeout(() => setFailoverAlert(null), 5000)
    }

    window.addEventListener('backend_changed', handleBackendChange)
    window.addEventListener('backend_failover', handleFailover)

    return () => {
      window.removeEventListener('backend_changed', handleBackendChange)
      window.removeEventListener('backend_failover', handleFailover)
    }
  }, [])

  const label = formatServerLabel(activeUrl)

  return (
    <div className="relative inline-flex items-center">
      {/* Auto-failover floating toast */}
      {failoverAlert && (
        <div className="absolute top-full mt-2 right-0 z-50 whitespace-nowrap bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl shadow-indigo-500/20 border border-indigo-400/30 animate-in fade-in slide-in-from-top-1">
          {failoverAlert}
        </div>
      )}

      <button
        onClick={onClick}
        type="button"
        title={`Connected to: ${activeUrl}\nClick to manage backup servers & failover`}
        className={cn(
          "group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 border",
          isHealthy === true
            ? "bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-800"
            : isHealthy === false
            ? "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20"
            : "bg-zinc-900/80 text-zinc-400 border-zinc-800",
          className
        )}
      >
        {/* Status dot */}
        <span className="relative flex h-2 w-2">
          {isHealthy === true && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              checking
                ? "bg-amber-400"
                : isHealthy === true
                ? "bg-emerald-500"
                : isHealthy === false
                ? "bg-red-500"
                : "bg-zinc-500"
            )}
          />
        </span>

        <Server size={12} className="text-zinc-400 group-hover:text-zinc-200 transition-colors" />

        <span className="font-semibold text-zinc-200 max-w-[110px] truncate">
          {label}
        </span>

        {showLatency && latency !== null && isHealthy && (
          <span className="text-[10px] text-zinc-500 hidden sm:inline group-hover:text-zinc-400">
            {latency}ms
          </span>
        )}
      </button>
    </div>
  )
}
