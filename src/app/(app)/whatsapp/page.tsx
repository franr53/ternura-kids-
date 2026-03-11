'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { MessageCircle, Search, Send, CheckSquare, Square, Eye, AlertCircle } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

const LOTE_MAX = 10
const MSG_DEUDORES = 'Hola {nombre}! Te recordamos que tenés una deuda de {deuda} en Ternura Kids. Podés pasar a abonar cuando quieras. Gracias!'
const MSG_CAMPAÑA = 'Hola {nombre}! Tenemos novedades en Ternura Kids. Te esperamos!'

function tieneTelefonoValido(cliente: Cliente): boolean {
  if (!cliente.telefono) return false
  const digits = cliente.telefono.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

function reemplazarVariables(template: string, cliente: Cliente): string {
  const hoy = new Date().toLocaleDateString('es-AR')
  return template
    .replace(/{nombre}/g, cliente.nombre)
    .replace(/{deuda}/g, formatPrecio(cliente.deuda_total || 0))
    .replace(/{fecha}/g, hoy)
}

function abrirWhatsApp(cliente: Cliente, mensaje: string) {
  const tel = cliente.telefono!.replace(/\D/g, '')
  const msg = reemplazarVariables(mensaje, cliente)
  window.open(`https://wa.me/54${tel}?text=${encodeURIComponent(msg)}`, '_blank')
}

function enviarLote(clientes: Cliente[], mensaje: string, lote: number) {
  const inicio = lote * LOTE_MAX
  const fin = inicio + LOTE_MAX
  const slice = clientes.slice(inicio, fin)
  slice.forEach((c, i) => {
    setTimeout(() => abrirWhatsApp(c, mensaje), i * 600)
  })
  toast.success(`Abriendo WhatsApp para ${slice.length} clientes...`)
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
  const [loteActual, setLoteActual] = useState(0)

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
    const conTel = deudores.filter(tieneTelefonoValido)
    if (selectedDeudores.size === conTel.length) {
      setSelectedDeudores(new Set())
    } else {
      setSelectedDeudores(new Set(conTel.map(d => d.id)))
    }
  }

  function enviarASeleccionadosDeudores() {
    const seleccionados = deudores.filter(d => selectedDeudores.has(d.id) && tieneTelefonoValido(d))
    if (seleccionados.length === 0) { toast.error('Seleccioná al menos un cliente con teléfono válido'); return }
    enviarLote(seleccionados, msgDeudores, 0)
  }

  const clientesFiltrados = clientes.filter(c =>
    busqueda === '' || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const seleccionadosCampaña = clientesFiltrados.filter(c => selectedClientes.has(c.id) && tieneTelefonoValido(c))
  const totalLotes = Math.ceil(seleccionadosCampaña.length / LOTE_MAX)
  const clientePreview = seleccionadosCampaña[0] || clientesFiltrados[0]

  function enviarLoteActual() {
    if (seleccionadosCampaña.length === 0) { toast.error('Seleccioná al menos un cliente con teléfono'); return }
    enviarLote(seleccionadosCampaña, msgCampaña, loteActual)
    if (loteActual < totalLotes - 1) setLoteActual(prev => prev + 1)
  }

  function probarMensaje() {
    const primero = seleccionadosCampaña[0] || clientesFiltrados.find(tieneTelefonoValido)
    if (!primero) { toast.error('No hay clientes con teléfono para probar'); return }
    abrirWhatsApp(primero, msgCampaña)
  }

  const conTelDeudores = deudores.filter(tieneTelefonoValido).length
  const sinTelDeudores = deudores.length - conTelDeudores

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
                <div>
                  <CardTitle className="text-base">Clientes con deuda ({deudores.length})</CardTitle>
                  {sinTelDeudores > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle size={12} /> {sinTelDeudores} sin teléfono válido
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={toggleTodosDeudores}>
                    {selectedDeudores.size === conTelDeudores ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </Button>
                  <Button
                    onClick={enviarASeleccionadosDeudores}
                    disabled={selectedDeudores.size === 0}
                    className="bg-green-500 hover:bg-green-600 gap-2 text-sm"
                    size="sm"
                  >
                    <Send size={14} /> Enviar a {selectedDeudores.size}
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
                  {deudores.map(cliente => {
                    const valido = tieneTelefonoValido(cliente)
                    return (
                      <div
                        key={cliente.id}
                        onClick={() => valido && toggleDeudor(cliente.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          !valido ? 'opacity-50 cursor-not-allowed border-gray-100' :
                          selectedDeudores.has(cliente.id) ? 'border-green-300 bg-green-50 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <div className="text-green-600">
                          {valido && selectedDeudores.has(cliente.id) ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{cliente.nombre}</p>
                          <p className="text-xs text-gray-500">{cliente.telefono || 'Sin teléfono'}</p>
                        </div>
                        <Badge variant="destructive">{formatPrecio(cliente.deuda_total)}</Badge>
                        {valido && (
                          <button
                            onClick={e => { e.stopPropagation(); abrirWhatsApp(cliente, msgDeudores) }}
                            className="p-1.5 rounded-full bg-green-100 hover:bg-green-200 text-green-600"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
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
                maxLength={4096}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Variables: <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> <code className="bg-gray-100 px-1 rounded">{'{deuda}'}</code> <code className="bg-gray-100 px-1 rounded">{'{fecha}'}</code></p>
                <p className={`text-xs ${msgDeudores.length > 3800 ? 'text-red-500' : 'text-gray-400'}`}>{msgDeudores.length}/4096</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Campaña */}
        <TabsContent value="campaña" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Lista de clientes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Clientes
                  {selectedClientes.size > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      {seleccionadosCampaña.length} con teléfono válido seleccionados
                    </span>
                  )}
                </CardTitle>
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
                  {clientesFiltrados.map(c => {
                    const valido = tieneTelefonoValido(c)
                    return (
                      <div
                        key={c.id}
                        onClick={() => valido && toggleCliente(c.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors text-sm ${
                          !valido ? 'opacity-40 cursor-not-allowed border-gray-100' :
                          selectedClientes.has(c.id) ? 'border-green-300 bg-green-50 cursor-pointer' : 'border-gray-100 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <div className="text-green-600">
                          {valido && selectedClientes.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{c.nombre}</p>
                          <p className="text-xs text-gray-400">{c.telefono || 'Sin teléfono'}</p>
                        </div>
                        {c.deuda_total > 0 && <Badge variant="destructive" className="text-xs">{formatPrecio(c.deuda_total)}</Badge>}
                      </div>
                    )
                  })}
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
                    maxLength={4096}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">Variables: <code className="bg-gray-100 px-1 rounded">{'{nombre}'}</code> <code className="bg-gray-100 px-1 rounded">{'{deuda}'}</code> <code className="bg-gray-100 px-1 rounded">{'{fecha}'}</code></p>
                    <p className={`text-xs ${msgCampaña.length > 3800 ? 'text-red-500' : 'text-gray-400'}`}>{msgCampaña.length}/4096</p>
                  </div>
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

              <div className="space-y-2">
                {seleccionadosCampaña.length > LOTE_MAX && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700 flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{seleccionadosCampaña.length} clientes seleccionados — se envía de a {LOTE_MAX}</p>
                      <p className="text-xs mt-0.5">Lote {loteActual + 1} de {totalLotes}. Hacé clic varias veces para enviar todos los lotes.</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={probarMensaje}
                    className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                  >
                    <Eye size={16} /> Probar
                  </Button>
                  <Button
                    onClick={enviarLoteActual}
                    disabled={seleccionadosCampaña.length === 0}
                    className="flex-1 bg-green-500 hover:bg-green-600 gap-2"
                  >
                    <Send size={16} />
                    {totalLotes > 1
                      ? `Enviar lote ${loteActual + 1}/${totalLotes} (${Math.min(LOTE_MAX, seleccionadosCampaña.length - loteActual * LOTE_MAX)} clientes)`
                      : `Abrir WhatsApp para ${seleccionadosCampaña.length} clientes`
                    }
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
