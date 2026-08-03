import { useEffect, useRef } from 'react'
import lottie from 'lottie-web'
import loadingDark from '../assets/loading_dark.json'

function hexToNormalized(hex) {
  const h = hex.replace('#', '').trim()
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]
}

function recolorLottie(data, accentHex) {
  const [r, g, b] = hexToNormalized(accentHex)
  const clone = JSON.parse(JSON.stringify(data))
  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(traverse); return }
    if (obj.ty === 'fl' && Array.isArray(obj.c?.k)) obj.c.k = [r, g, b, 1]
    if (obj.ty === 'st' && Array.isArray(obj.c?.k)) obj.c.k = [r, g, b, 1]
    if (obj.nm === 'Map White To' && Array.isArray(obj.v?.k)) obj.v.k = [r, g, b, 1]
    Object.values(obj).forEach(traverse)
  }
  traverse(clone)
  return clone
}

function LottiePlayer({ size = 210 }) {
  const ref = useRef(null)
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: recolorLottie(loadingDark, accent),
    })
    return () => anim.destroy()
  }, [])
  return <div ref={ref} style={{ width: size, height: size }} />
}

export default LottiePlayer
