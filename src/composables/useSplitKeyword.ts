const getCleanedName = (name: string) =>
  name
  .replace(/【.*?】/g, '')
  .replace(/（.*?）/g, '')
  .replace(/\s*\((?<!RJ)\s*[\d.]+\s*\)/g, '')
  .replace(/\s*[Vv](?:er)?\d+(\.\d+)*/gi, '')
  .replace(/\s+\d+(\.\d+)+/g, '')
  .trim()

const splitKeyword = (name: string): { keyword: string; segments: string[] } => {
  const cleaned = getCleanedName(name)
  const rjMatch = cleaned.match(/RJ\d+/)
  if (rjMatch) return { keyword: rjMatch[0], segments: [rjMatch[0]] }
  const re = /[\u4e00-\u9fff\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a\u0041-\u005a\u0061-\u007a\u0030-\u0039]+/g
  const segments = cleaned.match(re) || []
  return { keyword: cleaned, segments }
}

const segmentsCache = new Map<string, string[]>()

export { splitKeyword, segmentsCache, getCleanedName }