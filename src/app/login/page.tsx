'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">

      {/* Fondo: logo ocupando toda la pantalla con blur fuerte */}
      <div className="absolute inset-0">
        <Image
          src="/logo.png"
          alt=""
          fill
          className="object-cover"
          style={{ filter: 'blur(20px)', transform: 'scale(1.1)' }}
          priority
        />
        {/* Overlay oscuro para contraste */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
      </div>

      {/* Card glassmorphism */}
      <div className="tk-fade-up relative z-10 w-full max-w-md mx-4">

        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl font-black text-white mb-1 leading-none"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-1px', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            Ternura
          </h1>
          <p
            className="text-lg font-bold tracking-[6px] uppercase"
            style={{ color: '#4EC3BD', textShadow: '0 1px 8px rgba(78,195,189,0.4)' }}
          >
            Kids
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <p className="text-white/50 text-sm mb-6 text-center">
            Ingresá para continuar
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-widest mb-2 text-white/50"
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="tu@email.com"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all duration-200 text-white placeholder-white/25"
                style={{
                  background: 'rgba(100,200,220,0.15)',
                  border: '1px solid rgba(120,210,230,0.25)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                onFocus={e => {
                  e.target.style.border = '1px solid rgba(120,210,230,0.5)'
                  e.target.style.background = 'rgba(100,200,220,0.22)'
                  e.target.style.boxShadow = '0 0 16px rgba(100,200,220,0.15)'
                }}
                onBlur={e => {
                  e.target.style.border = '1px solid rgba(120,210,230,0.25)'
                  e.target.style.background = 'rgba(100,200,220,0.15)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-widest mb-2 text-white/50"
              >
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all duration-200 text-white placeholder-white/25"
                style={{
                  background: 'rgba(100,200,220,0.15)',
                  border: '1px solid rgba(120,210,230,0.25)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                onFocus={e => {
                  e.target.style.border = '1px solid rgba(120,210,230,0.5)'
                  e.target.style.background = 'rgba(100,200,220,0.22)'
                  e.target.style.boxShadow = '0 0 16px rgba(100,200,220,0.15)'
                }}
                onBlur={e => {
                  e.target.style.border = '1px solid rgba(120,210,230,0.25)'
                  e.target.style.background = 'rgba(100,200,220,0.15)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 relative overflow-hidden cursor-pointer"
                style={{
                  background: loading
                    ? 'rgba(180,130,200,0.4)'
                    : 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                  color: 'white',
                  letterSpacing: '0.5px',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(168,85,247,0.4)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10"/>
                    </svg>
                    Ingresando...
                  </span>
                ) : 'Ingresar'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs mt-6 text-white/25">
          Ternura Kids &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
