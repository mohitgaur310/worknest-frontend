import { useCallback, useEffect, useState } from 'react'
import { request } from './api'
import { SPRINT_STATUSES, TASK_STATUSES, formatDay, labelFor } from './labels'
import { Avatar, Dialog } from './ui'

function dateSpan(sprint) {
  const start = formatDay(sprint.startDate)
  const end = formatDay(sprint.endDate)
  if (start && end) {
    return `${start} – ${end}`
  }
  if (start) {
    return `Starts ${start}`
  }
  if (end) {
    return `Ends ${end}`
  }
  return 'No dates yet'
}

function summaryText(summary) {
  const done = Number(summary?.done) || 0
  const returned = Number(summary?.returnedToBacklog) || 0
  const doneText = done === 1 ? '1 task finished' : `${done} tasks finished`
  const returnedText = returned === 1 ? '1 returned to the backlog' : `${returned} returned to the backlog`
  return `${doneText}. ${returnedText}.`
}

function taskCount(sprint) {
  const tasks = Array.isArray(sprint.tasks) ? sprint.tasks : []
  const total = sprint.counts?.total ?? tasks.length
  return total === 1 ? '1 task' : `${total} tasks`
}

export default function Sprints({
  projectId,
  canManage,
  archived,
  taskVersion,
  onOpenTask,
  onUnauthorized,
  onChanged,
  onBar,
  onCreateTask,
}) {
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [sprints, setSprints] = useState([])
  const [boardTasks, setBoardTasks] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [focusId, setFocusId] = useState('')

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [createError, setCreateError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editGoal, setEditGoal] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [addFor, setAddFor] = useState(null)
  const [addTaskId, setAddTaskId] = useState('')
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load() {
      setLoadError('')
      setStatus((current) => (current === 'ready' ? current : 'loading'))
      try {
        const [sprintBody, taskBody] = await Promise.all([
          request(`/projects/${projectId}/sprints`, { signal: controller.signal }),
          request(`/projects/${projectId}/tasks`, { signal: controller.signal }),
        ])
        if (!active) {
          return
        }
        setSprints(Array.isArray(sprintBody?.sprints) ? sprintBody.sprints : [])
        setBoardTasks(Array.isArray(taskBody?.tasks) ? taskBody.tasks : [])
        setStatus('ready')
      } catch (error) {
        if (!active || error?.name === 'AbortError') {
          return
        }
        if (error.status === 401) {
          onUnauthorized()
          return
        }
        setStatus(error.status === 403 ? 'denied' : 'error')
        setLoadError(error.message || 'Could not load sprints')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId, reloadKey, taskVersion, onUnauthorized])

  function refresh() {
    setReloadKey((value) => value + 1)
  }

  function fail(error, fallback) {
    if (error?.status === 401) {
      onUnauthorized()
      return
    }
    setActionError(error?.message || fallback)
  }

  const manageable = canManage && !archived
  const activeSprint = sprints.find((sprint) => sprint.status === 'active') || null
  const planned = sprints.filter((sprint) => sprint.status === 'planned')
  const completed = sprints.filter((sprint) => sprint.status === 'completed')
  const pageSprint = activeSprint || planned.find((sprint) => sprint.id === focusId) || planned[0] || null
  const otherPlanned = planned.filter((sprint) => !pageSprint || sprint.id !== pageSprint.id)
  const startTarget = activeSprint ? null : pageSprint && pageSprint.status === 'planned' ? pageSprint : null
  const backlog = boardTasks.filter((task) => !task.sprintId).sort((left, right) => left.title.localeCompare(right.title))

  const handleStart = useCallback(
    async (sprintId) => {
      setActionError('')
      setSummary('')
      setBusy(`start:${sprintId}`)
      try {
        await request(`/sprints/${sprintId}/start`, { method: 'POST' })
        onChanged()
        setReloadKey((value) => value + 1)
      } catch (error) {
        if (error?.status === 401) {
          onUnauthorized()
          return
        }
        setActionError(error?.message || 'Could not start this sprint')
      } finally {
        setBusy('')
      }
    },
    [onChanged, onUnauthorized],
  )

  useEffect(() => {
    const sprintId = startTarget?.id || ''
    onBar?.({
      canCreate: manageable && status === 'ready',
      openCreate: () => {
        setCreateError('')
        setCreating(true)
      },
      canStart: Boolean(sprintId),
      startId: sprintId,
      start: () => {
        if (sprintId) {
          handleStart(sprintId)
        }
      },
      startLabel: startTarget ? `Start ${startTarget.name}` : 'Start sprint',
      starting: Boolean(sprintId) && busy === `start:${sprintId}`,
    })
  }, [onBar, manageable, status, startTarget, busy, handleStart])

  useEffect(() => {
    return () => {
      onBar?.({
        canCreate: false,
        openCreate() {},
        canStart: false,
        startId: '',
        start() {},
        startLabel: 'Start sprint',
        starting: false,
      })
    }
  }, [onBar])

  async function handleCreate(event) {
    event.preventDefault()
    setCreateError('')
    setSubmitting(true)
    try {
      await request(`/projects/${projectId}/sprints`, {
        body: {
          name,
          goal,
          startDate: startDate || null,
          endDate: endDate || null,
        },
      })
      setName('')
      setGoal('')
      setStartDate('')
      setEndDate('')
      setCreating(false)
      refresh()
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setCreateError(error.message || 'Could not create the sprint')
    } finally {
      setSubmitting(false)
    }
  }

  function beginEdit(sprint) {
    setEditing(sprint)
    setEditName(sprint.name || '')
    setEditGoal(sprint.goal || '')
    setEditStart(sprint.startDate || '')
    setEditEnd(sprint.endDate || '')
    setActionError('')
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!editing) {
      return
    }
    setActionError('')
    setBusy(`save:${editing.id}`)
    try {
      await request(`/sprints/${editing.id}`, {
        method: 'PATCH',
        body: {
          name: editName,
          goal: editGoal,
          startDate: editStart || null,
          endDate: editEnd || null,
        },
      })
      setEditing(null)
      refresh()
    } catch (error) {
      fail(error, 'Could not update this sprint')
    } finally {
      setBusy('')
    }
  }

  async function handleComplete(sprintId) {
    setActionError('')
    setBusy(`complete:${sprintId}`)
    try {
      const body = await request(`/sprints/${sprintId}/complete`, { method: 'POST' })
      setSummary(summaryText(body?.summary))
      onChanged()
      refresh()
    } catch (error) {
      fail(error, 'Could not complete this sprint')
    } finally {
      setBusy('')
    }
  }

  async function addTask(sprintId, taskId) {
    if (!taskId) {
      return
    }
    setActionError('')
    setBusy(`add:${sprintId}`)
    try {
      await request(`/sprints/${sprintId}/tasks`, { body: { taskId } })
      setAddFor(null)
      setAddTaskId('')
      onChanged()
      refresh()
    } catch (error) {
      fail(error, 'Could not add this task')
    } finally {
      setBusy('')
    }
  }

  async function handleRemove(sprintId, taskId) {
    setActionError('')
    setBusy(`remove:${taskId}`)
    try {
      await request(`/sprints/${sprintId}/tasks/${taskId}`, { method: 'DELETE' })
      onChanged()
      refresh()
    } catch (error) {
      fail(error, 'Could not remove this task')
    } finally {
      setBusy('')
    }
  }

  function choicesFor(sprint) {
    const taken = new Set((sprint.tasks || []).map((task) => task.id))
    const finished = []
    for (const item of completed) {
      for (const task of item.tasks || []) {
        if (!taken.has(task.id)) {
          finished.push(task)
        }
      }
    }
    const loose = backlog.filter((task) => !taken.has(task.id))
    return { loose, finished }
  }

  function renderTask(task, sprint, open) {
    return (
      <li key={task.id} className="sprint-task">
        <button type="button" className="text-button" onClick={() => onOpenTask(task.id)}>
          <span className="row-title">{task.title}</span>
        </button>
        <span className={`badge status-${task.status}`}>{labelFor(TASK_STATUSES, task.status)}</span>
        {task.assignee?.name ? <Avatar name={task.assignee.name} small /> : <span className="muted">Unassigned</span>}
        {manageable && open ? (
          <button
            type="button"
            className="quiet"
            onClick={() => handleRemove(sprint.id, task.id)}
            disabled={busy === `remove:${task.id}`}
          >
            {busy === `remove:${task.id}` ? 'Removing…' : 'Remove'}
          </button>
        ) : null}
      </li>
    )
  }

  if (status === 'loading') {
    return <p className="muted">Loading sprints…</p>
  }
  if (status === 'denied') {
    return (
      <p className="error" role="alert">
        {loadError || 'You do not have permission to view sprints.'}
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="state">
        <p className="error" role="alert">
          {loadError}
        </p>
        <button type="button" onClick={refresh}>
          Try again
        </button>
      </div>
    )
  }

  const pageTasks = Array.isArray(pageSprint?.tasks) ? pageSprint.tasks : []
  const total = pageSprint?.counts?.total ?? pageTasks.length
  const done = pageSprint?.counts?.done ?? pageTasks.filter((task) => task.status === 'done').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const pageOpen = pageSprint && (pageSprint.status === 'planned' || pageSprint.status === 'active')

  return (
    <div className="sprint-screen">
      {summary ? (
        <p className="message" role="status">
          {summary}
        </p>
      ) : null}
      {actionError ? (
        <p className="error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="sprint-columns">
        <section className="sprint-main" aria-label={pageSprint ? pageSprint.name : 'Active sprint'}>
          {!pageSprint ? (
            <div className="empty-block">
              <p>No sprint is active.</p>
              {manageable ? (
                <button type="button" onClick={() => setCreating(true)}>
                  Create sprint
                </button>
              ) : (
                <p className="muted">A manager can create the next sprint.</p>
              )}
            </div>
          ) : (
            <>
              <header className="sprint-title-row">
                <div>
                  <p className="page-kicker">{labelFor(SPRINT_STATUSES, pageSprint.status)}</p>
                  <h2>{pageSprint.name}</h2>
                  <p className={pageSprint.goal ? 'lead' : 'muted'}>{pageSprint.goal || 'No goal yet.'}</p>
                  <p className="muted">{dateSpan(pageSprint)}</p>
                </div>
                <div className="row-actions">
                  {manageable ? (
                    <button type="button" className="quiet" onClick={() => beginEdit(pageSprint)}>
                      Edit
                    </button>
                  ) : null}
                  {manageable && pageSprint.status === 'active' ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleComplete(pageSprint.id)}
                      disabled={busy === `complete:${pageSprint.id}`}
                    >
                      {busy === `complete:${pageSprint.id}` ? 'Completing…' : 'Complete sprint'}
                    </button>
                  ) : null}
                </div>
              </header>
              {pageSprint.status === 'active' ? (
                <div className="meter-block">
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <p className="muted">
                    {done} of {total} done
                  </p>
                </div>
              ) : (
                <p className="muted">These tasks join the board when the sprint starts.</p>
              )}
              {pageTasks.length === 0 ? (
                <div className="empty-block">
                  <p>This sprint has no tasks.</p>
                  {manageable && backlog.length > 0 ? (
                    <button type="button" onClick={() => setAddFor(pageSprint)}>
                      Add from the backlog
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="sprint-tasks">
                  {pageTasks.map((task) => renderTask(task, pageSprint, pageOpen))}
                </ul>
              )}
            </>
          )}

          {otherPlanned.length > 0 ? (
            <section className="history" aria-label="Planned sprints">
              <h3>Also planned</h3>
              {otherPlanned.map((sprint) => (
                <div key={sprint.id} className="history-row">
                  <div>
                    <strong>{sprint.name}</strong>
                    <span className="muted">
                      {dateSpan(sprint)} · {taskCount(sprint)}
                    </span>
                  </div>
                  <div className="row-actions">
                    {!activeSprint ? (
                      <button type="button" className="quiet" onClick={() => setFocusId(sprint.id)}>
                        Show
                      </button>
                    ) : null}
                    {manageable ? (
                      <button type="button" className="quiet" onClick={() => beginEdit(sprint)}>
                        Edit
                      </button>
                    ) : null}
                    {manageable ? (
                      <button type="button" className="quiet" onClick={() => setAddFor(sprint)}>
                        Add task
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </section>

        <section className="backlog" aria-label="Backlog">
          <header className="queue-head">
            <h2>Backlog</h2>
            <span className="count">{backlog.length}</span>
          </header>
          {backlog.length === 0 ? (
            <div className="empty-block">
              <p>The backlog is empty.</p>
              {!archived ? (
                <button type="button" onClick={onCreateTask}>
                  New task
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="sprint-tasks">
              {backlog.map((task) => (
                <li key={task.id} className="sprint-task">
                  <button type="button" className="text-button" onClick={() => onOpenTask(task.id)}>
                    <span className="row-title">{task.title}</span>
                  </button>
                  <span className={`badge status-${task.status}`}>{labelFor(TASK_STATUSES, task.status)}</span>
                  {manageable && pageOpen ? (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => addTask(pageSprint.id, task.id)}
                      disabled={busy === `add:${pageSprint.id}`}
                    >
                      Add
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="history" aria-label="Completed sprints">
        <h2>Completed</h2>
        {completed.length === 0 ? <p className="empty-line">No completed sprints.</p> : null}
        {completed.map((sprint) => {
          const tasks = Array.isArray(sprint.tasks) ? sprint.tasks : []
          const finished = sprint.counts?.done ?? tasks.filter((task) => task.status === 'done').length
          return (
            <article key={sprint.id} className="history-block">
              <p>
                <strong>{sprint.name}</strong>
                <span className="muted">
                  {' '}
                  · {dateSpan(sprint)} · {finished === 1 ? '1 done' : `${finished} done`}
                </span>
              </p>
              {tasks.length > 0 ? (
                <ul className="history-tasks">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <button type="button" className="text-button" onClick={() => onOpenTask(task.id)}>
                        {task.title}
                      </button>
                      {manageable && pageOpen ? (
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => addTask(pageSprint.id, task.id)}
                          disabled={busy === `add:${pageSprint.id}`}
                        >
                          Add to {pageSprint.name}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          )
        })}
      </section>

      {creating ? (
        <Dialog
          title="Create sprint"
          onClose={() => {
            setCreating(false)
            setCreateError('')
          }}
        >
          <form className="form" onSubmit={handleCreate}>
            <label className="field">
              Name
              <input name="sprint-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="field">
              Goal
              <textarea name="sprint-goal" maxLength={4000} value={goal} onChange={(event) => setGoal(event.target.value)} />
            </label>
            <div className="pair">
              <label className="field">
                Start
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="field">
                End
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <p className="muted">Both dates are required before the sprint can start.</p>
            {createError ? (
              <p className="error" role="alert">
                {createError}
              </p>
            ) : null}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create sprint'}
            </button>
          </form>
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog title="Edit sprint" onClose={() => setEditing(null)}>
          <form className="form" onSubmit={handleSave}>
            <label className="field">
              Name
              <input value={editName} maxLength={120} onChange={(event) => setEditName(event.target.value)} required />
            </label>
            <label className="field">
              Goal
              <textarea value={editGoal} maxLength={4000} onChange={(event) => setEditGoal(event.target.value)} />
            </label>
            <div className="pair">
              <label className="field">
                Start
                <input type="date" value={editStart} onChange={(event) => setEditStart(event.target.value)} />
              </label>
              <label className="field">
                End
                <input type="date" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} />
              </label>
            </div>
            {actionError ? (
              <p className="error" role="alert">
                {actionError}
              </p>
            ) : null}
            <button type="submit" disabled={busy === `save:${editing.id}`}>
              {busy === `save:${editing.id}` ? 'Saving…' : 'Save sprint'}
            </button>
          </form>
        </Dialog>
      ) : null}

      {addFor ? (
        <Dialog title={`Add to ${addFor.name}`} onClose={() => setAddFor(null)}>
          <AddTaskForm
            sprint={addFor}
            choices={choicesFor(addFor)}
            taskId={addTaskId}
            onTaskId={setAddTaskId}
            busy={busy === `add:${addFor.id}`}
            error={actionError}
            onSubmit={(event) => {
              event.preventDefault()
              addTask(addFor.id, addTaskId)
            }}
          />
        </Dialog>
      ) : null}
    </div>
  )
}

function AddTaskForm({ sprint, choices, taskId, onTaskId, busy, error, onSubmit }) {
  const options = [
    ...choices.loose.map((task) => ({ id: task.id, label: task.title })),
    ...choices.finished.map((task) => ({ id: task.id, label: `${task.title} (finished sprint)` })),
  ]
  if (options.length === 0) {
    return <p>No backlog tasks to add to {sprint.name}.</p>
  }
  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        Task
        <select value={taskId} onChange={(event) => onTaskId(event.target.value)} required>
          <option value="">Select a task</option>
          {options.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add to sprint'}
      </button>
    </form>
  )
}
