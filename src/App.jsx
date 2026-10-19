import { useCallback, useEffect, useState } from 'react'
import { Home, KeyRound, Users } from 'lucide-react'
import './App.css'
import { request } from './api'
import { ROLES, roleLabel } from './labels'
import People from './People'
import ProjectList from './ProjectList'
import ProjectPage from './ProjectPage'
import TaskPage from './TaskPage'
import { Avatar, Brand, Mark, StateArt } from './ui'

function Gate({ children }) {
  return (
    <main className="gate">
      <Mark className="gate-art" />
      <div className="gate-copy">
        <Brand />
        <p className="gate-kicker">Workspace</p>
        <h1>The work, in one place.</h1>
        <p className="lead">Projects, people, and the work between them.</p>
      </div>
      <div className="gate-panel">{children}</div>
    </main>
  )
}

function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const body = await request('/auth/login', { body: { email, password } })
      onSignedIn(body.user)
    } catch (err) {
      setError(err.message || 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Gate>
      <h2>Sign in</h2>
      <p className="sub">Use the email and password for your organization.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Gate>
  )
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [listStatus, setListStatus] = useState('loading')
  const [listError, setListError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')
  const [formError, setFormError] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadUsers() {
      setListStatus('loading')
      setListError('')
      try {
        const body = await request('/users', { signal: controller.signal })
        if (!active) {
          return
        }
        setUsers(Array.isArray(body?.users) ? body.users : [])
        setListStatus('ready')
      } catch (error) {
        if (!active || error?.name === 'AbortError') {
          return
        }
        setListStatus('error')
        setListError(error.message || 'Could not load users')
      }
    }

    loadUsers()
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey])

  async function handleCreate(event) {
    event.preventDefault()
    setFormError('')
    setFormMessage('')
    setCreating(true)
    try {
      await request('/users', { body: { name, email, password, role } })
      setName('')
      setEmail('')
      setPassword('')
      setRole('employee')
      setFormMessage('User created.')
      setReloadKey((value) => value + 1)
    } catch (error) {
      setFormError(error.message || 'Could not create the user')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="panel">
      <header className="page-head">
        <p className="page-kicker">Workspace</p>
        <h1>Accounts</h1>
        <p className="lead">Sign-in accounts for this organization. Profiles and leave live under People.</p>
      </header>
      <div className="account-layout">
        <form className="editor" onSubmit={handleCreate}>
          <div className="editor-head">
            <div>
              <p className="page-kicker">New account</p>
              <h2>Who can sign in</h2>
            </div>
          </div>
          <div className="editor-grid">
            <label className="field">
              Name
              <input
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Email
              <input
                type="email"
                name="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Role
              <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                {ROLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {formError ? (
              <p className="error" role="alert">
                {formError}
              </p>
            ) : null}
            {formMessage ? (
              <p className="message" role="status">
                {formMessage}
              </p>
            ) : null}
            <div className="editor-span">
              <button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </div>
        </form>

        <div className="roster">
          {listStatus === 'loading' ? (
            <p className="loading">
              <StateArt />
              Loading accounts…
            </p>
          ) : null}
          {listStatus === 'error' ? (
            <div className="state">
              <StateArt />
              <p>{listError}</p>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : null}
          {listStatus === 'ready' && users.length === 0 ? (
            <div className="state">
              <StateArt />
              <p>No one is in this organization yet.</p>
            </div>
          ) : null}
          {listStatus === 'ready' && users.length > 0 ? (
            <div className="account-list">
              {users.map((person) => (
                <div key={person.id} className="person-row">
                  <Avatar name={person.name} />
                  <span className="person-copy">
                    <span className="person-name">{person.name}</span>
                    <span className="person-meta">{person.email}</span>
                  </span>
                  <span className="chip">{roleLabel(person.role)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Workspace({ user, onSignOut, onUnauthorized }) {
  const [section, setSection] = useState('projects')
  const [peopleId, setPeopleId] = useState(null)
  const [view, setView] = useState({ name: 'projects' })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setSignOutError('')
    setSigningOut(true)
    try {
      await request('/auth/logout', { method: 'POST' })
      onSignOut()
    } catch (error) {
      setSignOutError(error.message || 'Could not sign out')
    } finally {
      setSigningOut(false)
    }
  }

  function showProjects() {
    setSection('projects')
    setView({ name: 'projects' })
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand">
          <Brand />
          <p className="rail-note">Workspace</p>
        </div>
        <nav className="nav" aria-label="Workspace">
          <button
            type="button"
            className="nav-item"
            aria-current={section === 'projects' ? 'page' : undefined}
            onClick={showProjects}
          >
            <Home className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Home</span>
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={section === 'people' ? 'page' : undefined}
            onClick={() => {
              setSection('people')
              setPeopleId(null)
            }}
          >
            <Users className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>People</span>
          </button>
          {user.role === 'admin' ? (
            <button
              type="button"
              className="nav-item"
              aria-current={section === 'users' ? 'page' : undefined}
              onClick={() => setSection('users')}
            >
              <KeyRound className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Accounts</span>
            </button>
          ) : null}
        </nav>
        <div className="rail-user">
          <Avatar name={user.name} />
          <span className="account-name">{user.name}</span>
          <span className="account-email">{user.email}</span>
          <span className="badge">{roleLabel(user.role)}</span>
          <button type="button" className="quiet" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <main className="content">
        {signOutError ? (
          <p className="error" role="alert">
            {signOutError}
          </p>
        ) : null}
        {section === 'people' ? (
          <People
            user={user}
            employeeId={peopleId}
            onOpen={setPeopleId}
            onBack={() => setPeopleId(null)}
            onUnauthorized={onUnauthorized}
          />
        ) : null}
        {section === 'users' && user.role === 'admin' ? <AdminUsers /> : null}
        {section === 'projects' && view.name === 'projects' ? (
          <ProjectList
            user={user}
            onOpen={(projectId) => setView({ name: 'project', projectId })}
            onOpenTask={(projectId, taskId) => setView({ name: 'task', projectId, taskId, from: 'home' })}
            onUnauthorized={onUnauthorized}
          />
        ) : null}
        {section === 'projects' && view.name === 'project' ? (
          <ProjectPage
            key={view.projectId}
            user={user}
            projectId={view.projectId}
            onBack={() => setView({ name: 'projects' })}
            onOpenTask={(taskId) => setView({ name: 'task', projectId: view.projectId, taskId })}
            onUnauthorized={onUnauthorized}
          />
        ) : null}
        {section === 'projects' && view.name === 'task' ? (
          <TaskPage
            key={view.taskId}
            taskId={view.taskId}
            backLabel={view.from === 'home' ? 'My work' : 'Back to project'}
            onBack={() =>
              view.from === 'home'
                ? setView({ name: 'projects' })
                : setView({ name: 'project', projectId: view.projectId })
            }
            onUnauthorized={onUnauthorized}
          />
        ) : null}
      </main>
    </div>
  )
}

function App() {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const [sessionError, setSessionError] = useState('')
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const handleUnauthorized = useCallback(() => {
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadSession() {
      setStatus('loading')
      setSessionError('')
      try {
        const body = await request('/auth/me', { signal: controller.signal })
        if (!active) {
          return
        }
        setUser(body.user)
        setStatus('ready')
      } catch (error) {
        if (!active || error?.name === 'AbortError') {
          return
        }
        setUser(null)
        if (error.status === 401) {
          setStatus('anonymous')
          return
        }
        setStatus('error')
        setSessionError(error.message || 'Could not check your session')
      }
    }

    loadSession()
    return () => {
      active = false
      controller.abort()
    }
  }, [sessionAttempt])

  if (status === 'loading') {
    return (
      <Gate>
        <p className="loading">
          <StateArt />
          Checking your session…
        </p>
      </Gate>
    )
  }

  if (status === 'error') {
    return (
      <Gate>
        <div className="state">
          <StateArt />
          <p className="error" role="alert">
            {sessionError}
          </p>
          <button type="button" onClick={() => setSessionAttempt((value) => value + 1)}>
            Try again
          </button>
        </div>
      </Gate>
    )
  }

  if (!user) {
    return (
      <SignIn
        onSignedIn={(nextUser) => {
          setUser(nextUser)
          setStatus('ready')
        }}
      />
    )
  }

  return (
    <Workspace
      user={user}
      onSignOut={() => {
        setUser(null)
        setStatus('anonymous')
      }}
      onUnauthorized={handleUnauthorized}
    />
  )
}

export default App
