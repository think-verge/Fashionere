import axios, { type AxiosRequestConfig, isAxiosError } from "axios";

export const http = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("fash_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error)) {
      if (error.response?.status === 401) {
        localStorage.removeItem("fash_token");
        localStorage.removeItem("fash_user");
        localStorage.removeItem("fash_project");
        window.location.href = "/login";
      }
      const detail = (error.response?.data as { detail?: unknown; error?: unknown } | undefined)?.detail
        ?? (error.response?.data as { error?: unknown } | undefined)?.error;
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
