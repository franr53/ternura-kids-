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
    <div className="min-h-screen flex" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Panel izquierdo — decorativo */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 40%, #fbcfe8 100%)' }}>
        {/* Círculos decorativos */}
        <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #ec4899, transparent)' }} />
        <div className="absolute bottom-[-60px] right-[-60px] w-96 h-96 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #f472b6, transparent)' }} />
        <div className="absolute top-1/3 right-20 w-24 h-24 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #fbbf24, transparent)' }} />

        <div className="relative z-10 text-center px-12">
          {/* Logo grande */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-6"
              style={{ background: 'linear-gradient(135deg, #ec4899, #f9a8d4)' }}>
              <span className="text-4xl">🎀</span>
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-3" style={{ color: '#be185d', letterSpacing: '-1px' }}>
            Ternura
          </h1>
          <h2 className="text-3xl font-light mb-6" style={{ color: '#db2777', letterSpacing: '4px' }}>
            KIDS
          </h2>
          <div className="w-16 h-0.5 mx-auto mb-6" style={{ background: '#f9a8d4' }} />
          <p className="text-lg" style={{ color: '#9d174d', fontStyle: 'italic' }}>
            Sistema de gestión
          </p>
          <p className="text-sm mt-2" style={{ color: '#be185d', opacity: 0.7 }}>
            Ropa infantil con amor
          </p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12"
        style={{ backgroundColor: '#fff' }}>
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
              style={{ background: 'linear-gradient(135deg, #ec4899, #f9a8d4)' }}>
              <span className="text-2xl">🎀</span>
            </div>
            <h1 className="text-3xl font-bold" style={{ color: '#be185d' }}>Ternura Kids</h1>
          </div>

          <div className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-800 mb-1">Bienvenida</h2>
            <p className="text-gray-400 text-sm">Ingresá tus datos para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border-b-2 border-gray-200 bg-transparent text-gray-800 outline-none transition-colors placeholder-gray-300 text-sm focus:border-pink-400"
                style={{ fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 border-b-2 border-gray-200 bg-transparent text-gray-800 outline-none transition-colors placeholder-gray-300 text-sm focus:border-pink-400"
                style={{ fontFamily: 'inherit' }}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 text-white font-semibold text-sm uppercase tracking-widest transition-all duration-200 disabled:opacity-60"
                style={{
                  background: loading
                    ? '#f9a8d4'
                    : 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                  borderRadius: '4px',
                  letterSpacing: '2px',
                }}
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-gray-300 mt-12">
            Ternura Kids © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
