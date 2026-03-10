'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NuevoClientePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')

  async function guardar() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setLoading(true)
    const { error } = await supabase.from('clientes').insert({ nombre: nombre.trim(), telefono: telefono || null, direccion: direccion || null })
    if (error) { toast.error('Error al guardar'); setLoading(false); return }
    toast.success('Cliente creado')
    router.push('/clientes')
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clientes"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
        <h1 className="text-2xl font-bold text-gray-800">Nuevo cliente</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del cliente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Teléfono (WhatsApp)</Label>
            <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej: 3516123456" className="mt-1" />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección" className="mt-1" />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3 justify-end">
        <Link href="/clientes"><Button variant="outline">Cancelar</Button></Link>
        <Button onClick={guardar} disabled={loading} className="bg-pink-500 hover:bg-pink-600">
          {loading ? 'Guardando...' : 'Guardar cliente'}
        </Button>
      </div>
    </div>
  )
}
