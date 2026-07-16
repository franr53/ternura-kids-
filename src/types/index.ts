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

export interface Marca {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  notas?: string
  alias_cbu?: string
  deuda_total: number
  activo: boolean
  creado_en: string
}

// Alias temporal para no romper archivos que aún usan Proveedor
export type Proveedor = Marca

// Cuentas bancarias del local que reciben transferencias de cobro
export interface Banco {
  id: string
  nombre: string
  activo: boolean
  creado_en: string
}

export interface TipoPrenda {
  id: string
  nombre: string
  abreviatura: string
  activo: boolean
  creado_en: string
}

export interface Colegio {
  id: string
  nombre: string
  abreviatura: string
  activo: boolean
  creado_en: string
}

export interface HistorialPrecio {
  id: string
  producto_id: string
  precio_costo_anterior?: number
  precio_venta_anterior?: number
  precio_costo_nuevo?: number
  precio_venta_nuevo?: number
  usuario_id?: string
  creado_en: string
}

export interface Producto {
  id: string
  nombre_base: string
  descripcion?: string
  categoria_id?: string
  marca_id?: string
  colegio_id?: string
  temporada?: Temporada
  activo: boolean
  creado_en: string
  actualizado_en: string
  categoria?: Categoria
  marca?: Marca
  colegio?: Colegio
  variantes?: Variante[]
}

export interface Variante {
  id: string
  producto_id: string
  talle: string
  codigo_barras?: string
  stock: number
  stock_minimo: number
  precio_venta: number
  precio_costo: number
  creado_en: string
  producto?: Producto
}

export interface Cliente {
  id: string
  nombre: string
  telefono?: string
  direccion?: string
  deuda_total: number
  saldo_favor: number
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
  total_cobros: number
  total_cobros_efectivo: number
  total_cobros_transferencia: number
  total_cobros_debito: number
  total_retiros: number
  estado: EstadoCaja
  abierta_por?: string
  cerrada_por?: string
  abierta_en: string
  cerrada_en?: string
  notas_cierre?: string
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
  notas?: string
}

export interface FiadoMovimiento {
  id: string
  cliente_id: string
  venta_id?: string
  tipo: 'cargo' | 'abono'
  monto: number
  notas?: string
  metodo_pago?: string
  banco_id?: string
  usuario_id?: string
  creado_en: string
  cliente?: Cliente
}

export interface CategoriaGasto {
  id: string
  nombre: string
  color: string
  padre_id?: string | null
  creado_en: string
}

export interface Gasto {
  id: string
  fecha: string
  concepto: string
  categoria_id?: string
  monto: number
  metodo_pago: 'efectivo' | 'transferencia' | 'debito' | 'credito'
  fuente_pago?: 'caja_hoy' | 'retiro_anterior'
  proveedor_id?: string
  notas?: string
  usuario_id?: string
  creado_en: string
  categoria?: CategoriaGasto
  proveedor?: Marca
}

export interface PagoProveedor {
  id: string
  proveedor_id: string
  monto: number
  metodo: 'efectivo' | 'transferencia' | 'cheque' | 'otro'
  notas?: string
  gasto_id?: string
  usuario_id?: string
  creado_en: string
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

export type ItemDevolucion = {
  variante_id: string
  cantidad: number
  precio_unitario: number
}

export interface Cambio {
  id: string
  venta_original_id: string
  cliente_id?: string
  items_devueltos: ItemDevolucion[]
  items_nuevos: ItemDevolucion[]
  total_devuelto: number
  total_nuevo: number
  diferencia: number
  resolucion_diferencia?: string
  creado_en: string
}

export type ResultadoCambio = {
  cambio_id: string
  total_devuelto: number
  total_nuevo: number
  diferencia: number
}

export type ResultadoDevolucion = {
  saldo_generado: number
  deuda_revertida: number
  items_procesados: number
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
