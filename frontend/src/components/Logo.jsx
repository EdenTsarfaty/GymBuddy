import logoSvgRaw from '../assets/logo.svg?raw'

// The source file's declared viewBox (0 0 1024 1024) is much larger than the
// actual artwork (which only spans roughly x:184-843, y:231-704), leaving
// large built-in margins. Crop the viewBox to the real content, plus a small
// padding, so the art fills its box instead of floating in empty space.
const CONTENT_VIEWBOX = '144 202 739 530'
const CONTENT_ASPECT = 739 / 530

const coloredSvg = logoSvgRaw
  .replace(/fill="#000000"/g, 'fill="currentColor"')
  .replace(/stroke="#000000"/g, 'stroke="currentColor"')
  .replace(/viewBox="[^"]*"/, `viewBox="${CONTENT_VIEWBOX}"`)
  .replace('<svg ', '<svg style="width:100%;height:100%;display:block" ')

function Logo({ height = 40, className }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        height,
        width: height * CONTENT_ASPECT,
        lineHeight: 0,
      }}
      dangerouslySetInnerHTML={{ __html: coloredSvg }}
    />
  )
}

export default Logo
