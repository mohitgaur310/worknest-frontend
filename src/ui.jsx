import { useEffect } from 'react'
import { Columns3, List } from 'lucide-react'

const TONES = ['tone-a', 'tone-b', 'tone-c', 'tone-d', 'tone-e']

function toneFor(name) {
  const text = String(name || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index) * (index + 1)) % TONES.length
  }
  return TONES[hash]
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function Mark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4.5 24.5 16 6.5 27.5 24.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 24.5 16 14.2 22 24.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <Mark />
      <span className="brand-name">Worknest</span>
    </div>
  )
}

export function Avatar({ name, empty = false, small = false, large = false }) {
  const classes = ['avatar', empty ? 'ghost' : toneFor(name), small ? 'sm' : '', large ? 'lg' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes} aria-hidden="true">
      {empty ? '' : initials(name)}
    </span>
  )
}

export function StateArt() {
  return (
    <svg className="state-art" viewBox="0 0 72 48" fill="none" aria-hidden="true">
      <rect x="1.5" y="10" width="69" height="32" rx="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 30.5 26 20.5 34 27.5 50 15.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="15.5" r="2" fill="currentColor" />
    </svg>
  )
}

export function BlankArt() {
  return (
    <svg className="state-art" viewBox="0 0 72 48" fill="none" aria-hidden="true">
      <path
        d="M8 34.5c8-9 14-9 20 0s12 9 20 0 12-9 16 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="16" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

const icon = { size: 15, strokeWidth: 1.75, 'aria-hidden': true, className: 'icon' }

export function IconList() {
  return <List {...icon} />
}

export function IconBoard() {
  return <Columns3 {...icon} />
}

export function Dialog({ title, onClose, children }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-back" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function ViewTabs({ label, value, onChange, options }) {
  return (
    <div className="view-tabs">
      <div className="tabs" role="tablist" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={`${label}-${option.value}`}
            aria-selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="tabs-select">
        <span className="sr-only">{label}</span>
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
