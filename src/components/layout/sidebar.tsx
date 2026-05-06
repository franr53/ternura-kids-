'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  BarChart3, Tag, Wallet, MessageCircle, LogOut, Download,
  ChevronLeft, ChevronRight, Receipt, History,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard',   label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/pos',         label: 'Punto de Venta', icon: ShoppingCart },
  { href: '/inventario',  label: 'Inventario',     icon: Package },
  { href: '/clientes',    label: 'Clientes',       icon: Users },
  { href: '/ventas',      label: 'Ventas',         icon: History },
  { href: '/proveedores', label: 'Proveedores',    icon: Truck },
  { href: '/caja',        label: 'Caja',           icon: Wallet },
  { href: '/gastos',      label: 'Gastos',         icon: Receipt },
  { href: '/etiquetas',   label: 'Etiquetas',      icon: Tag },
  { href: '/reportes',    label: 'Reportes',       icon: BarChart3 },
  { href: '/whatsapp',    label: 'WhatsApp',       icon: MessageCircle },
  { href: '/importar',    label: 'Importar',       icon: Download },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen transition-all duration-300 shrink-0 relative',
        collapsed ? 'w-[64px]' : 'w-[220px]'
      )}
      style={{ background: 'linear-gradient(180deg, #0B3D39 0%, #0a3330 100%)' }}
    >
      {/* Textura sutil */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Logo */}
      <div className={cn(
        'relative flex items-center border-b py-5 transition-all duration-300',
        collapsed ? 'justify-center px-3' : 'px-5 gap-2',
      )} style={{ borderColor: 'rgba(78,195,189,0.15)' }}>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p
              className="text-white font-bold leading-none truncate"
              style={{ fontFamily: 'var(--font-display)', fontSize: '18px', letterSpacing: '-0.3px' }}
            >
              Ternura
              <span style={{ color: '#4EC3BD' }}> Kids</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(78,195,189,0.6)', letterSpacing: '2px' }}>
              GESTIÓN
            </p>
          </div>
        )}
        {collapsed && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: 'rgba(78,195,189,0.2)', color: '#4EC3BD', fontFamily: 'var(--font-display)' }}
          >
            T
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#4EC3BD')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden space-y-0.5 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center rounded-lg transition-all duration-150 group relative',
                collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5',
              )}
              style={{
                background: active ? 'rgba(78,195,189,0.15)' : 'transparent',
                color: active ? '#4EC3BD' : 'rgba(255,255,255,0.55)',
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.background = 'transparent'
                if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
              }}
            >
              {/* Barra activa */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                  style={{ background: '#4EC3BD' }}
                />
              )}
              <Icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-2 relative" style={{ borderTop: '1px solid rgba(78,195,189,0.12)' }}>
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center rounded-lg py-2.5 transition-all duration-150 text-sm',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#f87171'
            e.currentTarget.style.background = 'rgba(248,113,113,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
            e.currentTarget.style.background = 'transparent'
          }}
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span className="font-medium">Salir</span>}
        </button>
      </div>
    </aside>
  )
}
