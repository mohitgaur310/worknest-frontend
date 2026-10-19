import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, Search } from 'lucide-react'
import { downloadFile, request, uploadFile } from './api'
import { LEAVE_STATUSES, LEAVE_TYPES, formatDay, formatRange, formatShortDate, formatWhen, labelFor } from './labels'
import { Avatar, Dialog, ViewTabs } from './ui'

const PROFILE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'leave', label: 'Leave' },
  { value: 'payslips', label: 'Payslips' },
]

function canEditPeople(user) {
  return user.role === 'admin' || user.role === 'hr'
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return ''
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pdfProblem(file) {
  if (!file) {
    return 'A PDF file is required'
  }
  const name = String(file.name || '')
  const looksPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
  if (!looksPdf) {
    return 'Only PDF files are allowed'
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'PDF must be 5 MB or smaller'
  }
  return ''
}

function leadFor(user) {
  if (canEditPeople(user)) {
    return 'Profiles, time away, and payslips for this organization.'
  }
  if (user.role === 'manager') {
    return 'Your profile, and the people who report to you.'
  }
  return 'Your profile, time away, and payslips.'
}

function emptyCopy(user) {
  if (canEditPeople(user)) {
    return 'The directory is empty. Add a profile when someone joins.'
  }
  if (user.role === 'manager') {
    return 'No one reports to you yet, and your profile is not in the directory.'
  }
  return 'Your profile is not in the directory yet. HR adds people here.'
}

function pendingLabel(count) {
  if (!count) {
    return 'None'
  }
  return count === 1 ? '1 pending' : `${count} pending`
}

function ProfileEditor({ accounts, initial, busy, error, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle || '')
  const [department, setDepartment] = useState(initial?.department || '')
  const [startDate, setStartDate] = useState(initial?.startDate || '')
  const [userId, setUserId] = useState(initial?.userId || '')
  const [managerUserId, setManagerUserId] = useState(initial?.managerUserId || '')

  const options = Array.isArray(accounts) ? [...accounts] : []
  if (initial?.user && !options.some((account) => account.id === initial.userId)) {
    options.unshift(initial.user)
  }
  const managers = options.filter((account) => account.id !== userId)

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({
      name: name.trim(),
      jobTitle: jobTitle.trim(),
      department: department.trim(),
      startDate,
      userId,
      managerUserId: managerUserId || null,
    })
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="muted">The profile is separate from the sign-in account it links to.</p>
      <div className="editor-grid">
        <label className="field">
          Name
          <input name="employeeName" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          Job title
          <input name="jobTitle" maxLength={80} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} required />
        </label>
        <label className="field">
          Department
          <input
            name="department"
            maxLength={80}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Start date
          <input name="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </label>
        <label className="field">
          Linked account
          <select
            name="userId"
            value={userId}
            onChange={(event) => {
              const next = event.target.value
              setUserId(next)
              if (next === managerUserId) {
                setManagerUserId('')
              }
            }}
            required
          >
            <option value="">Choose an account</option>
            {options.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Manager
          <select name="managerUserId" value={managerUserId} onChange={(event) => setManagerUserId(event.target.value)}>
            <option value="">No manager</option>
            {managers.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {options.length === 0 ? <p className="muted">No active accounts are available to link.</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <button type="button" className="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" disabled={busy || options.length === 0}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function Directory({ user, onOpen, onUnauthorized }) {
  const [employees, setEmployees] = useState([])
  const [accounts, setAccounts] = useState([])
  const [leave, setLeave] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [creating, setCreating] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load() {
      setStatus('loading')
      setError('')
      try {
        const [peopleBody, leaveBody] = await Promise.all([
          request('/employees', { signal: controller.signal }),
          request('/leave', { signal: controller.signal }),
        ])
        if (!active) {
          return
        }
        setEmployees(Array.isArray(peopleBody?.employees) ? peopleBody.employees : [])
        setAccounts(Array.isArray(peopleBody?.accounts) ? peopleBody.accounts : [])
        setLeave(Array.isArray(leaveBody?.leave) ? leaveBody.leave : [])
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
        setError(err.message || 'Could not load the directory')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey, onUnauthorized])

  async function handleCreate(payload) {
    setFormError('')
    setCreating(true)
    try {
      const body = await request('/employees', { body: payload })
      setEditorOpen(false)
      onOpen(body.employee.id)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setFormError(err.message || 'Could not add this profile')
    } finally {
      setCreating(false)
    }
  }

  const departments = [...new Set(employees.map((person) => person.department).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
  const needle = query.trim().toLowerCase()
  const filtered = employees.filter((person) => {
    if (department && person.department !== department) {
      return false
    }
    if (!needle) {
      return true
    }
    const haystack = `${person.name} ${person.jobTitle} ${person.department}`.toLowerCase()
    return haystack.includes(needle)
  })
  const pendingByEmployee = new Map()
  for (const item of leave) {
    if (item.status === 'pending') {
      pendingByEmployee.set(item.employeeId, (pendingByEmployee.get(item.employeeId) || 0) + 1)
    }
  }

  return (
    <section className="panel people">
      <header className="page-head split-head">
        <div>
          <p className="page-kicker">People</p>
          <h1>Directory</h1>
          <p className="lead">{leadFor(user)}</p>
        </div>
        {canEditPeople(user) && status === 'ready' ? (
          <button type="button" className="primary" onClick={() => setEditorOpen(true)}>
            Add profile
          </button>
        ) : null}
      </header>

      {status === 'loading' ? <p className="muted">Loading the directory…</p> : null}
      {status === 'denied' ? (
        <div className="calm">
          <h2>You cannot open the directory</h2>
          <p>{error || 'Your role does not include people records.'}</p>
        </div>
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

      {status === 'ready' && employees.length === 0 ? (
        <div className="empty-block">
          <p>{emptyCopy(user)}</p>
          {canEditPeople(user) ? (
            <button type="button" onClick={() => setEditorOpen(true)}>
              Add profile
            </button>
          ) : null}
        </div>
      ) : null}

      {status === 'ready' && employees.length > 0 ? (
        <>
          <div className="people-tools">
            <label className="search">
              <Search className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">Search the directory</span>
              <input
                name="directorySearch"
                value={query}
                placeholder="Search name, title, or department"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">All departments</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-block">
              <p>No one matches that search.</p>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setQuery('')
                  setDepartment('')
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="dir" role="table" aria-label="Directory">
              <div className="dir-head" role="row">
                <span role="columnheader">Name</span>
                <span role="columnheader">Title</span>
                <span role="columnheader">Department</span>
                <span role="columnheader">Manager</span>
                <span role="columnheader">Pending leave</span>
              </div>
              {filtered.map((person) => (
                <button key={person.id} type="button" className="dir-row" role="row" onClick={() => onOpen(person.id)}>
                  <span role="cell" className="dir-name">
                    <Avatar name={person.name} small />
                    {person.name}
                  </span>
                  <span role="cell" data-label="Title">
                    {person.jobTitle}
                  </span>
                  <span role="cell" data-label="Department">
                    {person.department}
                  </span>
                  <span role="cell" data-label="Manager">
                    {person.manager?.name || 'No manager'}
                  </span>
                  <span role="cell" data-label="Pending leave">
                    {pendingLabel(pendingByEmployee.get(person.id) || 0)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {editorOpen ? (
        <Dialog
          title="Add profile"
          onClose={() => {
            setEditorOpen(false)
            setFormError('')
          }}
        >
          <ProfileEditor
            accounts={accounts}
            busy={creating}
            error={formError}
            submitLabel="Add profile"
            onSubmit={handleCreate}
            onCancel={() => {
              setEditorOpen(false)
              setFormError('')
            }}
          />
        </Dialog>
      ) : null}
    </section>
  )
}

function Profile({ user, employeeId, onBack, onUnauthorized }) {
  const fileRef = useRef(null)
  const [employee, setEmployee] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [leave, setLeave] = useState([])
  const [payslips, setPayslips] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [payslipStatus, setPayslipStatus] = useState('loading')
  const [payslipError, setPayslipError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [type, setType] = useState('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [leaveError, setLeaveError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [deciding, setDeciding] = useState(null)
  const [note, setNote] = useState('')
  const [decideError, setDecideError] = useState('')
  const [decidingId, setDecidingId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [employeeId])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function load() {
      setStatus('loading')
      setError('')
      setPayslipStatus('loading')
      setPayslipError('')
      try {
        const [personBody, leaveBody] = await Promise.all([
          request(`/employees/${employeeId}`, { signal: controller.signal }),
          request('/leave', { signal: controller.signal }),
        ])
        if (!active) {
          return
        }
        setEmployee(personBody.employee)
        setAccounts(Array.isArray(personBody.accounts) ? personBody.accounts : [])
        const history = Array.isArray(leaveBody?.leave) ? leaveBody.leave : []
        setLeave(history.filter((item) => item.employeeId === employeeId))
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
        setError(err.message || 'Could not load this profile')
        setPayslipStatus('idle')
        return
      }

      try {
        const slipBody = await request(`/employees/${employeeId}/payslips`, { signal: controller.signal })
        if (!active) {
          return
        }
        setPayslips(Array.isArray(slipBody?.payslips) ? slipBody.payslips : [])
        setPayslipStatus('ready')
      } catch (err) {
        if (!active || err?.name === 'AbortError') {
          return
        }
        if (err.status === 401) {
          onUnauthorized()
          return
        }
        if (err.status === 403) {
          setPayslipStatus('denied')
          setPayslipError('')
          return
        }
        setPayslipStatus('error')
        setPayslipError(err.message || 'Could not load payslips')
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [employeeId, reloadKey, onUnauthorized])

  async function handleSave(payload) {
    setSaveError('')
    setSaving(true)
    try {
      const body = await request(`/employees/${employeeId}`, { method: 'PATCH', body: payload })
      setEmployee(body.employee)
      setEditing(false)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setSaveError(err.message || 'Could not save this profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleLeave(event) {
    event.preventDefault()
    setLeaveError('')
    setRequesting(true)
    try {
      await request('/leave', { body: { type, startDate, endDate, reason } })
      setType('annual')
      setStartDate('')
      setEndDate('')
      setReason('')
      setLeaveOpen(false)
      setReloadKey((value) => value + 1)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setLeaveError(err.message || 'Could not submit this request')
    } finally {
      setRequesting(false)
    }
  }

  async function decide(event) {
    event.preventDefault()
    if (!deciding) {
      return
    }
    setDecidingId(deciding.item.id)
    setDecideError('')
    try {
      await request(`/leave/${deciding.item.id}/decision`, {
        body: { status: deciding.status, comment: note },
      })
      setDeciding(null)
      setNote('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setDecideError(err.message || 'Could not record this decision')
    } finally {
      setDecidingId('')
    }
  }

  async function sendPayslip(file) {
    const problem = pdfProblem(file)
    setUploadError('')
    if (problem) {
      setUploadError(problem)
      return
    }
    setUploading(true)
    try {
      await uploadFile(`/employees/${employeeId}/payslips`, file)
      if (fileRef.current) {
        fileRef.current.value = ''
      }
      setReloadKey((value) => value + 1)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setUploadError(err.message || 'Could not upload this payslip')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(slip) {
    setDownloadError('')
    try {
      await downloadFile(`/payslips/${slip.id}/file`, slip.fileName)
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized()
        return
      }
      setDownloadError(err.message || 'Could not download this payslip')
    }
  }

  if (status === 'loading') {
    return (
      <section className="panel people">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          Directory
        </button>
        <p className="muted">Loading profile…</p>
      </section>
    )
  }

  if (status === 'denied') {
    return (
      <section className="panel people">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          Directory
        </button>
        <div className="calm">
          <h2>This profile is private</h2>
          <p>{error || 'You do not have access to this profile.'}</p>
        </div>
      </section>
    )
  }

  if (status === 'error' || !employee) {
    return (
      <section className="panel people">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          Directory
        </button>
        <div className="state">
          <p className="error" role="alert">
            {error || 'Could not load this profile'}
          </p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  const owns = employee.userId === user.id
  const reviewLine = employee.manager?.name ? `Goes to ${employee.manager.name} for a decision.` : 'Goes to HR for a decision.'

  return (
    <section className="panel people">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        Directory
      </button>

      <header className="profile-head">
        <Avatar name={employee.name} large />
        <div>
          <h1>{employee.name}</h1>
          <p className="lead">
            {employee.jobTitle}
            <span className="muted"> · {employee.department}</span>
          </p>
        </div>
        {canEditPeople(user) ? (
          <button type="button" className="quiet" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        ) : null}
      </header>

      <ViewTabs label="Profile" value={tab} onChange={setTab} options={PROFILE_TABS} />

      {tab === 'overview' ? (
        <div className="overview">
          <p>Started {formatDay(employee.startDate)}.</p>
          <p>{employee.manager?.name ? `Reports to ${employee.manager.name}.` : 'No manager is assigned.'}</p>
          <p>{employee.user?.email ? `Signs in as ${employee.user.email}.` : 'No sign-in account is linked.'}</p>
        </div>
      ) : null}

      {tab === 'leave' ? (
        <section className="talk-block" aria-label="Leave">
          <div className="region-head">
            <h2>Leave</h2>
            {owns ? (
              <button type="button" className="primary" onClick={() => setLeaveOpen(true)}>
                Request leave
              </button>
            ) : null}
          </div>
          {leave.length === 0 ? (
            <div className="empty-block">
              <p>No leave requests.</p>
              {owns ? (
                <button type="button" onClick={() => setLeaveOpen(true)}>
                  Request leave
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="plain-list">
              {leave.map((item) => (
                <li key={item.id} className="leave-row">
                  <div>
                    <p>
                      <strong>{labelFor(LEAVE_TYPES, item.type)}</strong>
                      <span className="muted"> · {formatRange(item.startDate, item.endDate)}</span>
                    </p>
                    <p className="prose">{item.reason}</p>
                    {item.status === 'pending' ? (
                      <span className="badge">{labelFor(LEAVE_STATUSES, item.status)}</span>
                    ) : (
                      <p className="muted">
                        {labelFor(LEAVE_STATUSES, item.status)}
                        {item.approver?.name ? ` by ${item.approver.name}` : ''}
                        {item.decidedAt ? ` · ${formatWhen(item.decidedAt)}` : ''}
                      </p>
                    )}
                    {item.comment ? <p className="muted">{item.comment}</p> : null}
                  </div>
                  {item.canDecide ? (
                    <div className="row-actions">
                      <button type="button" className="primary" onClick={() => setDeciding({ item, status: 'approved' })}>
                        Approve
                      </button>
                      <button type="button" className="reject" onClick={() => setDeciding({ item, status: 'rejected' })}>
                        Reject
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'payslips' ? (
        <section className="talk-block" aria-label="Payslips">
          <div className="region-head">
            <h2>Payslips</h2>
            {canEditPeople(user) && payslipStatus !== 'denied' ? (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload payslip'}
              </button>
            ) : null}
          </div>
          {canEditPeople(user) ? (
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              name="payslip"
              accept="application/pdf,.pdf"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  sendPayslip(file)
                }
              }}
            />
          ) : null}
          {uploadError ? (
            <p className="error" role="alert">
              {uploadError}
            </p>
          ) : null}
          {payslipStatus === 'loading' ? <p className="muted">Loading payslips…</p> : null}
          {payslipStatus === 'denied' ? (
            <div className="calm">
              <h2>Payslips are private</h2>
              <p>Only the employee, HR, and admins can open them.</p>
            </div>
          ) : null}
          {payslipStatus === 'error' ? (
            <div className="state">
              <p className="error" role="alert">
                {payslipError}
              </p>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : null}
          {payslipStatus === 'ready' && payslips.length === 0 ? (
            <div className="empty-block">
              <p>No payslips on file.</p>
              {canEditPeople(user) ? (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  Upload a PDF
                </button>
              ) : null}
            </div>
          ) : null}
          {payslipStatus === 'ready' && payslips.length > 0 ? (
            <ul className="slip-list">
              {payslips.map((slip) => (
                <li key={slip.id} className="slip">
                  <span>{formatShortDate(slip.uploadedAt) || 'Undated'}</span>
                  <span className="muted">
                    {slip.fileName}
                    {formatSize(slip.size) ? ` · ${formatSize(slip.size)}` : ''}
                  </span>
                  <button type="button" className="primary" onClick={() => handleDownload(slip)}>
                    <Download className="icon" size={14} strokeWidth={1.75} aria-hidden="true" />
                    Download
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {downloadError ? (
            <p className="error" role="alert">
              {downloadError}
            </p>
          ) : null}
        </section>
      ) : null}

      {editing ? (
        <Dialog
          title="Edit profile"
          onClose={() => {
            setEditing(false)
            setSaveError('')
          }}
        >
          <ProfileEditor
            key={`${employee.id}-${employee.updatedAt}`}
            accounts={accounts}
            initial={employee}
            busy={saving}
            error={saveError}
            submitLabel="Save profile"
            onSubmit={handleSave}
            onCancel={() => {
              setEditing(false)
              setSaveError('')
            }}
          />
        </Dialog>
      ) : null}

      {leaveOpen ? (
        <Dialog
          title="Request leave"
          onClose={() => {
            setLeaveOpen(false)
            setLeaveError('')
          }}
        >
          <form className="form" onSubmit={handleLeave}>
            <div className="seg" role="group" aria-label="Leave type">
              {LEAVE_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="seg-btn"
                  aria-pressed={type === item.value}
                  onClick={() => setType(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pair">
              <label className="field">
                From
                <input name="leaveStart" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
              </label>
              <label className="field">
                To
                <input
                  name="leaveEnd"
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="field">
              Reason
              <textarea name="leaveReason" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} required />
            </label>
            <p className="muted">{reviewLine}</p>
            {leaveError ? (
              <p className="error" role="alert">
                {leaveError}
              </p>
            ) : null}
            <button type="submit" disabled={requesting}>
              {requesting ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        </Dialog>
      ) : null}

      {deciding ? (
        <Dialog title={deciding.status === 'approved' ? 'Approve leave' : 'Reject leave'} onClose={() => setDeciding(null)}>
          <form className="form" onSubmit={decide}>
            <p>
              {labelFor(LEAVE_TYPES, deciding.item.type)} leave, {formatRange(deciding.item.startDate, deciding.item.endDate)}.
            </p>
            <p className="muted">{deciding.item.reason}</p>
            <label className="field">
              Note, optional
              <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            {decideError ? (
              <p className="error" role="alert">
                {decideError}
              </p>
            ) : null}
            <button type="submit" className={deciding.status === 'rejected' ? 'reject' : ''} disabled={decidingId === deciding.item.id}>
              {decidingId === deciding.item.id ? 'Saving…' : deciding.status === 'approved' ? 'Approve' : 'Reject'}
            </button>
          </form>
        </Dialog>
      ) : null}
    </section>
  )
}

export default function People({ user, employeeId, onOpen, onBack, onUnauthorized }) {
  if (employeeId) {
    return <Profile user={user} employeeId={employeeId} onBack={onBack} onUnauthorized={onUnauthorized} />
  }
  return <Directory user={user} onOpen={onOpen} onUnauthorized={onUnauthorized} />
}
