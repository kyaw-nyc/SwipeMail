import { useState } from 'react'

function TimeRangeSelector({ currentRange, onRangeChange }) {
  const [isOpen, setIsOpen] = useState(false)

  const timeRangeOptions = [
    {
      id: '1d',
      label: 'Last 24 hours',
      shortLabel: '24h',
      icon: '🕐',
      days: 1
    },
    {
      id: '3d',
      label: 'Last 3 days',
      shortLabel: '3d',
      icon: '🗓️',
      days: 3
    },
    {
      id: '1w',
      label: 'Last week',
      shortLabel: '1w',
      icon: '📅',
      days: 7
    },
    {
      id: '2w',
      label: 'Last 2 weeks',
      shortLabel: '2w',
      icon: '📆',
      days: 14
    },
    {
      id: '1m',
      label: 'Last month',
      shortLabel: '1m',
      icon: '🗓️',
      days: 30
    },
    {
      id: '3m',
      label: 'Last 3 months',
      shortLabel: '3m',
      icon: '📅',
      days: 90
    },
    {
      id: 'all',
      label: 'All time',
      shortLabel: 'All',
      icon: '♾️',
      days: null
    }
  ]

  const handleOptionSelect = (option) => {
    onRangeChange(option)
    setIsOpen(false)
  }

  return (
    <div className="time-range-dropdown">
      <button
        className="time-range-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="time-range-current">
          <span className="time-range-icon">{currentRange?.icon || '🕐'}</span>
          <span className="time-range-text">{currentRange?.label || 'Last week'}</span>
        </span>
        <span className="time-range-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="time-range-menu">
          {timeRangeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option)}
              className={`time-range-option ${currentRange?.id === option.id ? 'active' : ''}`}
            >
              <span className="time-range-icon">{option.icon}</span>
              <span className="time-range-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default TimeRangeSelector