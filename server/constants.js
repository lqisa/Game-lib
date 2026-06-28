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

export { NON_GAME_DIRS, ARCHIVE_EXTENSIONS, VOLUME_PATTERNS };