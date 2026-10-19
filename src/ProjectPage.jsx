import { useCallback, useEffect, useState } from 'react'
import { request } from './api'
import Board from './Board'
import Sprints from './Sprints'
import { PRIORITIES, TASK_STATUSES, labelFor, roleLabel } from './labels'
import { Avatar, Dialog, ViewTabs } from './ui'

const PROJECT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

const TABS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
  { value: 'sprints', label: 'Sprints' },
]

export default function ProjectPage({ user, projectId, onBack, onOpenTask, onUnauthorized }) {
  const [access, setAccess] = useState('loading')
  const [projectError, setProjectError] = useState('')
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [directory, setDirectory] = useState([])
  const [canManageMembers, setCanManageMembers] = useState(false)
  const [canUpdateProject, setCanUpdateProject] = useState(false)
  const [canManageSprints, setCanManageSprints] = useState(false)
  const [projectVersion, setProjectVersion] = useState(0)
  const [tab, setTab] = useState('board')
  const [membersOpen, setMembersOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)

  const [memberId, setMemberId] = useState('')
  const [memberError, setMemberError] = useState('')
  const [memberMessage, setMemberMessage] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [removingId, setRemovingId] = useState('')
  const [statusError, setStatusError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [taskStatus, setTaskStatus] = useState('loading')
  const [taskError, setTaskError] = useState('')
  const [tasks, setTasks] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [mine, setMine] = useState(false)
  const [taskVersion, setTaskVersion] = useState(0)
  const [movingId, setMovingId] = useState('')
  const [moveError, setMoveError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [newStatus, setNewStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [taskFormError, setTaskFormError] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  const [sprintBar, setSprintBar] = useState({
    canCreate: false,
    canStart: false,
    startId: '',
    startLabel: 'Start sprint',
    starting: false,
    openCreate() {},
    start() {},
  })

  const acceptSprintBar = useCallback((next) => {
    setSprintBar((current) => {
      if (
        current.canCreate === next.canCreate &&
        current.canStart === next.canStart &&
        current.startId === next.startId &&
        current.startLabel === next.startLabel &&
        current.starting === next.starting
      ) {
        return current
      }
      return next
    })
  }, [])

  const closeMembers = useCallback(() => setMembersOpen(false), [])
  const closeTask = useCallback(() => {
    setTaskOpen(false)
    setTaskFormError('')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadProject() {
      setProjectError('')
      setAccess((current) => (current === 'ready' ? current : 'loading'))
      try {
        const body = await request(`/projects/${projectId}`, { signal: controller.signal })
        if (!active) {
          return
        }
        setProject(body.project)
        setMembers(Array.isArray(body.members) ? body.members : [])
        setDirectory(Array.isArray(body.users) ? body.users : [])
        setCanManageMembers(body.canManageMembers === true)
        setCanUpdateProject(body.canUpdateProject === true)
        setCanManageSprints(body.canManageSprints === true)
        setAccess('ready')
      } catch (error) {
        if (!active || error?.name === 'AbortError') {
          return
        }
        if (error.status === 401) {
          onUnauthorized()
          return
        }
        setProject(null)
        setAccess(error.status === 403 ? 'denied' : 'error')
        setProjectError(error.message || 'Could not load this project')
      }
    }

    loadProject()
    return () => {
      active = false
      controller.abort()
    }
  }, [projectId, projectVersion, onUnauthorized])

  useEffect(() => {
    if (access !== 'ready' || tab === 'sprints') {
      return undefined
    }
    const controller = new AbortController()
    let active = true

    async function loadTasks() {
      setTaskStatus('loading')
      setTaskError('')
      const params = new URLSearchParams()
      if (tab === 'list' && statusFilter) {
        params.set('status', statusFilter)
      }
      if (priorityFilter) {
        params.set('priority', priorityFilter)
      }
      if (mine) {
        params.set('mine', 'true')
      } else if (assigneeFilter) {
        params.set('assigneeId', assigneeFilter)
      }
      const query = params.toString()
      try {
        const body = await request(`/projects/${projectId}/tasks${query ? `?${query}` : ''}`, {
          signal: controller.signal,
        })
        if (!active) {
          return
        }
        setTasks(Array.isArray(body?.tasks) ? body.tasks : [])
        setTaskStatus('ready')
      } catch (error) {
        if (!active || error?.name === 'AbortError') {
          return
        }
        if (error.status === 401) {
          onUnauthorized()
          return
        }
        setTaskStatus(error.status === 403 ? 'denied' : 'error')
        setTaskError(error.message || 'Could not load tasks')
      }
    }

    loadTasks()
    return () => {
      active = false
      controller.abort()
    }
  }, [access, projectId, tab, statusFilter, assigneeFilter, priorityFilter, mine, taskVersion, onUnauthorized])

  async function handleAddMember(event) {
    event.preventDefault()
    setMemberError('')
    setMemberMessage('')
    setAddingMember(true)
    try {
      await request(`/projects/${projectId}/members`, { body: { userId: memberId } })
      setMemberId('')
      setMemberMessage('Member added.')
      setProjectVersion((value) => value + 1)
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setMemberError(error.message || 'Could not add this member')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleRemoveMember(userId) {
    setMemberError('')
    setMemberMessage('')
    setRemovingId(userId)
    try {
      await request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
      setMemberMessage('Member removed.')
      setProjectVersion((value) => value + 1)
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setMemberError(error.message || 'Could not remove this member')
    } finally {
      setRemovingId('')
    }
  }

  async function handleStatus(nextStatus) {
    setStatusError('')
    setUpdatingStatus(true)
    try {
      await request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      setProjectVersion((value) => value + 1)
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setStatusError(error.message || 'Could not update this project')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const archived = project?.status === 'archived'

  async function handleMoveTask(taskId, nextStatus) {
    if (movingId) {
      return
    }
    const current = tasks.find((task) => task.id === taskId)
    if (!current || current.status === nextStatus) {
      return
    }
    if (archived) {
      setMoveError('Archived projects cannot change tasks')
      return
    }
    setMoveError('')
    setMovingId(taskId)
    try {
      const body = await request(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      if (body?.task) {
        setTasks((items) => items.map((task) => (task.id === taskId ? body.task : task)))
      }
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setMoveError(error.message || 'Could not move this task')
    } finally {
      setMovingId('')
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault()
    setTaskFormError('')
    setCreatingTask(true)
    try {
      await request(`/projects/${projectId}/tasks`, {
        body: {
          title,
          description,
          status: newStatus,
          priority,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        },
      })
      setTitle('')
      setDescription('')
      setNewStatus('todo')
      setPriority('medium')
      setAssigneeId('')
      setDueDate('')
      setTaskOpen(false)
      setTaskVersion((value) => value + 1)
    } catch (error) {
      if (error.status === 401) {
        onUnauthorized()
        return
      }
      setTaskFormError(error.message || 'Could not create the task')
    } finally {
      setCreatingTask(false)
    }
  }

  const memberIds = new Set(members.map((member) => member.userId))
  const candidates = directory.filter((person) => !memberIds.has(person.id))
  const filtersActive = Boolean((tab === 'list' && statusFilter) || priorityFilter || assigneeFilter || mine)
  let statusButton = 'Archive project'
  if (updatingStatus) {
    statusButton = 'Saving…'
  } else if (archived) {
    statusButton = 'Restore project'
  }
  const shownMembers = members.slice(0, 5)

  function clearFilters() {
    setStatusFilter('')
    setAssigneeFilter('')
    setPriorityFilter('')
    setMine(false)
  }

  return (
    <section className="panel project-screen">
      <button type="button" className="back" onClick={onBack}>
        My work
      </button>

      {access === 'loading' ? <p className="muted">Loading this project…</p> : null}
      {access === 'denied' ? (
        <p className="error" role="alert">
          {projectError || 'You do not have permission to view this project.'}
        </p>
      ) : null}
      {access === 'error' ? (
        <div className="state">
          <p className="error" role="alert">
            {projectError}
          </p>
          <button type="button" onClick={() => setProjectVersion((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      {access === 'ready' && project ? (
        <>
          <header className="project-head">
            <div className="title-block">
              <div className="title-row">
                <h1>{project.name}</h1>
                <span className={archived ? 'badge archived' : 'badge status-active'}>
                  {labelFor(PROJECT_STATUSES, project.status)}
                </span>
              </div>
              <p className="lead">{project.description || 'No description yet.'}</p>
            </div>
            <div className="head-actions">
              <button type="button" className="quiet members-button" onClick={() => setMembersOpen(true)}>
                <span className="avatar-stack">
                  {shownMembers.length === 0 ? <Avatar empty small /> : null}
                  {shownMembers.map((member) => (
                    <Avatar key={member.id} name={member.name} small />
                  ))}
                </span>
                {members.length === 1 ? '1 member' : `${members.length} members`}
              </button>
              {canUpdateProject ? (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => handleStatus(archived ? 'active' : 'archived')}
                  disabled={updatingStatus}
                >
                  {statusButton}
                </button>
              ) : null}
            </div>
            {statusError ? (
              <p className="error" role="alert">
                {statusError}
              </p>
            ) : null}
            <div className="tab-row">
              <ViewTabs label="Project view" value={tab} onChange={setTab} options={TABS} />
              <div className="tab-actions">
                {tab !== 'sprints' && !archived ? (
                  <button type="button" className="primary" onClick={() => setTaskOpen(true)}>
                    New task
                  </button>
                ) : null}
                {tab === 'sprints' && sprintBar.canCreate ? (
                  <button type="button" onClick={() => sprintBar.openCreate()}>
                    Create sprint
                  </button>
                ) : null}
                {tab === 'sprints' && sprintBar.canStart ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => sprintBar.start()}
                    disabled={sprintBar.starting}
                  >
                    {sprintBar.starting ? 'Starting…' : sprintBar.startLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {archived ? <p className="notice">This project is archived. New tasks and sprint changes are closed.</p> : null}

          {tab !== 'sprints' ? (
            <div className="filter-bar">
              {tab === 'list' ? (
                <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">Any status</option>
                  {TASK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                aria-label="Assignee"
                value={mine ? '' : assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                disabled={mine}
              >
                <option value="">Anyone</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
              <select aria-label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="">Any priority</option>
                {PRIORITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="button" className="quiet" aria-pressed={mine} onClick={() => setMine((value) => !value)}>
                Assigned to me
              </button>
            </div>
          ) : null}

          {tab !== 'sprints' && taskStatus === 'loading' ? <p className="muted">Loading tasks…</p> : null}
          {tab !== 'sprints' && taskStatus === 'denied' ? (
            <p className="error" role="alert">
              {taskError || 'You do not have permission to view these tasks.'}
            </p>
          ) : null}
          {tab !== 'sprints' && taskStatus === 'error' ? (
            <div className="state">
              <p className="error" role="alert">
                {taskError}
              </p>
              <button type="button" onClick={() => setTaskVersion((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : null}

          {tab === 'list' && taskStatus === 'ready' && tasks.length === 0 ? (
            <div className="empty-block">
              <p>{filtersActive ? 'No tasks match these filters.' : 'No tasks yet.'}</p>
              {filtersActive ? (
                <button type="button" className="quiet" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
              {!filtersActive && !archived ? (
                <button type="button" onClick={() => setTaskOpen(true)}>
                  New task
                </button>
              ) : null}
            </div>
          ) : null}
          {tab === 'list' && taskStatus === 'ready' && tasks.length > 0 ? (
            <div className="task-lines">
              {tasks.map((task) => (
                <button key={task.id} type="button" className="task-line" onClick={() => onOpenTask(task.id)}>
                  <span className="row-title">{task.title}</span>
                  <span className={`badge status-${task.status}`}>{labelFor(TASK_STATUSES, task.status)}</span>
                  <span className={`badge priority-${task.priority}`}>{labelFor(PRIORITIES, task.priority)}</span>
                  <span className="who">
                    {task.assignee?.name ? <Avatar name={task.assignee.name} small /> : <Avatar empty small />}
                    <span>{task.assignee?.name || 'Unassigned'}</span>
                  </span>
                  <span className="muted">{task.dueDate ? `Due ${task.dueDate}` : 'No date'}</span>
                </button>
              ))}
            </div>
          ) : null}

          {tab === 'board' && taskStatus === 'ready' && tasks.length === 0 ? (
            <div className="empty-block">
              <p>{filtersActive ? 'No tasks match these filters.' : 'No tasks on this board.'}</p>
              {filtersActive ? (
                <button type="button" className="quiet" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
              {!filtersActive && !archived ? (
                <button type="button" onClick={() => setTaskOpen(true)}>
                  New task
                </button>
              ) : null}
            </div>
          ) : null}
          {tab === 'board' && taskStatus === 'ready' && tasks.length > 0 ? (
            <Board
              tasks={tasks}
              archived={archived}
              movingId={movingId}
              moveError={moveError}
              onOpenTask={onOpenTask}
              onMove={handleMoveTask}
            />
          ) : null}

          {tab === 'sprints' ? (
            <Sprints
              projectId={projectId}
              canManage={canManageSprints}
              archived={archived}
              taskVersion={taskVersion}
              onOpenTask={onOpenTask}
              onUnauthorized={onUnauthorized}
              onChanged={() => setTaskVersion((value) => value + 1)}
              onBar={acceptSprintBar}
              onCreateTask={() => setTaskOpen(true)}
            />
          ) : null}
        </>
      ) : null}

      {membersOpen && project ? (
        <Dialog title="Members" onClose={closeMembers}>
          {members.length === 0 ? <p>No members on this project.</p> : null}
          {members.length > 0 ? (
            <ul className="plain-list">
              {members.map((member) => (
                <li key={member.id} className="split-row">
                  <span className="who">
                    <Avatar name={member.name} />
                    <span>
                      <span className="row-title">
                        {member.name}
                        {member.userId === user.id ? ' (you)' : ''}
                      </span>
                      <span className="muted">
                        {member.email} · {roleLabel(member.role)}
                        {member.active ? '' : ' · inactive'}
                      </span>
                    </span>
                  </span>
                  {canManageMembers ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removingId === member.userId}
                    >
                      {removingId === member.userId ? 'Removing…' : 'Remove'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canManageMembers ? (
            <form className="form" onSubmit={handleAddMember}>
              <label className="field">
                Add a member
                <select name="member" value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
                  <option value="">Select a user</option>
                  {candidates.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({roleLabel(person.role)})
                    </option>
                  ))}
                </select>
              </label>
              {candidates.length === 0 ? <p className="muted">Everyone active is already a member.</p> : null}
              {memberError ? (
                <p className="error" role="alert">
                  {memberError}
                </p>
              ) : null}
              {memberMessage ? (
                <p className="message" role="status">
                  {memberMessage}
                </p>
              ) : null}
              <button type="submit" disabled={addingMember || candidates.length === 0}>
                {addingMember ? 'Adding…' : 'Add member'}
              </button>
            </form>
          ) : null}
        </Dialog>
      ) : null}

      {taskOpen ? (
        <Dialog title="New task" onClose={closeTask}>
          <form className="form" onSubmit={handleCreateTask}>
            <label className="field">
              Title
              <input name="title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="field">
              Description
              <textarea
                name="description"
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="pair">
              <label className="field">
                Status
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                  {TASK_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Priority
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {PRIORITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="pair">
              <label className="field">
                Assignee
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {members
                    .filter((member) => member.active)
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Due date
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
            {taskFormError ? (
              <p className="error" role="alert">
                {taskFormError}
              </p>
            ) : null}
            <button type="submit" disabled={creatingTask}>
              {creatingTask ? 'Creating…' : 'Create task'}
            </button>
          </form>
        </Dialog>
      ) : null}
    </section>
  )
}
