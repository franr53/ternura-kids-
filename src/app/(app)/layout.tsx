'use client'

import TopBar from '@/components/layout/top-bar'
import BottomNav from '@/components/layout/bottom-nav'
import { Toaster } from '@/components/ui/sonner'
import { PrivacyProvider } from '@/lib/hooks/use-privacy-mode'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <div className="flex flex-col min-h-screen bg-[#FAFAFA]">
        <TopBar />
        <main className="flex-1 overflow-auto pb-24 pt-2 px-4 lg:px-8">
          {children}
        </main>
        <BottomNav />
        <Toaster richColors position="top-right" />
      </div>
    </PrivacyProvider>
  )
}
