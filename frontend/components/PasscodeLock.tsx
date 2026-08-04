'use client'

import { useState } from 'react'
import { Lock, KeyRound, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react'
import { verifyPasscode } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface PasscodeLockProps {
  onUnlocked: () => void
}

export default function PasscodeLock({ onUnlocked }: PasscodeLockProps) {
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!passcode.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await verifyPasscode(passcode)
      if (res.success && res.token) {
        localStorage.setItem('app_passcode_token', res.token)
        onUnlocked()
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Incorrect passcode. Access denied.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0b]/95 backdrop-blur-xl flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 sm:p-10 bg-[#111113] border-zinc-800 space-y-8 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="size-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-inner">
            <Lock size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">TeleVideo Security Lock</h2>
          <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
            This dashboard is protected by an Admin Passcode. Enter your PIN or Password to access channels, videos, and settings.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="relative">
            <KeyRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode..."
              autoFocus
              className="pl-11 h-12 bg-[#18181b] border-zinc-800 text-white rounded-xl text-sm focus-visible:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold animate-in fade-in">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={!passcode.trim() || loading}
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/20 gap-2"
          >
            {loading ? (
              <Loader2 className="animate-spin size-4" />
            ) : (
              <>
                Unlock Dashboard <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t border-zinc-900 text-center">
          <p className="text-[10px] text-zinc-600 font-mono">Protected by TeleVideo Encrypted Passcode Engine</p>
        </div>
      </Card>
    </div>
  )
}
