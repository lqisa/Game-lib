/**
 * Central url builder for every HTTP resource the frontend consumes (API,
 * covers, image proxy).
 *
 * Everything is same-origin:
 *   - production / standalone: the Express server serves the built SPA itself,
 *     so relative urls hit the very server that rendered the page - the app
 *     works from any host/port (phone, another PC) with nothing to configure.
 *   - dev: the Vite dev server proxies /api and /covers to the Express server
 *     (see the renderer vite config), so the page stays same-origin there too.
 *
 * Keeping this in one place is what makes multi-device access trivial: no
 * component ever hardcodes 127.0.0.1 or a port.
 */
export function useExpressUrl() {
  return {
    baseUrl: '',
    getApiUrl: (path: string) => `/api${path}`,
    getCoversUrl: (path: string) => `/covers/${path}`,
    getProxyImageUrl: (remoteUrl: string) => {
      if (!remoteUrl) return '';
      return `/api/proxy/image?url=${encodeURIComponent(remoteUrl)}`;
    },
    resolveCoverUrl: (coverUrl: string) => {
      if (!coverUrl) return '';
      if (coverUrl.startsWith('/covers/')) {
        return coverUrl;
      }
      if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
        return `/api/proxy/image?url=${encodeURIComponent(coverUrl)}`;
      }
      return coverUrl;
    },
  };
}
