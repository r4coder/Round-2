import axios from 'axios'

// Call the backend directly on port 5000, bypassing the Vite dev proxy.
// Uses the current page's hostname so this works whether you're on
// localhost, a LAN IP, or a remote docker host — only the port differs.
const BACKEND_PORT = 5000
const baseURL = `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('velocity_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, clear stored credentials
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('velocity_token')
      localStorage.removeItem('velocity_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api