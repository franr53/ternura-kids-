'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NuevoProveedorPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

  async function guardar() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setLoading(true)
    const { error } = await supabase.from('proveedores').insert({
      nombre: nombre.trim(),
      telefono: telefono || null,
      email: email || null,
      direccion: direccion || null,
      notas: notas || null,
      deuda_total: 0,
      activo: true,
    })
    if (error) { toast.error('Error al guardar'); setLoading(false); return }
    toast.success('Proveedor creado')
    router.push('/proveedores')
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/proveedores"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
        <h1 className="text-2xl font-bold text-gray-800">Nuevo proveedor</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del proveedor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del proveedor" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej: 3516123456" className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" className="mt-1" />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección" className="mt-1" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas adicionales..." className="mt-1" rows={3} />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-3 justify-end">
        <Link href="/proveedores"><Button variant="outline">Cancelar</Button></Link>
        <Button onClick={guardar} disabled={loading} className="bg-pink-500 hover:bg-pink-600">
          {loading ? 'Guardando...' : 'Guardar proveedor'}
        </Button>
      </div>
    </div>
  )
}
