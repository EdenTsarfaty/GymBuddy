function CalendarIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />

      {/* day grid: a couple of muted "past" cells and one bright "today" cell */}
      <rect x="5.4" y="11.2" width="2.6" height="2.6" rx="0.6" fill="currentColor" opacity="0.3" />
      <rect x="10.7" y="11.2" width="2.6" height="2.6" rx="0.6" fill="currentColor" opacity="0.3" />
      <rect x="16" y="11.2" width="2.6" height="2.6" rx="0.6" fill="var(--accent)" />
      <rect x="5.4" y="15.4" width="2.6" height="2.6" rx="0.6" fill="currentColor" opacity="0.15" />
      <rect x="10.7" y="15.4" width="2.6" height="2.6" rx="0.6" fill="currentColor" opacity="0.15" />
      <rect x="16" y="15.4" width="2.6" height="2.6" rx="0.6" fill="currentColor" opacity="0.15" />
    </svg>
  )
}

export default CalendarIcon
