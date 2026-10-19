import { useEffect, useState } from 'react'
import { request } from './api'
import { PRIORITIES, TASK_STATUSES, activityLine, formatDay, formatWhen, labelFor } from './labels'
import { Avatar } from './ui'

function sprintSentence(sprintStatus, name) {
  if (sprintStatus === 'loading') {
    return 'Loading sprint…'
  }
  if (sprintStatus === 'missing') {
    return 'No sprint'
  }
  if (sprintStatus === 'error') {
    return 'Sprint unavailable'
  }
  return name || 'No sprint'
}

export default function TaskPage({ taskId, onBack, onUnauthorized, backLabel = 'Back to project' }) {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [task, setTask] = useState(null)
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [sprintName, setSprintName] = useState('')
  const [sprintStatus, setSprintStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadTask() {
      setStatus('loading')
      setError('')
      setEditing(false)
      try {
        const [taskBody, commentBodyResponse, activityBody] = await Promise.all([
          request(`/tasks/${taskId}`, { signal: controller.signal }),
          request(`/tasks/${taskId}/comments`, { signal: controller.signal }),
          request(`/tasks/${taskId}/activity`, { signal: controller.signal }),
        ])
        if (!active) {
          return
        }
        setTask(taskBody.task)
        setProject(taskBody.project)
        setMembers(Array.isArray(taskBody.members) ? taskBody.members : [])
        setDraft({
          title: taskBody.task.title,
          description: taskBody.task.description || '',
          status: taskBody.task.status,
          priority: taskBody.task.priority,
          assigneeId: taskBody.task.assigneeId || '',
          dueDate: taskBody.task.dueDate || '',
        })
        setComments(Array.isArray(commentBodyResponse?.comments) ? commentBodyResponse.comments : [])
        setActivity(Array.isArray(activityBody?.activity) ? activityBody.activity : [])
        setStatus('ready')
      } catch (err) {
        if (!active || err?.name === 'AbortError') {
          return
        }
        if (err.status === 401) {
          onUnauthorized()
          return
        }
        setStatus(err.status === 403 ? 'denied' : 'error')
        setError(err.message || 'Could not load this task')
      }
    }

    loadTask()
    return () => {
      active = false
      controller.abort()
    }
  }, [taskId, reloadKey, onUnauthorized])

  useEffect(() => {
    if (!task?.projectId) {
      return undefined
    }
    if (!task.sprintId) {
      return undefined
    }
    const controller = new AbortController()
    let active = true

    async function loadSprint() {
      setSprintStatus('loading')
      try {
        const body = await request(`/projects/${task.projectId}/sprints`, { signal: controller.signal })
        if (!active) {
          return
        }
        const match = (Array.isArray(body?.sprints) ? body.sprints : []).find((sprint) => sprint.id === task.sprintId)
        setSprintName(match?.name || '')
        setSprintStatus(match ? 'ready' : 'missing')
      } catch (err) {
        if (!active || err?.name === 'AbortError') {
          return
        }
        if (err.status === 401) {
          onUnauthorized()
          return
        }
        setSprintStatus('error')
      }
    }

    loadSprint()
    return () => {
      active = false
      controller.abort()
    }
  }, [task?.projectId, task?.sprintId, onUnauthorized])

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function beginEdit() {
    if (!task) {
      return
    }
    setSaveError('')
    setDraft({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId || '',
      dueDate: task.dueDate || '',
    })
    setEditing(true)
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaveError('')
    if (!draft.title.trim()) {
      setSaveError('Title is required')
      return
    }
    setSaving(true)
    try {
      const body = await request(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          title: draft.title,
          description: draft.description,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId || null,
          dueDate: draft.dueDate || null,
        },
      })
      setTask(body.task)
      setProject(body.project)
      setMembers(Array.isArray(body.members) ? body.members : [])
      setDraft({
        title: body.task.title,
        description: body.task.description || '',
        status: body.task.status,
        priority: body.task.priority,
        assigneeId: body.task.assigneeId || '',
        dueDate: body.task.dueDate || '',
      })
      setEditing(false)
      const activityBody = await request(`/tasks/${taskId}/activity`)
      setActivity(Array.isArray(activityBody?.activity) ? activityBody.activity : [])
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setSaveError(err.message || 'Could not save this task')
    } finally {
      setSaving(false)
    }
  }

  async function handleComment(event) {
    event.preventDefault()
    setCommentError('')
    setCommenting(true)
    try {
      const body = await request(`/tasks/${taskId}/comments`, { body: { body: commentBody } })
      setComments((current) => [...current, body.comment])
      setCommentBody('')
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setCommentError(err.message || 'Could not add the comment')
    } finally {
      setCommenting(false)
    }
  }

  const archived = project?.status === 'archived'
  const assigneeOptions = members.filter((member) => member.active || member.userId === draft?.assigneeId)
  if (draft?.assigneeId && task?.assignee && !assigneeOptions.some((member) => member.userId === draft.assigneeId)) {
    assigneeOptions.unshift({
      userId: task.assignee.id,
      name: task.assignee.name,
      active: true,
    })
  }
  const shownSprint = task?.sprintId ? sprintSentence(sprintStatus, sprintName) : 'No sprint'

  return (
    <section className="panel">
      <button type="button" className="back" onClick={onBack}>
        {backLabel}
      </button>
      {status === 'loading' ? <p className="muted">Loading this task…</p> : null}
      {status === 'denied' ? (
        <p className="error" role="alert">
          {error || 'You do not have permission to view this task.'}
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

      {status === 'ready' && task && draft ? (
        <div className="issue">
          <div className="issue-title">
            {editing ? (
              <input
                className="issue-name-input"
                name="title"
                maxLength={200}
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                aria-label="Title"
                required
              />
            ) : (
              <h1>{task.title}</h1>
            )}
            {project ? (
              <p className="muted">
                {project.name}
                {archived ? ' · Archived' : ''}
              </p>
            ) : null}
            {archived ? <p className="notice">This project is archived. Task changes are closed.</p> : null}
          </div>

          <aside className="issue-rail">
            {editing ? (
              <form className="form" onSubmit={handleSave}>
                <label className="field">
                  Status
                  <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
                    {TASK_STATUSES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Priority
                  <select value={draft.priority} onChange={(event) => updateDraft('priority', event.target.value)}>
                    {PRIORITIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Assignee
                  <select value={draft.assigneeId} onChange={(event) => updateDraft('assigneeId', event.target.value)}>
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Due date
                  <input type="date" value={draft.dueDate} onChange={(event) => updateDraft('dueDate', event.target.value)} />
                </label>
                <p className="prop-line">
                  <span>Sprint</span>
                  <strong>{shownSprint}</strong>
                </p>
                {saveError ? (
                  <p className="error" role="alert">
                    {saveError}
                  </p>
                ) : null}
                <div className="row-actions">
                  <button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="quiet" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="prop-list">
                  <div className="prop-line">
                    <dt>Status</dt>
                    <dd>
                      <span className={`badge status-${task.status}`}>{labelFor(TASK_STATUSES, task.status)}</span>
                    </dd>
                  </div>
                  <div className="prop-line">
                    <dt>Priority</dt>
                    <dd>
                      <span className={`badge priority-${task.priority}`}>{labelFor(PRIORITIES, task.priority)}</span>
                    </dd>
                  </div>
                  <div className="prop-line">
                    <dt>Assignee</dt>
                    <dd className="who">
                      {task.assignee?.name ? <Avatar name={task.assignee.name} small /> : <Avatar empty small />}
                      <span>{task.assignee?.name || 'Unassigned'}</span>
                    </dd>
                  </div>
                  <div className="prop-line">
                    <dt>Due</dt>
                    <dd>{task.dueDate ? formatDay(task.dueDate) : 'No date'}</dd>
                  </div>
                  <div className="prop-line">
                    <dt>Sprint</dt>
                    <dd>{shownSprint}</dd>
                  </div>
                </dl>
                <p className="muted">Reported by {task.reporter?.name || 'someone unknown'}.</p>
                {archived ? null : (
                  <button type="button" onClick={beginEdit}>
                    Edit
                  </button>
                )}
              </>
            )}
          </aside>

          <div className="issue-body">
            <h2>Description</h2>
            {editing ? (
              <textarea
                className="issue-description"
                name="description"
                maxLength={4000}
                aria-label="Description"
                placeholder="Add context for the people doing this work."
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
              />
            ) : task.description ? (
              <p className="prose">{task.description}</p>
            ) : (
              <p className="empty-line">No description yet.</p>
            )}
          </div>

          <div className="issue-talk">
            <section className="talk-block" aria-label="Comments">
              <h2>Comments</h2>
              {comments.length === 0 ? <p className="empty-line">No comments yet.</p> : null}
              {comments.length > 0 ? (
                <ul className="thread">
                  {comments.map((comment) => (
                    <li key={comment.id} className="thread-item">
                      <Avatar name={comment.author?.name || 'Someone'} />
                      <div>
                        <p>
                          <strong>{comment.author?.name || 'Someone'}</strong>
                          <span className="muted"> · {formatWhen(comment.createdAt)}</span>
                        </p>
                        <p className="prose">{comment.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form className="composer" onSubmit={handleComment}>
                <label className="sr-only" htmlFor="comment-body">
                  Comment
                </label>
                <textarea
                  id="comment-body"
                  name="comment"
                  maxLength={4000}
                  placeholder="Write a comment"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  required
                />
                {commentError ? (
                  <p className="error" role="alert">
                    {commentError}
                  </p>
                ) : null}
                <button type="submit" disabled={commenting}>
                  {commenting ? 'Sending…' : 'Comment'}
                </button>
              </form>
            </section>

            <section className="talk-block" aria-label="Activity">
              <h2>Activity</h2>
              {activity.length === 0 ? <p className="empty-line">No activity yet.</p> : null}
              {activity.length > 0 ? (
                <ul className="timeline">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <span>{activityLine(item)}</span>
                      <span className="muted">{formatWhen(item.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </section>
  )
}
