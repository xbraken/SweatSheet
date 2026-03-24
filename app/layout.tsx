import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SweatSheet',
  description: 'Track your gym progress and spot real trends',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SweatSheet',
  },
}

export const viewport: Viewport = {
  themeColor: '#ff9066',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-white font-body">
        <div className="mx-auto max-w-[390px] min-h-screen relative">
          {children}
        </div>
      </body>
    </html>
  )
}
