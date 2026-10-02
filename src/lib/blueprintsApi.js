const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const BP_URL = `${API_BASE}/api/v1/blueprints`

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status // 0 = no hubo respuesta (backend caído)
  }
}

const enc = encodeURIComponent

function withBody(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// Quita el sobre ApiResponse { code, message, data } y devuelve solo data.
async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BP_URL}${path}`, options)
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'No se pudo conectar con el servidor')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, body?.message ?? `Error ${response.status}`)
  }
  return body?.data ?? null
}

export async function list(author, { signal } = {}) {
  try {
    return (await request(`/${enc(author)}`, { signal })) ?? []
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [] // backend viejo: 404 = sin planos
    throw err
  }
}

export function create(author, name) {
  return request('', withBody('POST', { author, name, points: [] }))
}

export function save(author, name, points) {
  return request(`/${enc(author)}/${enc(name)}`, withBody('PUT', { points }))
}

export function remove(author, name) {
  return request(`/${enc(author)}/${enc(name)}`, { method: 'DELETE' })
}