// Magnifying glass with two AI sparkles — the same 4-point concave-sided
// star shape GenerateIcon uses, drawn inline here rather than composing two
// separate icons side by side. Glass is stroked (matching SearchIcon), the
// stars are filled, so both share currentColor but keep their own weight.
function AiSearchIcon({ size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="8.5" cy="14.5" r="5.5" />
      <line x1="16.5" y1="22.5" x2="12.4" y2="18.4" />
      <path
        fill="currentColor"
        stroke="none"
        d="M18.5,0.8 C18.5,4.7 19.8,6 23.7,6 C19.8,6 18.5,7.3 18.5,11.2 C18.5,7.3 17.2,6 13.3,6 C17.2,6 18.5,4.7 18.5,0.8 Z"
      />
      <path
        fill="currentColor"
        stroke="none"
        d="M10,0.9 C10,2.85 10.65,3.5 12.6,3.5 C10.65,3.5 10,4.15 10,6.1 C10,4.15 9.35,3.5 7.4,3.5 C9.35,3.5 10,2.85 10,0.9 Z"
      />
    </svg>
  )
}

export default AiSearchIcon
