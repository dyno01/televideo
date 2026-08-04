'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Key,
  LogOut,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import {
  getTelegramStatus,
  sendTelegramCode,
  loginTelegram,
  saveTelegramSession,
  logoutTelegram,
  getPasscodeStatus,
  setAppPasscode,
  removeAppPasscode,
  TelegramStatus,
} from '@/lib/api'

interface TelegramAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onStatusChange?: (status: TelegramStatus) => void
}

export default function TelegramAuthModal({
  isOpen,
  onClose,
  onStatusChange,
}: TelegramAuthModalProps) {
  const [activeTab, setActiveTab] = useState<'telegram' | 'passcode'>('telegram')
  const [showManualSession, setShowManualSession] = useState(false)
  
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [passcodeSet, setPasscodeSet] = useState(false)
  const [loading, setLoading] = useState(true)

  // Phone auth state
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone')
  const [isAppCode, setIsAppCode] = useState(true)
  const [passwordHint, setPasswordHint] = useState('')

  // Manual Session auth state
  const [sessionString, setSessionString] = useState('')

  // Passcode state
  const [newPasscode, setNewPasscode] = useState('')
  const [currentPasscode, setCurrentPasscode] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const fetchStatus = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const [data, passSt] = await Promise.all([
        getTelegramStatus(),
        getPasscodeStatus().catch(() => ({ passcodeSet: false }))
      ])
      setStatus(data)
      setPasscodeSet(passSt.passcodeSet)
      if (data.apiId) setApiId(String(data.apiId))
      onStatusChange?.(data)
    } catch (err: any) {
      setErrorMsg('Failed to check Telegram status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStatus()
    }
  }, [isOpen])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiId || !apiHash || !phoneNumber) {
      setErrorMsg('Please fill in API ID, API Hash, and Phone Number.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await sendTelegramCode(apiId, apiHash, phoneNumber)
      setPhoneCodeHash(res.phoneCodeHash)
      setIsAppCode(res.isCodeViaApp)
      setStep('code')
      setSuccessMsg(
        res.isCodeViaApp
          ? 'Code sent to your Telegram app!'
          : 'Code sent via SMS!'
      )
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error ||
          'Failed to send verification code. Double-check your API credentials and phone format (e.g. +1234567890).'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneCode) {
      setErrorMsg('Please enter the code Telegram sent you.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await loginTelegram({
        phoneNumber,
        phoneCode,
        phoneCodeHash,
        password,
      })

      if (res.needs2FA) {
        setStep('2fa')
        setPasswordHint(res.hint || '')
        setSuccessMsg('Two-step verification required. Enter your 2FA password.')
        return
      }

      setSuccessMsg('Successfully connected to Telegram! Session auto-saved.')
      await fetchStatus()
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error ||
          'Login failed. Please verify your code or 2FA password.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiId || !apiHash || !sessionString) {
      setErrorMsg('API ID, API Hash, and Session String are all required.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      await saveTelegramSession(apiId, apiHash, sessionString)
      setSuccessMsg('Session string saved and authenticated!')
      await fetchStatus()
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error || 'Invalid session string or API credentials.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPasscode || newPasscode.trim().length < 4) {
      setErrorMsg('Passcode must be at least 4 characters long.')
      return
    }
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await setAppPasscode(newPasscode, currentPasscode)
      if (res.token) {
        localStorage.setItem('app_passcode_token', res.token)
      }
      setPasscodeSet(true)
      setNewPasscode('')
      setCurrentPasscode('')
      setSuccessMsg('App Passcode security enabled successfully!')
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to update passcode.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemovePasscode = async () => {
    if (!confirm('Are you sure you want to disable Passcode Protection? Anyone with your app URL will be able to view channels and streams.')) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      await removeAppPasscode(currentPasscode)
      localStorage.removeItem('app_passcode_token')
      setPasscodeSet(false)
      setCurrentPasscode('')
      setSuccessMsg('Passcode protection disabled.')
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to disable passcode. Double check current passcode.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to disconnect your Telegram session?')) return
    setSubmitting(true)
    try {
      await logoutTelegram()
      setStep('phone')
      setSuccessMsg('Telegram session disconnected.')
      await fetchStatus()
    } catch (err: any) {
      setErrorMsg('Failed to log out.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-zinc-900 bg-zinc-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Smartphone size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  Settings & Security
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                  Telegram session management & Passcode lock
                </DialogDescription>
              </div>
            </div>

            {status && (
              <Badge
                variant="outline"
                className={
                  status.authenticated
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400 gap-1.5 py-1'
                }
              >
                {status.authenticated ? (
                  <>
                    <ShieldCheck size={14} /> Connected
                  </>
                ) : (
                  <>
                    <ShieldAlert size={14} /> Unauthenticated
                  </>
                )}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
              <Loader2 className="animate-spin text-blue-400" size={32} />
              <p className="text-xs font-semibold">Loading status...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tab selector */}
              <div className="flex p-1 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
                <button
                  type="button"
                  className={`flex-1 py-2.5 rounded-lg font-bold transition-all ${
                    activeTab === 'telegram'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('telegram')
                    setErrorMsg('')
                  }}
                >
                  Telegram Account
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'passcode'
                      ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('passcode')
                    setErrorMsg('')
                  }}
                >
                  <Lock size={12} /> App Passcode Lock
                </button>
              </div>

              {/* Banners */}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* TAB 1: TELEGRAM ACCOUNT */}
              {activeTab === 'telegram' && (
                status?.authenticated ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg">
                          {status.user?.firstName?.charAt(0) || status.user?.username?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-base flex items-center gap-2">
                            {status.user?.firstName || 'Telegram User'}
                            {status.user?.username && (
                              <span className="text-xs text-zinc-400 font-normal">@{status.user.username}</span>
                            )}
                          </h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Phone: {status.user?.phone || 'Hidden'}</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active Session</Badge>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400">
                      <p>✨ Session is automatically saved to your local database. No manual session string required!</p>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button variant="destructive" size="sm" onClick={handleLogout} disabled={submitting} className="gap-2">
                        <LogOut size={14} /> Disconnect Account
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Guide link */}
                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-400 shrink-0" />
                        <span>Need Telegram API ID & Hash?</span>
                      </div>
                      <a
                        href="https://my.telegram.org"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline hover:text-white flex items-center gap-1"
                      >
                        Get at my.telegram.org <ExternalLink size={12} />
                      </a>
                    </div>

                    <form onSubmit={step === 'phone' ? handleSendCode : handleLogin} className="space-y-4">
                      {step === 'phone' && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-zinc-400">API ID</label>
                              <Input placeholder="e.g. 12345678" value={apiId} onChange={(e) => setApiId(e.target.value)} className="bg-zinc-900 border-zinc-800 text-xs h-10" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-zinc-400">API Hash</label>
                              <Input placeholder="32-char string" value={apiHash} onChange={(e) => setApiHash(e.target.value)} className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono" />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400">Phone Number (International Format)</label>
                            <Input placeholder="+1234567890" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="bg-zinc-900 border-zinc-800 text-xs h-10" />
                          </div>

                          <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 rounded-xl">
                            {submitting ? <Loader2 className="animate-spin size-4" /> : 'Send Login Code'}
                          </Button>
                        </>
                      )}

                      {(step === 'code' || step === '2fa') && (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-400">Telegram Login Code</label>
                            <Input placeholder="Enter code" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className="bg-zinc-900 border-zinc-800 text-xs h-10" />
                          </div>

                          {step === '2fa' && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-zinc-400">2FA Password {passwordHint && `(Hint: ${passwordHint})`}</label>
                              <Input type="password" placeholder="Enter 2FA password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-zinc-900 border-zinc-800 text-xs h-10" />
                            </div>
                          )}

                          <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 rounded-xl">
                            {submitting ? <Loader2 className="animate-spin size-4" /> : 'Verify & Log In'}
                          </Button>
                        </>
                      )}
                    </form>

                    {/* Collapsible Advanced Session String */}
                    <div className="pt-2 border-t border-zinc-900">
                      <button
                        type="button"
                        onClick={() => setShowManualSession(!showManualSession)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 font-semibold flex items-center gap-1 transition-colors"
                      >
                        {showManualSession ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Advanced: Paste Existing Session String
                      </button>

                      {showManualSession && (
                        <form onSubmit={handleSaveSession} className="space-y-3 mt-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 animate-in fade-in">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-zinc-400">Session String</label>
                            <Input placeholder="Paste StringSession..." value={sessionString} onChange={(e) => setSessionString(e.target.value)} className="bg-zinc-950 border-zinc-800 text-xs h-9 font-mono" />
                          </div>
                          <Button type="submit" disabled={submitting} size="sm" className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs h-8">
                            {submitting ? <Loader2 className="animate-spin size-3" /> : 'Save Session String'}
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* TAB 2: PASSCODE LOCK SECURITY */}
              {activeTab === 'passcode' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                        <Lock size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm">App Security Passcode</h4>
                        <p className="text-xs text-zinc-400">
                          {passcodeSet ? 'Passcode protection is ENABLED.' : 'Passcode protection is currently DISABLED.'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={passcodeSet ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-500'}>
                      {passcodeSet ? 'Protected' : 'Off'}
                    </Badge>
                  </div>

                  <form onSubmit={handleSetPasscode} className="space-y-4">
                    {passcodeSet && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">Current Passcode</label>
                        <Input
                          type="password"
                          placeholder="Enter current passcode..."
                          value={currentPasscode}
                          onChange={(e) => setCurrentPasscode(e.target.value)}
                          className="bg-zinc-900 border-zinc-800 text-xs h-10"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">
                        {passcodeSet ? 'New Passcode' : 'Create Admin Passcode'}
                      </label>
                      <Input
                        type="password"
                        placeholder="Min 4 characters (PIN or password)"
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={submitting || !newPasscode.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 rounded-xl">
                        {submitting ? <Loader2 className="animate-spin size-4" /> : passcodeSet ? 'Update Passcode' : 'Enable Passcode Lock'}
                      </Button>

                      {passcodeSet && (
                        <Button type="button" variant="destructive" onClick={handleRemovePasscode} disabled={submitting} className="h-10 rounded-xl">
                          Disable Lock
                        </Button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
