'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IconWeight } from '@phosphor-icons/react'
import {
  SquaresFour,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Wallet,
  Receipt,
  Tag,
  ChartBar,
  WhatsappLogo,
  DownloadSimple,
  DotsThree,
  ClipboardText,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>
}

const primaryItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: SquaresFour },
  { label: 'POS', href: '/pos', icon: ShoppingCart },
  { label: 'Inventario', href: '/inventario', icon: Package },
  { label: 'Clientes', href: '/clientes', icon: Users },
]

const secondaryItems: NavItem[] = [
  { label: 'Ventas', href: '/ventas', icon: ClipboardText },
  { label: 'Proveedores', href: '/proveedores', icon: Truck },
  { label: 'Caja', href: '/caja', icon: Wallet },
  { label: 'Gastos', href: '/gastos', icon: Receipt },
  { label: 'Etiquetas', href: '/etiquetas', icon: Tag },
  { label: 'Reportes', href: '/reportes', icon: ChartBar },
  { label: 'WhatsApp', href: '/whatsapp', icon: WhatsappLogo },
  { label: 'Importar', href: '/importar', icon: DownloadSimple },
]

const allItems: NavItem[] = [...primaryItems, ...secondaryItems]

function NavItemButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  onClick?: () => void
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors ${
        isActive ? 'text-teal-500' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="bottom-nav-indicator"
          className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-teal-500"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
        <Icon size={22} weight={isActive ? 'fill' : 'duotone'} />
      </motion.div>
      <span className="text-[10px] leading-tight font-medium">{item.label}</span>
    </Link>
  )
}

export default function BottomNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  const isActive = (href: string) => pathname.startsWith(href)
  const isSecondaryActive = secondaryItems.some((item) => isActive(item.href))

  // Close overlay on click outside
  useEffect(() => {
    if (!showMore) return

    function handleClickOutside(e: MouseEvent) {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setShowMore(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMore])

  // Close overlay on route change
  useEffect(() => {
    setShowMore(false)
  }, [pathname])

  return (
    <>
      {/* Desktop: full inline nav */}
      <nav className="hidden lg:flex fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] items-center justify-center gap-1 px-4 py-2">
        {allItems.map((item) => (
          <NavItemButton key={item.href} item={item} isActive={isActive(item.href)} />
        ))}
      </nav>

      {/* Mobile: primary + "Más" */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        {/* "Más" overlay */}
        <AnimatePresence>
          {showMore && (
            <motion.div
              ref={overlayRef}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute bottom-full left-2 right-2 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 p-3"
            >
              <div className="grid grid-cols-3 gap-2">
                {secondaryItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowMore(false)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg p-3 transition-colors ${
                        active
                          ? 'bg-teal-50 text-teal-500'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={22} weight={active ? 'fill' : 'duotone'} />
                      <span className="text-[10px] leading-tight font-medium">
                        {item.label}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom bar */}
        <div className="flex items-center justify-around h-16 px-2">
          {primaryItems.map((item) => (
            <NavItemButton key={item.href} item={item} isActive={isActive(item.href)} />
          ))}

          {/* "Más" toggle */}
          <button
            ref={moreButtonRef}
            onClick={() => setShowMore((prev) => !prev)}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors ${
              showMore || isSecondaryActive
                ? 'text-teal-500'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {isSecondaryActive && !showMore && (
              <motion.div
                layoutId="bottom-nav-indicator"
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-teal-500"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
              <DotsThree size={22} weight="bold" />
            </motion.div>
            <span className="text-[10px] leading-tight font-medium">Más</span>
          </button>
        </div>
      </nav>
    </>
  )
}
