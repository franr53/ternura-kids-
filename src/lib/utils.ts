import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNombreConTalle(nombre: string, talle: string): string {
  if (!talle || talle === 'Único' || talle === 'Unico') return nombre
  const n = nombre.trim()
  const t = talle.trim()
  // No duplicar si el nombre ya termina con "T{talle}" (productos legacy no migrados)
  if (n.toUpperCase().endsWith(`T${t.toUpperCase()}`)) return n
  // No duplicar si el nombre ya termina con el talle literal (talles letra: XL, S, M)
  if (n.toUpperCase().endsWith(` ${t.toUpperCase()}`)) return n
  return `${n} T${t}`
}

export function formatPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

// 'mes' = el mes en curso. 'mesDe' = un mes cualquiera (fechaCustom viene como
// 'YYYY-MM'). 'fecha' = un día puntual ('YYYY-MM-DD').
export type Periodo = 'hoy' | 'semana' | 'mes' | 'mesDe' | 'fecha'

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
  if (periodo === 'mesDe') {
    // fechaCustom = 'YYYY-MM' → del 1 al último día de ese mes
    const [ya, ma] = fechaCustom.split('-').map(Number)
    const desde = new Date(ya, ma - 1, 1, 0, 0, 0, 0)
    const hastaMes = new Date(ya, ma, 0, 23, 59, 59, 999)
    return { desde, hasta: hastaMes }
  }
  // fecha custom
  const [y, m, d] = fechaCustom.split('-').map(Number)
  const desde = new Date(y, m - 1, d, 0, 0, 0, 0)
  const hastaCustom = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { desde, hasta: hastaCustom }
}
