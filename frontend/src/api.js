import axios from 'axios';

const api = axios.create({
  // A production build is served by the API itself, so it calls its own origin.
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : 'http://localhost:5000/api'),
  withCredentials: true
});

export default api;
