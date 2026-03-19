'use client'

import Image from 'next/image'
import { Bell, SignOut, Eye, EyeSlash } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'

export default function TopBar() {
  const router = useRouter()
  const supabase = createClient()
  const { privado, togglePrivado } = usePrivacyMode()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between px-4"
      style={{
        background: 'linear-gradient(to right, #4EC3BD 0%, #ffffff 15%, #ffffff 100%)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <Image src="/icons/hand.png" alt="" width={40} height={40} />
        <span className="text-lg font-display font-semibold sm:text-xl">
          <span className="text-white">Ternura</span>{' '}
          <span className="text-teal-500">Kids</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePrivado}
          className={`rounded-md p-2 transition-colors ${privado ? 'text-teal-600 bg-teal-50 hover:bg-teal-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
          aria-label={privado ? 'Mostrar montos' : 'Ocultar montos'}
          title={privado ? 'Mostrar montos' : 'Ocultar montos'}
        >
          {privado ? <EyeSlash size={20} weight="duotone" /> : <Eye size={20} weight="duotone" />}
        </button>

        <button
          type="button"
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Notificaciones"
        >
          <Bell size={20} weight="duotone" />
        </button>

        <span className="hidden text-sm font-medium text-gray-700 sm:inline">
          Admin
        </span>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600"
          aria-label="Cerrar sesion"
        >
          <SignOut size={20} weight="duotone" />
        </button>
      </div>
    </header>
  )
}
