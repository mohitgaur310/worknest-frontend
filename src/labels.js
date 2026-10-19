export const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'hr', label: 'HR' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
]

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const LEAVE_TYPES = [
  { value: 'annual', label: 'Annual' },
  { value: 'sick', label: 'Sick' },
  { value: 'unpaid', label: 'Unpaid' },
]

export const LEAVE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export const SPRINT_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export function labelFor(options, value) {
  const match = options.find((item) => item.value === value)
  return match ? match.label : value || '—'
}

export function roleLabel(role) {
  return labelFor(ROLES, role)
}

export function formatWhen(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString()
}

export function formatDay(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || ''
  }
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatRange(start, end) {
  if (!start) {
    return ''
  }
  if (!end || start === end) {
    return formatDay(start)
  }
  return `${formatDay(start)} – ${formatDay(end)}`
}

export function formatShortDate(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function localIso(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isDueWithin(dueDate, days) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return false
  }
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  const today = localIso(start)
  const limit = localIso(end)
  return dueDate >= today && dueDate <= limit
}

function assigneeEnd(label, id) {
  if (label) {
    return label
  }
  if (id) {
    return 'Unknown user'
  }
  return 'Unassigned'
}

export function activityLine(item) {
  const actor = item.actor?.name || 'Someone'
  if (item.type === 'created') {
    return `${actor} created this task`
  }
  if (item.type === 'status_changed') {
    return `${actor} changed status from ${labelFor(TASK_STATUSES, item.from)} to ${labelFor(TASK_STATUSES, item.to)}`
  }
  if (item.type === 'priority_changed') {
    return `${actor} changed priority from ${labelFor(PRIORITIES, item.from)} to ${labelFor(PRIORITIES, item.to)}`
  }
  if (item.type === 'assignee_changed') {
    return `${actor} changed the assignee from ${assigneeEnd(item.fromLabel, item.from)} to ${assigneeEnd(item.toLabel, item.to)}`
  }
  return `${actor} updated this task`
}
