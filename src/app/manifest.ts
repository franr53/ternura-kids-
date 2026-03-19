import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ternura Kids — Gestión',
    short_name: 'TernuraKids',
    description: 'Sistema de gestión para tienda de ropa infantil',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4EC3BD',
    orientation: 'landscape',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Nueva venta',
        url: '/pos',
        description: 'Ir al punto de venta',
      },
      {
        name: 'Inventario',
        url: '/inventario',
        description: 'Ver inventario',
      },
    ],
  }
}
