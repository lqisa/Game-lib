export function useExpressUrl() {
  const isDev = import.meta.env.DEV;
  const rawPort = import.meta.env.VITE_API_PORT;
  const expressPort = rawPort ? parseInt(String(rawPort), 10) : 19700;
  const baseUrl = isDev ? `http://127.0.0.1:${expressPort}` : '';

  return {
    getApiUrl: (path: string) => `${baseUrl}/api${path}`,
    getCoversUrl: (path: string) => `${baseUrl}/covers/${path}`,
    getProxyImageUrl: (remoteUrl: string) => {
      if (!remoteUrl) return '';
      return `${baseUrl}/api/proxy/image?url=${encodeURIComponent(remoteUrl)}`;
    },
    resolveCoverUrl: (coverUrl: string) => {
      if (!coverUrl) return '';
      if (coverUrl.startsWith('/covers/')) {
        return `${baseUrl}${coverUrl}`;
      }
      if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
        return `${baseUrl}/api/proxy/image?url=${encodeURIComponent(coverUrl)}`;
      }
      return `${baseUrl}${coverUrl}`;
    },
    baseUrl,
  };
}
