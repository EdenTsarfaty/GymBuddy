const { getEncoding } = require('js-tiktoken')

// Neither gpt-5.4-* nor gpt-5.6-* is a model tiktoken recognises by name, so
// we pick the encoding directly rather than via encoding_for_model —
// o200k_base is what OpenAI's modern (gpt-4o and later) models use.
const encoding = getEncoding('o200k_base')

function countTokens(text) {
  if (!text) return 0
  return encoding.encode(text).length
}

module.exports = { countTokens }
