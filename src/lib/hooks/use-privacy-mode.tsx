'use client'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface PrivacyCtx {
  privado: boolean
  togglePrivado: () => void
  mask: (v: string) => string
}

const Ctx = createContext<PrivacyCtx>({
  privado: false, togglePrivado: () => {}, mask: v => v,
})

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privado, setPrivado] = useState(false)

  useEffect(() => {
    setPrivado(localStorage.getItem('privacy:mode') === '1')
  }, [])

  const togglePrivado = useCallback(() => {
    setPrivado(prev => {
      const next = !prev
      localStorage.setItem('privacy:mode', next ? '1' : '0')
      return next
    })
  }, [])

  const mask = useCallback((v: string) => privado ? '••••••' : v, [privado])

  return <Ctx value={{ privado, togglePrivado, mask }}>{children}</Ctx>
}

export const usePrivacyMode = () => useContext(Ctx)
