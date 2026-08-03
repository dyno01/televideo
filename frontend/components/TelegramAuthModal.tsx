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
} from 'lucide-react'
import {
  getTelegramStatus,
  sendTelegramCode,
  loginTelegram,
  saveTelegramSession,
  logoutTelegram,
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
  const [activeTab, setActiveTab] = useState<'phone' | 'session'>('phone')
  const [status, setStatus] = useState<TelegramStatus | null>(null)
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

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const fetchStatus = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const data = await getTelegramStatus()
      setStatus(data)
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

      setSuccessMsg('Successfully connected to Telegram!')
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
                  Telegram Connection
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                  Manage your Telegram session and API credentials
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
              <p className="text-xs font-semibold">Checking Telegram status...</p>
            </div>
          ) : status?.authenticated ? (
            /* --- LOGGED IN ACCOUNT VIEW --- */
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg">
                    {status.user?.firstName?.charAt(0) ||
                      status.user?.username?.charAt(0) ||
                      'U'}
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base flex items-center gap-2">
                      {status.user?.firstName || 'Telegram User'}
                      {status.user?.username && (
                        <span className="text-xs text-zinc-400 font-normal">
                          @{status.user.username}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Phone: {status.user?.phone || 'Hidden'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                    Active Session
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80 text-xs space-y-2">
                <div className="flex justify-between text-zinc-400">
                  <span>API ID:</span>
                  <span className="text-zinc-200 font-mono font-bold">
                    {status.apiId || 'Configured'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>API Hash:</span>
                  <span className="text-zinc-200 font-mono">••••••••••••••••</span>
                </div>
              </div>

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <a
                  href="https://my.telegram.org"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <ExternalLink size={14} /> API Dev Tools
                </a>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleLogout}
                  disabled={submitting}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <LogOut size={14} />
                  )}
                  Disconnect Session
                </Button>
              </div>
            </div>
          ) : (
            /* --- NOT LOGGED IN / AUTHENTICATION FLOW --- */
            <div className="space-y-6">
              {/* Tab selector */}
              <div className="flex p-1 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                    activeTab === 'phone'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('phone')
                    setErrorMsg('')
                  }}
                >
                  Phone Number Login
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                    activeTab === 'session'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('session')
                    setErrorMsg('')
                  }}
                >
                  Paste Session String
                </button>
              </div>

              {/* Status or error banners */}
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

              {activeTab === 'phone' ? (
                /* STEP 1: Phone Login Form */
                <form
                  onSubmit={
                    step === 'phone'
                      ? handleSendCode
                      : handleLogin
                  }
                  className="space-y-4"
                >
                  {step === 'phone' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-400">
                            API ID
                          </label>
                          <Input
                            placeholder="e.g. 12345678"
                            value={apiId}
                            onChange={(e) => setApiId(e.target.value)}
                            className="bg-zinc-900 border-zinc-800 text-xs h-10"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-400">
                            API Hash
                          </label>
                          <Input
                            placeholder="32-char string"
                            value={apiHash}
                            onChange={(e) => setApiHash(e.target.value)}
                            className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Phone Number (with country code)
                        </label>
                        <Input
                          placeholder="+919876543210"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="bg-zinc-900 border-zinc-800 text-xs h-10"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-bold h-11 rounded-xl"
                      >
                        {submitting ? (
                          <Loader2 className="animate-spin mr-2" size={16} />
                        ) : (
                          <Smartphone className="mr-2" size={16} />
                        )}
                        Send Verification Code
                      </Button>
                    </>
                  )}

                  {step === 'code' && (
                    <>
                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                        Enter the code sent to{' '}
                        <span className="text-white font-bold">{phoneNumber}</span>{' '}
                        via {isAppCode ? 'Telegram App' : 'SMS'}.
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          Telegram Login Code
                        </label>
                        <Input
                          placeholder="12345"
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value)}
                          className="bg-zinc-900 border-zinc-800 text-base h-12 tracking-widest text-center font-bold"
                          autoFocus
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setStep('phone')}
                          className="flex-1 border-zinc-800 text-zinc-400"
                        >
                          Back
                        </Button>
                        <Button
                          type="submit"
                          disabled={submitting || !phoneCode}
                          className="flex-1 bg-white text-zinc-950 hover:bg-zinc-200 font-bold"
                        >
                          {submitting ? (
                            <Loader2 className="animate-spin mr-2" size={16} />
                          ) : null}
                          Verify & Sign In
                        </Button>
                      </div>
                    </>
                  )}

                  {step === '2fa' && (
                    <>
                      <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                        Two-step verification is enabled for this account.
                        {passwordHint && (
                          <p className="text-amber-400 mt-1 font-semibold">
                            Hint: {passwordHint}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-400">
                          2FA Password
                        </label>
                        <Input
                          type="password"
                          placeholder="Your 2FA Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-zinc-900 border-zinc-800 text-xs h-10"
                          autoFocus
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting || !password}
                        className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-bold h-11 rounded-xl"
                      >
                        {submitting ? (
                          <Loader2 className="animate-spin mr-2" size={16} />
                        ) : null}
                        Complete 2FA Login
                      </Button>
                    </>
                  )}
                </form>
              ) : (
                /* OPTION B: Paste Session String */
                <form onSubmit={handleSaveSession} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">
                        API ID
                      </label>
                      <Input
                        placeholder="e.g. 12345678"
                        value={apiId}
                        onChange={(e) => setApiId(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">
                        API Hash
                      </label>
                      <Input
                        placeholder="32-char string"
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400">
                      GramJS SESSION_STRING
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Paste 1BQAN..."
                      value={sessionString}
                      onChange={(e) => setSessionString(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-bold h-11 rounded-xl"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin mr-2" size={16} />
                    ) : (
                      <Key className="mr-2" size={16} />
                    )}
                    Save Session & Authenticate
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
