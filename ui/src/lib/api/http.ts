import axios, { type AxiosRequestConfig, isAxiosError } from "axios";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const http = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error)) {
      const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
      if (typeof detail === "string" && detail.length > 0) {
        error.message = detail;
      }
    }
    return Promise.reject(error);
  },
);

export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await http.request<T>(config);
  return response.data;
};
