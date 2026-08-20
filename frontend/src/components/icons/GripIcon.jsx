function GripIcon({ size = 16, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  )
}

export default GripIcon
