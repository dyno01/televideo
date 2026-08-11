'use client'

import React, { useState, useEffect } from 'react'
import { getPasscodeStatus } from '@/lib/api'
import PasscodeLock from '@/components/PasscodeLock'

export default function PasscodeGuard({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false)
  const [userCount, setUserCount] = useState(0)

  const checkPasscode = async () => {
    try {
      const res = await getPasscodeStatus()
      if (res.userCount !== undefined) {
        setUserCount(res.userCount)
      }
      if (res.passcodeSet) {
        const token = localStorage.getItem('app_passcode_token')
        if (!token) {
          setIsLocked(true)
        }
      }
    } catch (_) {}
  }

  useEffect(() => {
    checkPasscode()

    const handlePasscodeRequired = () => {
      setIsLocked(true)
    }

    window.addEventListener('app_passcode_required', handlePasscodeRequired)
    return () => {
      window.removeEventListener('app_passcode_required', handlePasscodeRequired)
    }
  }, [])

  return (
    <>
      {children}
      {isLocked && (
        <PasscodeLock
          defaultIsRegister={userCount === 0}
          onUnlocked={() => {
            setIsLocked(false)
            window.location.reload()
          }}
        />
      )}
    </>
  )
}
