import type { Metadata } from 'next'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import PasscodeGuard from '@/components/PasscodeGuard'

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Telegram Learning Dashboard',
  description: 'Organize Telegram channel content into a structured learning platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("dark", geist.variable)}>
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <PasscodeGuard>
          {children}
        </PasscodeGuard>
      </body>
    </html>
  )
}
