const NON_GAME_DIRS = new Set([
  'www', 'audio', 'img', 'data', 'js', 'fonts', 'movies', 'save', 'icon', 'css',
  'graphics', 'system',
  'savedata', 'bgm', 'se', 'voice', 'vo', 'fg', 'bg', 'rule', 'scenario', 'image',
  'patch', 'patch2', 'others', 'anim', 'env', 'ubin',
  'game', 'cache', 'saves', 'tl', 'gui', 'log', 'persistent', 'renpy',
  'managed', 'plugins', 'resources', 'streamingassets', 'monobleedingedge',
  'graphic', 'sound',
  'dat', 'cg',
  'music', 'me', 'config', 'script', 'plugin', 'mods', 'mod',
  'temp', 'tmp', 'logs', 'backup', 'screenshot', 'screenshots',
  'thumbnail', 'thumbnails', 'thumb', 'doc', 'manual', 'readme',
  'video', 'dlc', 'extra', 'extras', 'bonus',
  'images', 'font', 'icons', 'update', 'crack', 'dll', 'lib', 'libs',
  'docs', 'help', 'tool', 'tools', 'sdk', 'assets', 'resource',
  'locale', 'lang', 'localization', 'i18n', 'conf', 'cfg', 'settings',
  'profile', 'profiles', 'userdata', 'user', 'meta', 'info',
  'en', 'zh', 'ja', 'ko', 'cn', 'tw',
]);

const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.7z', '.rar',
  '.001', '.002', '.003', '.004', '.005',
  '.006', '.007', '.008', '.009',
]);

const VOLUME_PATTERNS = [
  /^(.+)\.7z\.\d+$/,
  /^(.+)\.zip\.\d+$/i,
  /^(.+)\.part\d+\.rar$/i,
  /^(.+)\.rar\.r\d+$/i,
];

const EXTRACT_TOOL_PATHS = {
  unrar: [
    'C:\\Program Files\\WinRAR\\UnRAR.exe',
    'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
  ],
  sevenzip: [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ],
  sevenzipZstd: [
    'C:\\Program Files\\7-Zip-ZStandard\\7z.exe',
    `${process.env.LOCALAPPDATA || ''}\\Programs\\7-Zip-ZStandard\\7z.exe`,
  ],
};

const FORMAT_TOOL_PRIORITY = {
  '.rar': ['unrar', 'sevenzip'],
  '.zip': ['unrar', 'sevenzip'],
  '.7z': ['sevenzip', 'sevenzipZstd'],
  '.zst': ['sevenzipZstd'],
};

const COMPRESS_TOOL_PATHS = {
  winrar: [
    'C:\\Program Files\\WinRAR\\rar.exe',
    'C:\\Program Files (x86)\\WinRAR\\rar.exe',
  ],
};

export { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS, EXTRACT_TOOL_PATHS, FORMAT_TOOL_PRIORITY, COMPRESS_TOOL_PATHS };