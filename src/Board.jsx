import { useRef, useState } from 'react'
import { PRIORITIES, TASK_STATUSES, labelFor } from './labels'
import { Avatar, BlankArt } from './ui'

const EMPTY_COPY = {
  todo: 'Nothing waiting',
  in_progress: 'Nothing in progress',
  done: 'Nothing finished',
}

export default function Board({ tasks, archived, movingId, moveError, onOpenTask, onMove }) {
  const [overStatus, setOverStatus] = useState('')
  const [draggingId, setDraggingId] = useState('')
  const suppressClick = useRef(false)

  function handleDragStart(event, taskId) {
    suppressClick.current = false
    setDraggingId(taskId)
    event.dataTransfer.setData('text/plain', taskId)
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    suppressClick.current = true
    setDraggingId('')
    setOverStatus('')
    window.setTimeout(() => {
      suppressClick.current = false
    }, 50)
  }

  function handleOpen(taskId) {
    if (suppressClick.current) {
      return
    }
    onOpenTask(taskId)
  }

  function allowDrop(event) {
    if (archived) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(event, status) {
    event.preventDefault()
    setOverStatus('')
    if (archived || !event.dataTransfer) {
      return
    }
    const taskId = event.dataTransfer.getData('text/plain')
    if (!taskId) {
      return
    }
    onMove(taskId, status)
  }

  return (
    <div className="board-wrap">
      {archived ? (
        <p className="notice">This project is archived. Tasks cannot be moved.</p>
      ) : (
        <p className="muted">Drag a card into another column, or choose a column in Move.</p>
      )}
      {moveError ? (
        <p className="error" role="alert">
          {moveError}
        </p>
      ) : null}
      <div className="board">
        {TASK_STATUSES.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.value)
          const over = overStatus === column.value
          return (
            <section
              key={column.value}
              className={over ? `board-column status-${column.value} over` : `board-column status-${column.value}`}
              aria-label={column.label}
              onDragEnter={(event) => {
                if (archived) {
                  return
                }
                event.preventDefault()
                setOverStatus(column.value)
              }}
              onDragOver={allowDrop}
              onDrop={(event) => handleDrop(event, column.value)}
            >
              <h3 className="board-heading">
                <span className="col-label">{column.label}</span>
                <span className="count">{columnTasks.length}</span>
              </h3>
              {columnTasks.length === 0 ? (
                <div className="board-empty">
                  <BlankArt />
                  <p>{EMPTY_COPY[column.value]}</p>
                </div>
              ) : null}
              {columnTasks.map((task) => {
                const classes = ['board-card', `priority-${task.priority}`]
                if (movingId === task.id) {
                  classes.push('is-moving')
                }
                if (draggingId === task.id) {
                  classes.push('is-dragging')
                }
                return (
                  <article key={task.id} className={classes.join(' ')}>
                    <div
                      className="board-drag"
                      draggable={!archived}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${task.title}`}
                      onDragStart={(event) => handleDragStart(event, task.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleOpen(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleOpen(task.id)
                        }
                      }}
                    >
                      <span className="board-title">{task.title}</span>
                      <span className="card-foot">
                        <span className={`badge priority-${task.priority}`}>
                          {labelFor(PRIORITIES, task.priority)}
                        </span>
                        <span className="due">{task.dueDate ? `Due ${task.dueDate}` : 'No date'}</span>
                        <span className="who">
                          {task.assignee?.name ? (
                            <Avatar name={task.assignee.name} small />
                          ) : (
                            <Avatar empty small />
                          )}
                          <span>{task.assignee?.name || 'Unassigned'}</span>
                        </span>
                      </span>
                    </div>
                    <label className="field board-move">
                      Move
                      <select
                        aria-label={`Move ${task.title}`}
                        value={task.status}
                        disabled={archived || movingId === task.id}
                        onChange={(event) => {
                          const nextStatus = event.target.value
                          if (nextStatus !== task.status) {
                            onMove(task.id, nextStatus)
                          }
                        }}
                      >
                        {TASK_STATUSES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {movingId === task.id ? <p className="muted">Moving…</p> : null}
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}
