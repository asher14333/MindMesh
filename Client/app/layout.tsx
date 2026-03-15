import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import "@xyflow/react/dist/style.css"
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'MindMesh - Meeting Copilot',
  description: 'Turn live conversations into visual explanations in real-time',
  generator: 'v0.app',
  icons: {
    icon: '/Favicon.png',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
