// Archive suffix, including split volumes: game.7z.001, game.part1.rar, game.rar.r00,
// game.rar.001, or a plain game.rar / game.zip / game.7z.
// Single source of truth - ScannerDialog used to keep its own (slightly different) copies.
const ARCHIVE_EXT_RE =
  /\.(?:7z|zip)\.\d+$|\.part\d+\.rar$|\.rar(?:\.(?:r\d+|\d+))?$|\.(?:zip|7z)$/i;

const getCleanedName = (name: string) =>
  name
    .replace(ARCHIVE_EXT_RE, '')
    .replace(/_+/g, ' ')
    .replace(/【.*?】/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\s*\((?<!RJ)\s*[\d.]+\s*\)/g, '')
    .replace(/\s*[Vv](?:er)?\d+(\.\d+)*$/gi, '')
    .replace(/\s+\d+(\.\d+)+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\-_]+|[\s.\-_]+$/g, '');

const splitKeyword = (name: string): { keyword: string; segments: string[] } => {
  const cleaned = getCleanedName(name);
  const rjMatch = cleaned.match(/RJ\d+/);
  if (rjMatch) return { keyword: rjMatch[0], segments: [rjMatch[0]] };
  const re =
    /[\u4e00-\u9fff\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a\u0041-\u005a\u0061-\u007a\u0030-\u0039]+/g;
  const segments = cleaned.match(re) || [];
  return { keyword: cleaned, segments };
};

const segmentsCache = new Map<string, string[]>();

export { splitKeyword, segmentsCache, getCleanedName, ARCHIVE_EXT_RE };
