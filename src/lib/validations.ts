/**
 * Helpers de validación reutilizables.
 * Cada función retorna un mensaje de error (string) o null si es válido.
 */

export function validarRequerido(valor: string, campo: string): string | null {
  if (!valor.trim()) return `${campo} es obligatorio`
  return null
}

export function validarMaxLength(valor: string, max: number, campo: string): string | null {
  if (valor.length > max) return `${campo} no puede tener más de ${max} caracteres`
  return null
}

export function validarTelefono(tel: string): string | null {
  if (!tel) return null // opcional
  const limpio = tel.replace(/[\s\-()]/g, '')
  if (!/^\d{7,15}$/.test(limpio)) return 'Teléfono inválido (solo números, 7-15 dígitos)'
  return null
}

export function validarEmail(email: string): string | null {
  if (!email) return null // opcional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email inválido'
  return null
}

export function validarMonto(monto: string, opts?: { min?: number; max?: number; campo?: string }): string | null {
  const campo = opts?.campo || 'Monto'
  const num = parseFloat(monto)
  if (isNaN(num)) return `${campo} debe ser un número`
  if (opts?.min !== undefined && num < opts.min) return `${campo} debe ser al menos ${opts.min}`
  if (opts?.max !== undefined && num > opts.max) return `${campo} no puede superar ${opts.max.toLocaleString('es-AR')}`
  return null
}
