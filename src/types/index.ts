export type Rol = 'admin' | 'vendedor'
export type SistemaTalles = 'numerico' | 'letras' | 'meses' | 'calzado'
export type Temporada = 'verano' | 'invierno' | 'todo_el_año' | 'liquidacion'
export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'fiado'
export type EstadoVenta = 'completada' | 'anulada' | 'reserva'
export type EstadoCaja = 'abierta' | 'cerrada'

export interface Perfil {
  id: string
  nombre: string
  rol: Rol
  creado_en: string
}

export interface Categoria {
  id: string
  nombre: string
  sistema_talles: SistemaTalles
  color: string
  activa: boolean
  creado_en: string
}

export interface Proveedor {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  notas?: string
  deuda_total: number
  activo: boolean
  creado_en: string
}

export interface Producto {
  id: string
  nombre: string
  descripcion?: string
  categoria_id?: string
  proveedor_id?: string
  precio_costo: number
  precio_venta: number
  temporada?: Temporada
  activo: boolean
  creado_en: string
  actualizado_en: string
  categoria?: Categoria
  proveedor?: Proveedor
  variantes?: Variante[]
}

export interface Variante {
  id: string
  producto_id: string
  talle: string
  codigo_barras?: string
  stock: number
  stock_minimo: number
  precio_venta?: number | null
  precio_costo?: number | null
  creado_en: string
  producto?: Producto
}

export interface Cliente {
  id: string
  nombre: string
  telefono?: string
  direccion?: string
  deuda_total: number
  activo: boolean
  creado_en: string
}

export interface Caja {
  id: string
  fecha: string
  monto_inicial: number
  total_efectivo: number
  total_transferencia: number
  total_debito: number
  total_credito: number
  total_fiado: number
  total_retiros: number
  estado: EstadoCaja
  abierta_por?: string
  cerrada_por?: string
  abierta_en: string
  cerrada_en?: string
}

export interface Venta {
  id: string
  caja_id?: string
  cliente_id?: string
  descuento: number
  subtotal: number
  total: number
  estado: EstadoVenta
  notas?: string
  usuario_id?: string
  creado_en: string
  cliente?: Cliente
  items?: VentaItem[]
  pagos?: VentaPago[]
}

export interface VentaItem {
  id: string
  venta_id: string
  variante_id: string
  cantidad: number
  precio_unitario: number
  descuento_item: number
  subtotal: number
  variante?: Variante & { producto?: Producto }
}

export interface VentaPago {
  id: string
  venta_id: string
  metodo: MetodoPago
  monto: number
}

export interface FiadoMovimiento {
  id: string
  cliente_id: string
  venta_id?: string
  tipo: 'cargo' | 'abono'
  monto: number
  notas?: string
  usuario_id?: string
  creado_en: string
  cliente?: Cliente
}

export interface CategoriaGasto {
  id: string
  nombre: string
  color: string
  creado_en: string
}

export interface Gasto {
  id: string
  fecha: string
  concepto: string
  categoria_id?: string
  monto: number
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta'
  notas?: string
  usuario_id?: string
  creado_en: string
  categoria?: CategoriaGasto
}

export interface IngresoMercaderia {
  id: string
  proveedor_id: string
  numero_remito?: string
  total: number
  notas?: string
  usuario_id?: string
  creado_en: string
  proveedor?: Proveedor
  items?: IngresoItem[]
}

export interface IngresoItem {
  id: string
  ingreso_id: string
  variante_id: string
  cantidad: number
  precio_costo: number
  subtotal: number
  variante?: Variante & { producto?: Producto }
}
