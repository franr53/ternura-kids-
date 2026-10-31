// PostgREST corta cada respuesta en max_rows (1000 por defecto en Supabase): una
// lista más larga llega incompleta y sin error. Para las listas que pueden pasar
// ese número (productos activos), pedir por tramos hasta tener todas las filas.
//
// La consulta tiene que traer { count: 'exact' } y un orden único (terminar en
// .order('id')) para que los tramos no se pisen ni se salteen filas.

type Resultado<T> = { data: T[] | null; error: { message: string } | null; count?: number | null }

export async function traerTodo<T>(
  tramo: (desde: number, hasta: number) => PromiseLike<Resultado<T>>,
  tamano = 1000,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const filas: T[] = []
  while (true) {
    const { data, error, count } = await tramo(filas.length, filas.length + tamano - 1)
    if (error) return { data: null, error }
    const lote = data ?? []
    filas.push(...lote)
    // Con count se sigue aunque el servidor devuelva menos que el tramo pedido
    // (max_rows menor a `tamano`); sin count, un tramo incompleto es el último.
    const termino = count != null ? filas.length >= count : lote.length < tamano
    if (lote.length === 0 || termino) return { data: filas, error: null }
  }
}
