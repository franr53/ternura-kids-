'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  BarChart3,
  Tag,
  Wallet,
  MessageCircle,
  LogOut,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/pos',          label: 'Punto de Venta', icon: ShoppingCart },
  { href: '/inventario',   label: 'Inventario',   icon: Package },
  { href: '/clientes',     label: 'Clientes',     icon: Users },
  { href: '/proveedores',  label: 'Proveedores',  icon: Truck },
  { href: '/caja',         label: 'Caja',         icon: Wallet },
  { href: '/etiquetas',    label: 'Etiquetas',    icon: Tag },
  { href: '/reportes',     label: 'Reportes',     icon: BarChart3 },
  { href: '/whatsapp',     label: 'WhatsApp',     icon: MessageCircle },
  { href: '/importar',     label: 'Importar',     icon: Download },
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
    <aside className={cn(
      'flex flex-col bg-white border-r border-gray-200 transition-all duration-300 h-screen',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
        {!collapsed && (
          <div>
            <span className="text-lg font-bold text-pink-600">Ternura</span>
            <span className="text-lg font-bold text-gray-700"> Kids</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 ml-auto"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-pink-50 text-pink-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-100">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full text-gray-500 hover:text-red-500 hover:bg-red-50',
            collapsed ? 'px-2 justify-center' : 'justify-start gap-3'
          )}
          title={collapsed ? 'Salir' : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>Salir</span>}
        </Button>
      </div>
    </aside>
  )
}
