const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

function SunIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4.5" />
      {RAY_ANGLES.map((deg) => (
        <line key={deg} x1="12" y1="1" x2="12" y2="3.5" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  )
}

export default SunIcon
