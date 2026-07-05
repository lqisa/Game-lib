import axios from 'axios';
import { useExpressUrl } from './useExpressUrl';

const { getApiUrl } = useExpressUrl();

const api = axios.create({
  baseURL: getApiUrl(''),
  timeout: 30000,
});

export const useApi = () => api;

export default api;