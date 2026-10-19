import { useCallback, useEffect, useState } from 'react'
import { request } from './api'
import { LEAVE_TYPES, PRIORITIES, TASK_STATUSES, formatDay, formatRange, isDueWithin, labelFor } from './labels'
import { Avatar, Dialog } from './ui'

const PROJECT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

function canCreateProject(role) {
  return role === 'admin' || role === 'manager'
}

function openLabel(detail) {
  if (!detail) {
    return 'Counting open tasks…'
  }
  if (detail.failed) {
    return 'Open tasks unavailable'
  }
  if (detail.openCount === 0) {
    return 'No open tasks'
  }
  if (detail.openCount === 1) {
    return '1 open task'
  }
  return `${detail.openCount} open tasks`
}

function Queue({ title, status, empty, count, children }) {
  return (
    <section className="queue" aria-label={title}>
      <header className="queue-head">
        <h2>{title}</h2>
        {status === 'ready' ? <span className="count">{count}</span> : null}
      </header>
      {status === 'loading' ? <p className="muted">Loading…</p> : null}
      {status === 'error' ? <p className="error">{empty}</p> : null}
      {status === 'ready' && count === 0 ? <p className="empty-line">{empty}</p> : null}
      {status === 'ready' && count > 0 ? <div className="queue-list">{children}</div> : null}
    </section>
  )
}

