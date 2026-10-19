function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  if (typeof window === 'undefined') {
    return configured
  }
  try {
    const url = new URL(configured, window.location.origin)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const pageLoopback = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (loopback && pageLoopback) {
      url.hostname = window.location.hostname
      return url.origin
    }
  } catch {
    return configured
  }
  return configured
}

const apiUrl = resolveApiUrl()

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request(path, { method, body, signal } = {}) {
  let response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: method || (body ? 'POST' : 'GET'),
      credentials: 'include',
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Could not reach the API', 0)
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status)
  }
  return payload
}

export async function uploadFile(path, file, { signal } = {}) {
  const body = new FormData()
  body.append('file', file)
  let response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      body,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Could not reach the API', 0)
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status)
  }
  return payload
}

export async function downloadFile(path, filename) {
  let response
  try {
    response = await fetch(`${apiUrl}${path}`, { credentials: 'include' })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Could not reach the API', 0)
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : null
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || 'payslip.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
