export function useExpressUrl() {
  const isDev = import.meta.env.DEV;
  const expressPort = 19700;
  const baseUrl = isDev ? `http://127.0.0.1:${expressPort}` : '';

  return {
    getApiUrl: (path: string) => `${baseUrl}/api${path}`,
    getCoversUrl: (path: string) => `${baseUrl}/covers/${path}`,
    getProxyImageUrl: (remoteUrl: string) => {
      if (!remoteUrl) return '';
      return `${baseUrl}/api/proxy/image?url=${encodeURIComponent(remoteUrl)}`;
    },
    baseUrl,
  };
}