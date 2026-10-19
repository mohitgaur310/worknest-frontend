import { useEffect, useState } from 'react'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function loadHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`)
        }
        const body = await response.json()
        setHealth(body)
        setError('')
      } catch (err) {
        if (err.name === 'AbortError') {
          return
        }
        setHealth(null)
        setError(err.message || 'Could not reach the API')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadHealth()

    return () => controller.abort()
  }, [])

  return (
    <main className="page">
      <h1>Worknest</h1>
      <p className="lead">Backend health from {apiUrl}/health</p>
      {loading ? <p>Checking API…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {health ? (
        <pre className="health">{JSON.stringify(health, null, 2)}</pre>
      ) : null}
    </main>
  )
}

export default App
