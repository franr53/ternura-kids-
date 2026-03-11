'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0B3D39' }}>

      {/* Blobs orgánicos de fondo */}
      <div className="tk-blob absolute"
        style={{
          width: 600, height: 600,
          top: '-15%', left: '-10%',
          background: 'radial-gradient(circle, rgba(78,195,189,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div className="tk-blob absolute"
        style={{
          width: 500, height: 500,
          bottom: '-20%', right: '-8%',
          background: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animationDelay: '-4s',
        }}
      />
      <div className="tk-blob absolute"
        style={{
          width: 300, height: 300,
          top: '30%', right: '20%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
          animationDelay: '-2s',
        }}
      />

      {/* Patrón de puntos sutil */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(78,195,189,1) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Card principal */}
      <div className="tk-fade-up relative z-10 w-full max-w-md mx-4">

        {/* Header de la card */}
        <div className="text-center mb-10">
          {/* Ícono */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
            style={{
              background: 'rgba(78,195,189,0.15)',
              border: '1px solid rgba(78,195,189,0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="text-3xl" role="img" aria-label="oso">🧸</span>
          </div>

          <h1
            className="text-5xl font-black text-white mb-1 leading-none"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-1px' }}
          >
            Ternura
          </h1>
          <p
            className="text-lg font-bold tracking-[6px] uppercase"
            style={{ color: '#4EC3BD' }}
          >
            Kids
          </p>
        </div>

        {/* Formulario */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(78,195,189,0.2)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <p className="text-white/60 text-sm mb-6 text-center">
            Ingresá para continuar
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(78,195,189,0.7)' }}
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
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 placeholder-white/20"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(78,195,189,0.2)',
                  color: 'white',
                  fontFamily: 'var(--font-sans)',
                }}
                onFocus={e => {
                  e.target.style.border = '1px solid rgba(78,195,189,0.6)'
                  e.target.style.background = 'rgba(255,255,255,0.1)'
                }}
                onBlur={e => {
                  e.target.style.border = '1px solid rgba(78,195,189,0.2)'
                  e.target.style.background = 'rgba(255,255,255,0.07)'
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'rgba(78,195,189,0.7)' }}
              >
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 placeholder-white/20"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(78,195,189,0.2)',
                  color: 'white',
                  fontFamily: 'var(--font-sans)',
                }}
                onFocus={e => {
                  e.target.style.border = '1px solid rgba(78,195,189,0.6)'
                  e.target.style.background = 'rgba(255,255,255,0.1)'
                }}
                onBlur={e => {
                  e.target.style.border = '1px solid rgba(78,195,189,0.2)'
                  e.target.style.background = 'rgba(255,255,255,0.07)'
                }}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 relative overflow-hidden"
                style={{
                  background: loading
                    ? 'rgba(78,195,189,0.4)'
                    : 'linear-gradient(135deg, #4EC3BD 0%, #14b8a6 100%)',
                  color: loading ? 'rgba(255,255,255,0.6)' : '#0B3D39',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.5px',
                  boxShadow: loading ? 'none' : '0 4px 24px rgba(78,195,189,0.4)',
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

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(78,195,189,0.3)' }}>
          Ternura Kids © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
