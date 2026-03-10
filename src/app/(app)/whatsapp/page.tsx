'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { MessageCircle, Search, Send, CheckSquare, Square } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

const MSG_DEUDORES = 'Hola {nombre}! Te recordamos que tenés una deuda de {deuda} en Ternura Kids. Podés pasar a abonar cuando quieras. Gracias!'
const MSG_CAMPAÑA = 'Hola {nombre}! Tenemos novedades en Ternura Kids. Te esperamos!'

function reemplazarVariables(template: string, cliente: Cliente): string {
  return template
    .replace(/{nombre}/g, cliente.nombre)
    .replace(/{deuda}/g, formatPrecio(cliente.deuda_total || 0))
}

function abrirWhatsApp(cliente: Cliente, mensaje: string) {
  if (!cliente.telefono) { toast.error(`${cliente.nombre} no tiene teléfono`); return }
  const tel = cliente.telefono.replace(/\D/g, '')
  const msg = reemplazarVariables(mensaje, cliente)
  window.open(`https://wa.me/54${tel}?text=${encodeURIComponent(msg)}`, '_blank')
}

export default function WhatsAppPage() {
  const supabase = createClient()
  const [deudores, setDeudores] = useState<Cliente[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDeudores, setSelectedDeudores] = useState<Set<string>>(new Set())
  const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set())
  const [msgDeudores, setMsgDeudores] = useState(MSG_DEUDORES)
  const [msgCampaña, setMsgCampaña] = useState(MSG_CAMPAÑA)
  const [busqueda, setBusqueda] = useState('')

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const [{ data: ds }, { data: cs }] = await Promise.all([
      supabase.from('clientes').select('*').gt('deuda_total', 0).eq('activo', true).order('deuda_total', { ascending: false }),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
    ])
    setDeudores(ds || [])
    setClientes(cs || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  function toggleDeudor(id: string) {
    setSelectedDeudores(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleCliente(id: string) {
    setSelectedClientes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodosDeudores() {
    if (selectedDeudores.size === deudores.length) {
      setSelectedDeudores(new Set())
    } else {
      setSelectedDeudores(new Set(deudores.map(d => d.id)))
    }
  }

  function enviarASeleccionadosDeudores() {
    const seleccionados = deudores.filter(d => selectedDeudores.has(d.id))
    if (seleccionados.length === 0) { toast.error('Seleccioná al menos un cliente'); return }
    seleccionados.forEach((c, i) => {
      setTimeout(() => abrirWhatsApp(c, msgDeudores), i * 500)
    })
  }

  function enviarCampaña() {
    const seleccionados = clientesFiltrados.filter(c => selectedClientes.has(c.id))
    if (seleccionados.length === 0) { toast.error('Seleccioná al menos un cliente'); return }
    seleccionados.forEach((c, i) => {
      setTimeout(() => abrirWhatsApp(c, msgCampaña), i * 500)
    })
  }

  const clientesFiltrados = clientes.filter(c =>
    busqueda === '' || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const clientePreview = clientesFiltrados.find(c => selectedClientes.has(c.id)) || clientesFiltrados[0]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg"><MessageCircle size={24} className="text-green-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">WhatsApp</h1>
          <p className="text-gray-500 text-sm">Enviá mensajes a tus clientes</p>
        </div>
      </div>

      <Tabs defaultValue="deudores">
        <TabsList>
          <TabsTrigger value="deudores">Recordatorio de deuda</TabsTrigger>
          <TabsTrigger value="campaña">Campaña nueva</TabsTrigger>
        </TabsList>

        {/* Tab Deudores */}
        <TabsContent value="deudores" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Clientes con deuda ({deudores.length})</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={toggleTodosDeudores}>
                    {selectedDeudores.size === deudores.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </Button>
                  <Button
                    onClick={enviarASeleccionadosDeudores}
                    disabled={selectedDeudores.size === 0}
                    className="bg-green-500 hover:bg-green-600 gap-2 text-sm"
                    size="sm"
                  >
                    <Send size={14} /> Enviar a {selectedDeudores.size} seleccionados
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : deudores.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No hay clientes con deuda</div>
              ) : (
                <div className="space-y-2">
                  {deudores.map(cliente => (
                    <div
                      key={cliente.id}
                      onClick={() => toggleDeudor(cliente.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedDeudores.has(cliente.id) ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-green-600">
                        {selectedDeudores.has(cliente.id) ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{cliente.nombre}</p>
                        <p className="text-xs text-gray-500">{cliente.telefono || 'Sin teléfono'}</p>
                      </div>
                      <Badge variant="destructive">{formatPrecio(cliente.deuda_total)}</Badge>
                      {cliente.telefono && (
                        <button
                          onClick={e => { e.stopPropagation(); abrirWhatsApp(cliente, msgDeudores) }}
                          className="p-1.5 rounded-full bg-green-100 hover:bg-green-200 text-green-600"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Mensaje (editable)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={msgDeudores}
                onChange={e => setMsgDeudores(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400">Variables disponibles: <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> <code className="bg-gray-100 px-1 rounded">{'{deuda}'}</code></p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Campaña */}
        <TabsContent value="campaña" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Lista de clientes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes</CardTitle>
                <div className="relative mt-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {clientesFiltrados.map(c => (
                    <div
                      key={c.id}
                      onClick={() => toggleCliente(c.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                        selectedClientes.has(c.id) ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-green-600">
                        {selectedClientes.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{c.nombre}</p>
                        <p className="text-xs text-gray-400">{c.telefono || 'Sin teléfono'}</p>
                      </div>
                      {c.deuda_total > 0 && <Badge variant="destructive" className="text-xs">{formatPrecio(c.deuda_total)}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mensaje y preview */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Mensaje</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    value={msgCampaña}
                    onChange={e => setMsgCampaña(e.target.value)}
                    rows={5}
                    className="font-mono text-sm"
                    placeholder="Escribí tu mensaje..."
                  />
                  <p className="text-xs text-gray-400">Variables: <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> <code className="bg-gray-100 px-1 rounded">{'{deuda}'}</code></p>
                </CardContent>
              </Card>

              {clientePreview && (
                <Card className="border-green-200">
                  <CardHeader><CardTitle className="text-base text-green-700">Vista previa</CardTitle></CardHeader>
                  <CardContent>
                    <div className="bg-green-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {reemplazarVariables(msgCampaña, clientePreview)}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Para: {clientePreview.nombre}</p>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={enviarCampaña}
                disabled={selectedClientes.size === 0}
                className="w-full bg-green-500 hover:bg-green-600 gap-2"
              >
                <Send size={16} /> Abrir WhatsApp para {selectedClientes.size} seleccionados
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
