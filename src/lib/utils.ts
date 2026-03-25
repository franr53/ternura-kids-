import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNombreConTalle(nombre: string, talle: string): string {
  if (!talle || talle === 'Único' || talle === 'Unico') return nombre
  return `${nombre} T${talle}`
}

export function formatPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

export type Periodo = 'hoy' | 'semana' | 'mes' | 'fecha'

export function calcularRango(periodo: Periodo, fechaCustom: string): { desde: Date; hasta: Date } {
  const ahora = new Date()
  const hasta = new Date(ahora)
  hasta.setHours(23, 59, 59, 999)

  if (periodo === 'hoy') {
    const desde = new Date(ahora)
    desde.setHours(0, 0, 0, 0)
    return { desde, hasta }
  }
  if (periodo === 'semana') {
    const desde = new Date(ahora)
    desde.setDate(desde.getDate() - desde.getDay())
    desde.setHours(0, 0, 0, 0)
    return { desde, hasta }
  }
  if (periodo === 'mes') {
    const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    return { desde, hasta }
  }
  // fecha custom
  const [y, m, d] = fechaCustom.split('-').map(Number)
  const desde = new Date(y, m - 1, d, 0, 0, 0, 0)
  const hastaCustom = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { desde, hasta: hastaCustom }
}
