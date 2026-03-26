import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Llamado por Vercel Cron a las 00:00 ART (03:00 UTC)
// Cierra automáticamente todas las cajas abiertas del día anterior
export async function GET(request: Request) {
  // Verificar que la llamada viene de Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoy = new Date().toISOString().split('T')[0]

  const { data: cajasAbiertas, error: fetchError } = await supabase
    .from('cajas')
    .select('id, fecha')
    .eq('estado', 'abierta')
    .lt('fecha', hoy)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!cajasAbiertas || cajasAbiertas.length === 0) {
    return NextResponse.json({ cerradas: 0 })
  }

  const ids = cajasAbiertas.map(c => c.id)
  const { error: updateError } = await supabase
    .from('cajas')
    .update({
      estado: 'cerrada',
      cerrada_en: new Date().toISOString(),
      notas: 'Cierre automático a las 00:00',
    })
    .in('id', ids)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ cerradas: ids.length })
}
