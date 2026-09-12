// Temporarily rewrites every word on screen to "meow" (see the logo easter
// egg in App.jsx). Done by walking text nodes rather than threading a flag
// through every component, so it covers all copy — including strings that
// came from the server — without any component knowing about it.
//
// Only text nodes are touched, never attributes, so aria-labels, titles and
// input values keep their real content: the joke stays visual and doesn't
// reach assistive tech or anything the app actually submits.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'])

// Any token holding a digit is left alone, so weights, reps, dates, streak
// counts and the version string all stay readable — "Best streak: 5 days"
// becomes "Meow meow 5 meow" (punctuation bound to a word goes with it).
// Deliberately "contains a digit" rather than
// "is entirely numeric", which keeps units attached to their number ("12kg",
// "3x10") intact instead of meowing half of a set.
const HAS_DIGIT = /\d/

// Replaces each run of non-whitespace, so the original spacing and word
// count survive. Only a leading word gets the capital: if a number starts
// the text, the words after it read as mid-phrase and stay lowercase.
function meowText(text) {
  let first = true
  return text.replace(/\S+/g, (token) => {
    if (HAS_DIGIT.test(token)) {
      first = false
      return token
    }
    const word = first ? 'Meow' : 'meow'
    first = false
    return word
  })
}

export function meowifyDocument(root = document.body) {
  // node -> { original, meowed }. Keeping the meowed value lets a later pass
  // tell our own output apart from text React has since re-rendered.
  const touched = new Map()

  function apply() {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT
        if (node.parentElement && SKIP_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    const nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)

    for (const node of nodes) {
      const seen = touched.get(node)
      // Untouched, or React has replaced the text since we last saw it — in
      // the latter case the newer text becomes what we restore later, so a
      // value that changed mid-egg doesn't get rolled back to a stale one.
      if (seen && node.nodeValue === seen.meowed) continue
      const meowed = meowText(node.nodeValue)
      // All-digit text comes back unchanged — nothing to record or restore.
      if (meowed === node.nodeValue) continue
      touched.set(node, { original: node.nodeValue, meowed })
      node.nodeValue = meowed
    }
  }

  // React re-renders and the egg's own spawning both mutate the tree, so
  // reapply on any change. Disconnected around apply() so our own writes
  // don't retrigger the observer.
  const observer = new MutationObserver(() => {
    observer.disconnect()
    apply()
    observer.observe(root, { childList: true, characterData: true, subtree: true })
  })

  apply()
  observer.observe(root, { childList: true, characterData: true, subtree: true })

  return function restore() {
    observer.disconnect()
    for (const [node, { original, meowed }] of touched) {
      // Leave anything React has rewritten since — that text is already current.
      if (node.nodeValue === meowed) node.nodeValue = original
    }
    touched.clear()
  }
}