export default function ProjectList({ user, onOpen, onOpenTask, onUnauthorized }) {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [details, setDetails] = useState({})
  const [workTasks, setWorkTasks] = useState([])
  const [workStatus, setWorkStatus] = useState('loading')
  const [leave, setLeave] = useState([])
  const [leaveStatus, setLeaveStatus] = useState('loading')
  const [leaveError, setLeaveError] = useState('')
  const [deciding, setDeciding] = useState(null)
  const [note, setNote] = useState('')
  const [decideError, setDecideError] = useState('')
  const [decidingBusy, setDecidingBusy] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const closeCreate = useCallback(() => {
    setCreateOpen(false)
    setFormError('')
  }, [])

  const closeDecision = useCallback(() => {
    setDeciding(null)
    setNote('')
    setDecideError('')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load() {
      setStatus('loading')
      setError('')
      setLeaveStatus('loading')
      setLeaveError('')
      const [projectResult, leaveResult] = await Promise.allSettled([
        request('/projects', { signal: controller.signal }),
        request('/leave', { signal: controller.signal }),
      ])
      if (!active) {
        return
      }

      if (projectResult.status === 'fulfilled') {
        setProjects(Array.isArray(projectResult.value?.projects) ? projectResult.value.projects : [])
        setStatus('ready')
      } else {
        const err = projectResult.reason
        if (err?.name === 'AbortError') {
          return
        }
        if (err?.status === 401) {
          onUnauthorized()
          return
        }
        setStatus(err?.status === 403 ? 'denied' : 'error')
        setError(err?.message || 'Could not load projects')
      }

      if (leaveResult.status === 'fulfilled') {
        setLeave(Array.isArray(leaveResult.value?.leave) ? leaveResult.value.leave : [])
        setLeaveStatus('ready')
      } else {
        const err = leaveResult.reason
        if (err?.name === 'AbortError') {
          return
        }
        if (err?.status === 401) {
          onUnauthorized()
          return
        }
        setLeaveStatus('error')
        setLeaveError(err?.message || 'Could not load leave')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey, onUnauthorized])

  useEffect(() => {
    if (status !== 'ready') {
      return undefined
    }
    if (projects.length === 0) {
      return undefined
    }

    const controller = new AbortController()
    let active = true

    async function loadTasks() {
      setWorkStatus('loading')
      try {
        const entries = await Promise.all(
          projects.map(async (project) => {
            try {
              const taskBody = await request(`/projects/${project.id}/tasks`, { signal: controller.signal })
              const tasks = Array.isArray(taskBody?.tasks) ? taskBody.tasks : []
              return {
                project,
                tasks,
                openCount: tasks.filter((task) => task.status !== 'done').length,
                failed: false,
              }
            } catch (err) {
              if (err?.name === 'AbortError' || err.status === 401) {
                throw err
              }
              return { project, tasks: [], openCount: 0, failed: true }
            }
          }),
        )
        if (!active) {
          return
        }
        setDetails(
          Object.fromEntries(entries.map((entry) => [entry.project.id, { openCount: entry.openCount, failed: entry.failed }])),
        )
        setWorkTasks(
          entries.flatMap((entry) =>
            entry.tasks.map((task) => ({ ...task, projectName: entry.project.name })),
          ),
        )
        setWorkStatus('ready')
      } catch (err) {
        if (!active || err?.name === 'AbortError') {
          return
        }
        if (err.status === 401) {
          onUnauthorized()
          return
        }
        setWorkStatus('error')
      }
    }

    loadTasks()
    return () => {
      active = false
      controller.abort()
    }
  }, [status, projects, onUnauthorized])

  async function handleCreate(event) {
    event.preventDefault()
    setFormError('')
    setCreating(true)
    try {
      const body = await request('/projects', { body: { name, description } })
      setName('')
      setDescription('')
      setCreateOpen(false)
      onOpen(body.project.id)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setFormError(err.message || 'Could not create the project')
    } finally {
      setCreating(false)
    }
  }

  async function handleDecision(event) {
    event.preventDefault()
    if (!deciding) {
      return
    }
    setDecideError('')
    setDecidingBusy(true)
    try {
      const body = await request(`/leave/${deciding.item.id}/decision`, {
        body: { status: deciding.status, comment: note },
      })
      setLeave((current) => current.map((item) => (item.id === body.leave.id ? body.leave : item)))
      closeDecision()
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setDecideError(err.message || 'Could not record this decision')
    } finally {
      setDecidingBusy(false)
    }
  }

  const names = Object.fromEntries(projects.map((project) => [project.id, project.name]))
  const assigned = workTasks
    .filter((task) => task.assigneeId === user.id && task.status !== 'done')
    .sort((left, right) => left.title.localeCompare(right.title))
  const dueSoon = workTasks
    .filter((task) => task.status !== 'done' && isDueWithin(task.dueDate, 7))
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
  const waiting = leave.filter((item) => item.canDecide)
  const workReady = projects.length === 0 ? 'ready' : workStatus

  return (
    <section className="panel work">
      <header className="page-head">
        <p className="page-kicker">Home</p>
        <h1>My work</h1>
      </header>

      {status === 'loading' ? <p className="muted">Loading your work…</p> : null}
      {status === 'denied' ? (
        <p className="error" role="alert">
          {error || 'You do not have permission to view projects.'}
        </p>
      ) : null}
      {status === 'error' ? (
        <div className="state">
          <p className="error" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      {status === 'ready' || status === 'denied' ? (
        <div className="queues">
          <Queue
            title="Assigned to me"
            status={status === 'denied' ? 'error' : workReady}
            count={assigned.length}
            empty={workReady === 'error' ? 'Could not load your tasks.' : 'No open tasks are assigned to you.'}
          >
            {assigned.map((task) => (
              <button
                key={task.id}
                type="button"
                className="queue-item"
                onClick={() => onOpenTask(task.projectId, task.id)}
              >
                <span className="queue-title">{task.title}</span>
                <span className="queue-meta">
                  {task.projectName || names[task.projectId]}
                  {' · '}
                  {task.dueDate ? `Due ${formatDay(task.dueDate)}` : 'No date'}
                </span>
                <span className={`badge status-${task.status}`}>{labelFor(TASK_STATUSES, task.status)}</span>
              </button>
            ))}
          </Queue>

          <Queue
            title="Due in 7 days"
            status={status === 'denied' ? 'error' : workReady}
            count={dueSoon.length}
            empty={workReady === 'error' ? 'Could not load due dates.' : 'Nothing is due in the next 7 days.'}
          >
            {dueSoon.map((task) => (
              <button
                key={task.id}
                type="button"
                className="queue-item"
                onClick={() => onOpenTask(task.projectId, task.id)}
              >
                <span className="queue-title">{task.title}</span>
                <span className="queue-meta">
                  {task.projectName || names[task.projectId]}
                  {' · Due '}
                  {formatDay(task.dueDate)}
                </span>
                <span className="queue-tags">
                  <span className={`badge priority-${task.priority}`}>{labelFor(PRIORITIES, task.priority)}</span>
                  {task.assignee?.name ? <Avatar name={task.assignee.name} small /> : <span className="muted">Unassigned</span>}
                </span>
              </button>
            ))}
          </Queue>

          <Queue
            title="Leave waiting on me"
            status={leaveStatus}
            count={waiting.length}
            empty={leaveStatus === 'error' ? leaveError || 'Could not load leave.' : 'No leave is waiting on you.'}
          >
            {waiting.map((item) => (
              <div key={item.id} className="queue-item static">
                <span className="queue-title">
                  {item.employeeName} requested {labelFor(LEAVE_TYPES, item.type).toLowerCase()} leave
                </span>
                <span className="queue-meta">
                  {formatRange(item.startDate, item.endDate)}
                  {item.reason ? ` · ${item.reason}` : ''}
                </span>
                <span className="row-actions">
                  <button type="button" className="primary" onClick={() => setDeciding({ item, status: 'approved' })}>
                    Approve
                  </button>
                  <button type="button" className="reject" onClick={() => setDeciding({ item, status: 'rejected' })}>
                    Reject
                  </button>
                </span>
              </div>
            ))}
          </Queue>
        </div>
      ) : null}

      {status === 'ready' ? (
        <section className="project-region" aria-label="Projects">
          <header className="region-head">
            <h2>Projects</h2>
            {canCreateProject(user.role) ? (
              <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
                New project
              </button>
            ) : null}
          </header>
          {projects.length === 0 ? (
            <div className="empty-block">
              <p>{canCreateProject(user.role) ? 'No projects yet.' : 'No projects include you yet.'}</p>
              {canCreateProject(user.role) ? (
                <button type="button" onClick={() => setCreateOpen(true)}>
                  Create a project
                </button>
              ) : null}
            </div>
          ) : (
            <div className="project-rows">
              {projects.map((project) => (
                <button key={project.id} type="button" className="project-row" onClick={() => onOpen(project.id)}>
                  <span className="row-title">{project.name}</span>
                  <span className={project.status === 'archived' ? 'badge archived' : 'badge status-active'}>
                    {labelFor(PROJECT_STATUSES, project.status)}
                  </span>
                  <span className="muted">{openLabel(details[project.id])}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {createOpen ? (
        <Dialog title="New project" onClose={closeCreate}>
          <form className="form" onSubmit={handleCreate}>
            <label className="field">
              Name
              <input
                name="projectName"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Description
              <textarea
                name="projectDescription"
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {formError ? (
              <p className="error" role="alert">
                {formError}
              </p>
            ) : null}
            <button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </Dialog>
      ) : null}

      {deciding ? (
        <Dialog
          title={deciding.status === 'approved' ? 'Approve leave' : 'Reject leave'}
          onClose={closeDecision}
        >
          <form className="form" onSubmit={handleDecision}>
            <p>
              {deciding.item.employeeName} requested {labelFor(LEAVE_TYPES, deciding.item.type).toLowerCase()} leave,{' '}
              {formatRange(deciding.item.startDate, deciding.item.endDate)}.
            </p>
            {deciding.item.reason ? <p className="muted">{deciding.item.reason}</p> : null}
            <label className="field">
              Note, optional
              <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            {decideError ? (
              <p className="error" role="alert">
                {decideError}
              </p>
            ) : null}
            <button type="submit" className={deciding.status === 'rejected' ? 'reject' : ''} disabled={decidingBusy}>
              {decidingBusy ? 'Saving…' : deciding.status === 'approved' ? 'Approve' : 'Reject'}
            </button>
          </form>
        </Dialog>
      ) : null}
    </section>
  )
}
