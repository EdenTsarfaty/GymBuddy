function PlugOffIcon({ className, size = 80 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="9" y1="2" x2="9" y2="8" />
      <line x1="15" y1="2" x2="15" y2="8" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <path d="M7 8v5a5 5 0 0 0 10 0v-5" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export default PlugOffIcon
