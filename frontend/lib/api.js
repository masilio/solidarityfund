import axios from "axios";

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("sf_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== "undefined" && err.response?.status === 401) {
      localStorage.removeItem("sf_token");
      localStorage.removeItem("sf_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
