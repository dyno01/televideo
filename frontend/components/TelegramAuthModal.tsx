'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
  ChevronUp,
  Cloud,
  UploadCloud,
  HardDrive,
  Pause,
  Play
} from 'lucide-react'
import {
  getTelegramStatus,
  sendTelegramCode,
  loginTelegram,
  saveTelegramSession,
  logoutTelegram,
  getCurrentUser,
  changePassword,
  getStreamtapeConfig,
  saveStreamtapeConfig,
  testStreamtapeConnection,
  toggleStreamtapePause,
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
  const [activeTab, setActiveTab] = useState<'telegram' | 'account' | 'streamtape'>('telegram')
  const [showManualSession, setShowManualSession] = useState(false)
  
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: number, username: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // Streamtape CDN settings
  const [streamtapeConfig, setStreamtapeConfig] = useState<{ configured: boolean; login: string; hasKey: boolean; appUrl?: string; daily_uploads?: { count: number; limit: number; paused?: boolean } } | null>(null)
  const [stLogin, setStLogin] = useState('')
  const [stKey, setStKey] = useState('')
  const [stAppUrl, setStAppUrl] = useState('')
  const [stLoading, setStLoading] = useState(false)
  const [stDailyPaused, setStDailyPaused] = useState(false)
  const [stTogglingPause, setStTogglingPause] = useState(false)

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
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false)

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
      const [data, userRes, stCfg] = await Promise.all([
        getTelegramStatus(),
        getCurrentUser().catch(() => ({ user: null })),
        getStreamtapeConfig().catch(() => null)
      ])
      setStatus(data)
      setCurrentUser(userRes.user)
      if (data.apiId) setApiId(String(data.apiId))
      if (stCfg) {
        setStreamtapeConfig(stCfg)
        if (stCfg.login) setStLogin(stCfg.login)
        if (stCfg.appUrl) setStAppUrl(stCfg.appUrl)
        if (stCfg.daily_uploads) setStDailyPaused(!!stCfg.daily_uploads.paused)
      }
      onStatusChange?.(data)
    } catch (err: any) {
      setErrorMsg('Failed to check status.')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePause = async () => {
    setStTogglingPause(true)
    setErrorMsg('')
    try {
      const res = await toggleStreamtapePause(!stDailyPaused)
      setStDailyPaused(res.paused)
      setStreamtapeConfig(prev => prev ? {
        ...prev,
        daily_uploads: {
          ...(prev.daily_uploads || { count: 0, limit: 5 }),
          paused: res.paused
        }
      } : null)
      setSuccessMsg(res.paused ? '⏸️ Daily auto-upload paused.' : '▶️ Daily auto-upload resumed.')
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to toggle upload pause.')
    } finally {
      setStTogglingPause(false)
    }
  }

  const [stTesting, setStTesting] = useState(false)

  const handleSaveStreamtape = async (e: React.FormEvent) => {
    e.preventDefault()
    setStLoading(true)
    setErrorMsg('')
    try {
      const res = await saveStreamtapeConfig(stLogin, stKey, stAppUrl)
      setSuccessMsg(res.configured ? 'Streamtape connected! Videos will now stream via CDN.' : 'Streamtape credentials saved.')
      const updated = await getStreamtapeConfig()
      setStreamtapeConfig(updated)
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to save Streamtape configuration.')
    } finally {
      setStLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setStTesting(true)
    setErrorMsg('')
    try {
      if (stLogin.trim()) {
        await saveStreamtapeConfig(stLogin, stKey, stAppUrl)
      }
      const res = await testStreamtapeConnection()
      if (res.success) {
        setSuccessMsg('✅ Streamtape API verified & reachable via Cloudflare DNS!')
        const updated = await getStreamtapeConfig()
        setStreamtapeConfig(updated)
      } else {
        setErrorMsg(res.error || 'Connection test failed.')
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Could not connect to Streamtape API.')
    } finally {
      setStTesting(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStatus()
    }
  }, [isOpen])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber.trim()) {
      setErrorMsg('Please enter your phone number.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await sendTelegramCode(phoneNumber, apiId, apiHash)
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
          'Failed to send verification code. Double-check your phone format (e.g. +919876543210).'
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPasscode || newPasscode.trim().length < 4) {
      setErrorMsg('New password must be at least 4 characters long.')
      return
    }
    setSubmitting(true)
    setErrorMsg('')
    try {
      await changePassword(currentPasscode, newPasscode)
      setNewPasscode('')
      setCurrentPasscode('')
      setSuccessMsg('Password updated successfully!')
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to update password.')
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
                  className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                    activeTab === 'telegram'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('telegram')
                    setErrorMsg('')
                  }}
                >
                  Telegram
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'streamtape'
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('streamtape')
                    setErrorMsg('')
                  }}
                >
                  <Cloud size={12} /> Streamtape CDN
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'account'
                      ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  onClick={() => {
                    setActiveTab('account')
                    setErrorMsg('')
                  }}
                >
                  <Lock size={12} /> Account
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
                    <form onSubmit={step === 'phone' ? handleSendCode : handleLogin} className="space-y-4">
                      {step === 'phone' && (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-zinc-300">
                              Phone Number (International Format)
                            </label>
                            <Input 
                              placeholder="e.g. +91 9876543210" 
                              value={phoneNumber} 
                              onChange={(e) => setPhoneNumber(e.target.value)} 
                              className="bg-zinc-900 border-zinc-800 text-sm h-11 rounded-xl"
                              autoFocus
                            />
                            <p className="text-[11px] text-zinc-500">
                              Enter your mobile number with country code. Telegram will send a verification code to your Telegram app.
                            </p>
                          </div>

                          {/* Optional Custom API Credentials Collapsible */}
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                              className="text-[11px] text-zinc-500 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                            >
                              {showAdvancedConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {showAdvancedConfig ? 'Hide custom API credentials' : 'Custom Telegram API ID & Hash (Optional)'}
                            </button>

                            {showAdvancedConfig && (
                              <div className="grid grid-cols-2 gap-3 mt-2.5 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80">
                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-zinc-400">Custom API ID</label>
                                  <Input 
                                    placeholder="Optional" 
                                    value={apiId} 
                                    onChange={(e) => setApiId(e.target.value)} 
                                    className="bg-zinc-900 border-zinc-800 text-xs h-9" 
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-medium text-zinc-400">Custom API Hash</label>
                                  <Input 
                                    placeholder="Optional" 
                                    value={apiHash} 
                                    onChange={(e) => setApiHash(e.target.value)} 
                                    className="bg-zinc-900 border-zinc-800 text-xs h-9 font-mono" 
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-11 rounded-xl shadow-lg transition-all">
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

              {/* TAB 2: ACCOUNT SETTINGS */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                        <Lock size={20} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm">Account Security</h4>
                        <p className="text-xs text-zinc-400">
                          Logged in as <strong className="text-indigo-400">{currentUser?.username || 'Unknown'}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">Current Password</label>
                      <Input
                        type="password"
                        placeholder="Enter current password..."
                        value={currentPasscode}
                        onChange={(e) => setCurrentPasscode(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">New Password</label>
                      <Input
                        type="password"
                        placeholder="Min 4 characters"
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={submitting || !newPasscode.trim() || !currentPasscode.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 rounded-xl">
                        {submitting ? <Loader2 className="animate-spin size-4" /> : 'Update Password'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* STREAMTAPE CDN SETTINGS TAB */}
              {activeTab === 'streamtape' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cloud className="text-emerald-400 size-5" />
                        <div>
                          <h4 className="text-xs font-bold text-zinc-200">Streamtape Cloud CDN</h4>
                          <p className="text-[11px] text-zinc-500">Fast unlimited video streaming with 0 Render bandwidth</p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          streamtapeConfig?.configured
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]'
                            : 'border-zinc-700 bg-zinc-800 text-zinc-400 text-[10px]'
                        }
                      >
                        {streamtapeConfig?.configured ? 'Active & Ready' : 'Not Configured'}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Connecting Streamtape allows background auto-uploading of videos. Once uploaded, videos play via Streamtape CDN, conserving 100% of your Render server bandwidth quota.
                    </p>

                    {streamtapeConfig?.configured && (
                      <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3 mt-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-200">Daily Auto-Uploads</span>
                            <Badge variant="outline" className={stDailyPaused ? "text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30" : "text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}>
                              {stDailyPaused ? 'Paused' : 'Active (5/day)'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-zinc-500">
                            {stDailyPaused 
                              ? 'Background auto-uploads are paused. Click manual upload button anytime.' 
                              : `Automated sequence uploads running (${streamtapeConfig.daily_uploads?.count ?? 0}/${streamtapeConfig.daily_uploads?.limit ?? 5} today).`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleTogglePause}
                          disabled={stTogglingPause}
                          className={cn(
                            "h-8 text-xs font-semibold shrink-0 gap-1.5 transition-all",
                            stDailyPaused 
                              ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-white" 
                              : "border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 hover:text-white"
                          )}
                        >
                          {stTogglingPause ? (
                            <Loader2 className="animate-spin size-3.5" />
                          ) : stDailyPaused ? (
                            <>
                              <Play size={12} className="text-emerald-400" />
                              <span>Resume</span>
                            </>
                          ) : (
                            <>
                              <Pause size={12} className="text-amber-400" />
                              <span>Pause</span>
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSaveStreamtape} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                        <span>API / FTP Login</span>
                        <a
                          href="https://streamtape.com/panel"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          Find on Streamtape Panel <ExternalLink size={10} />
                        </a>
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. 5a1b2c3d4e5f"
                        value={stLogin}
                        onChange={(e) => setStLogin(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400">FTP / API Password (Key)</label>
                      <Input
                        type="password"
                        placeholder={streamtapeConfig?.hasKey ? '•••••••••••••••• (Configured)' : 'Enter API Key / Password'}
                        value={stKey}
                        onChange={(e) => setStKey(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
                        <span>Backend Server Public URL (For Remote Uploads)</span>
                        <span className="text-[10px] text-zinc-500">Auto-detected or custom</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="https://your-backend.onrender.com"
                        value={stAppUrl}
                        onChange={(e) => setStAppUrl(e.target.value)}
                        className="bg-zinc-900 border-zinc-800 text-xs h-10 font-mono"
                      />
                      <p className="text-[10px] text-zinc-500">
                        Streamtape connects directly to this URL to pull video streams into your account.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={stLoading || !stLogin.trim()}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 rounded-xl flex items-center justify-center gap-2"
                      >
                        {stLoading ? <Loader2 className="animate-spin size-4" /> : <UploadCloud size={16} />}
                        Save Credentials
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={stTesting || stLoading || !stLogin.trim()}
                        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs h-10 rounded-xl flex items-center gap-2 px-3"
                        title="Test connection to Streamtape API via forced Cloudflare DNS"
                      >
                        {stTesting ? <Loader2 className="animate-spin size-4" /> : <Sparkles size={14} className="text-amber-400" />}
                        Test Connection
                      </Button>
                    </div>
                  </form>

                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
                    <span className="font-semibold text-zinc-300">💡 Zero-Bandwidth Admin Upload:</span>
                    <p>
                      If your Render bandwidth is ever running low, you can upload videos directly to Streamtape using their web interface or desktop tools, then paste the link directly on any video page to link it instantly!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
