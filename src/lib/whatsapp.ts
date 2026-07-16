// Helpers de WhatsApp — centralizados para evitar el bug del prefijo "54" duplicado.
// Antes cada pantalla anteponía "54" a ciegas; si el número ya venía con 54 daba "5454...".

/** Normaliza un teléfono a dígitos con prefijo de país 54 (sin duplicarlo). */
export function waNumero(telefono: string): string {
  const digits = telefono.replace(/\D/g, '')
  return digits.startsWith('54') ? digits : `54${digits}`
}

/** Construye el link wa.me para abrir el chat, con texto opcional. */
export function waHref(telefono: string, texto?: string): string {
  const num = waNumero(telefono)
  return texto ? `https://wa.me/${num}?text=${encodeURIComponent(texto)}` : `https://wa.me/${num}`
}
