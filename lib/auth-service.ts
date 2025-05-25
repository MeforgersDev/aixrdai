const API_BASE_URL = "https://api.meforgers.com"

class AuthService {
  private accessToken: string | null = null

  constructor() {
    if (typeof window !== "undefined") {
      this.accessToken = localStorage.getItem("access_token")
    }
  }

  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Giriş başarısız" }))
      throw new Error(error.message || "Giriş başarısız")
    }

    const data = await response.json()
    this.accessToken = data.access_token

    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", data.access_token)
    }

    return data
  }

  async register(email: string, password: string, name?: string) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password, name }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Kayıt başarısız" }))
      throw new Error(error.message || "Kayıt başarısız")
    }

    const data = await response.json()
    this.accessToken = data.access_token

    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", data.access_token)
    }

    return data
  }

  async refresh() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })

    if (!response.ok) {
      this.logout()
      throw new Error("Token yenileme başarısız")
    }

    const data = await response.json()
    this.accessToken = data.access_token

    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", data.access_token)
    }

    return data
  }

  async logout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: this.getAuthHeaders(),
      })
    } catch (error) {
      console.error("Logout error:", error)
    }

    this.accessToken = null
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token")
    }
  }

  getToken(): string | null {
    return this.accessToken
  }

  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`
    }

    return headers
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}) {
    const requestOptions = {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      credentials: "include" as RequestCredentials,
    }

    let response = await fetch(url, requestOptions)

    // If token expired, try to refresh
    if (response.status === 401) {
      try {
        await this.refresh()
        requestOptions.headers = {
          ...this.getAuthHeaders(),
          ...options.headers,
        }
        response = await fetch(url, requestOptions)
      } catch (error) {
        throw new Error("Oturum süresi doldu, lütfen tekrar giriş yapın")
      }
    }

    return response
  }
}

export const authService = new AuthService()
