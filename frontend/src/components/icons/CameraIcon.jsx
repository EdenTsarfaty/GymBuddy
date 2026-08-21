function CameraIcon({ size = 18, className }) {
  return (
    <svg width={size} height={size * (102 / 126)} viewBox="-13 -1 126 102" fill="currentColor" className={className}>
      <g transform="translate(0,-952.36218)">
        <path d="m 38,968.36217 -5,10 -18,0 c -3.878,0 -7,3.12199 -7,7 l 0,44.00003 c 0,3.878 3.122,7 7,7 l 70,0 c 3.878,0 7,-3.122 7,-7 l 0,-44.00003 c 0,-3.87801 -3.122,-7 -7,-7 l -18,0 -5,-10 z m 12,21 c 9.9412,0 18,8.05891 18,18.00003 0,9.9411 -8.0588,18 -18,18 -9.941,0 -18,-8.0589 -18,-18 0,-9.94112 8.059,-18.00003 18,-18.00003 z" />
      </g>
    </svg>
  )
}

export default CameraIcon
