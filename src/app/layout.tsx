import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { GlobalSearch } from '@/components/global-search'
import { NotificationCenter } from '@/components/notification-center'
import { StreamProvider } from '@/components/stream-provider'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Nexora Studio',
  description: '智能协作工作台',
  icons: {
    icon: [
      { url: '/icons/agenthub-mark.svg', type: 'image/svg+xml' },
      { url: '/icons/agenthub-mark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/agenthub-mark-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/agenthub-mark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/agenthub-mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/icons/agenthub-256.png'],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen overflow-x-hidden">
        <ThemeProvider>
          <StreamProvider>
            {children}
            <NotificationCenter />
          </StreamProvider>
        </ThemeProvider>
        <GlobalSearch />
      </body>
    </html>
  )
}
