// src/store/auth.ts
import { defineStore } from "pinia"
import { login as loginApi, register as registerApi } from "@/services/auth.service"
import { saveToken, getToken, removeToken } from "@/utils/token"
import { loadPrivateKey } from "@/utils/crypto"
import type { AuthResponse } from "@/types/auth"
import { fetchMe } from "@/services/user.service"
import wsService from "@/services/ws.service"
import { useMessageStore } from "./message"
import type { UserDto } from "@/types/User"
import { uploadPublicKey } from "@/services/chat.service"

interface AuthState {
  token: string
  userId: string | null
  username: string | null
  publicKey: string | null
  privateKey: CryptoKey | null
  isAuthenticated: boolean
  currentUser: UserDto | null
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    token: getToken() || "",
    userId: localStorage.getItem("userId") || null,
    username: localStorage.getItem("username") || null,
    publicKey: localStorage.getItem("publicKey") || null,
    privateKey: null,
    isAuthenticated: !!getToken(),
    currentUser: null,
  }),

  actions: {
    /**
     * Логин: сохраняем токен, тянем профиль, заливаем publicKey и стартуем WS
     */
    async login(username: string, password: string): Promise<boolean> {
      try {
        const auth: AuthResponse = await loginApi({ username, password })

        // Сохраняем JWT
        saveToken(auth.token)
        this.token = auth.token

        // Сохраняем данные пользователя
        this.userId = auth.userId
        this.username = auth.username
        this.publicKey = auth.publicKey
        localStorage.setItem("userId", auth.userId)
        localStorage.setItem("username", auth.username)
        localStorage.setItem("publicKey", auth.publicKey)

        // Сохраняем приватный ключ (если есть)
        if (auth.privateKey) {
          localStorage.setItem("privateKeyBase64", auth.privateKey)
        }

        // Опционально заливаем publicKey в Key-Store
        try {
          if (this.publicKey) {
            await uploadPublicKey(this.publicKey)
          }
        } catch (e) {
          console.warn("Не удалось загрузить publicKey в KeyStore:", e)
        }

        // Загружаем приватный ключ из IndexedDB или Base64
        try {
          this.privateKey = await loadPrivateKey()
        } catch (e) {
          console.warn("Приватный ключ не загружен:", e)
          this.privateKey = null
        }

        this.isAuthenticated = true

        // Тянем профиль
        await this.loadCurrentUser()

        // Запускаем WebSocket
        // if (this.currentUser?.id) {
        //   await wsService.connect(this.currentUser.id, this.token)
        //   const msgStore = useMessageStore()
        //   wsService.onMessage((msg) => {
        //     if (msg.senderId === msgStore.currentRecipientId) {
        //       msgStore.messages.push(msg)
        //     }
        //   })
        // }

        return true
      } catch (e) {
        console.error("Login error:", e)
        return false
      }
    },

    /**
     * Регистрация: сохраняем токен, заливаем publicKey, тянем профиль и WS
     */
    async register(username: string, password: string): Promise<boolean> {
      try {
        const auth: AuthResponse = await registerApi({ username, password })

        // Сохраняем JWT
        saveToken(auth.token)
        this.token = auth.token

        // Сохраняем данные пользователя
        this.userId = auth.userId
        this.username = auth.username
        this.publicKey = auth.publicKey
        localStorage.setItem("userId", auth.userId)
        localStorage.setItem("username", auth.username)
        localStorage.setItem("publicKey", auth.publicKey)

        // Сохраняем приватный ключ
        if (auth.privateKey) {
          localStorage.setItem("privateKeyBase64", auth.privateKey)
        }

        // Заливаем publicKey в Key-Store
        try {
          if (this.publicKey) {
            await uploadPublicKey(this.publicKey)
          }
        } catch (e) {
          console.warn("Не удалось загрузить publicKey в KeyStore:", e)
        }

        // Загружаем приватный ключ
        try {
          this.privateKey = await loadPrivateKey()
        } catch (e) {
          console.warn("Приватный ключ не загружен:", e)
          this.privateKey = null
        }

        this.isAuthenticated = true

        // Тянем профиль
        await this.loadCurrentUser()

        // Запускаем WebSocket
        // if (this.currentUser?.id) {
        //   await wsService.connect(this.currentUser.id, this.token)
        //   const msgStore = useMessageStore()
        //   wsService.onMessage((msg) => {
        //     if (msg.senderId === msgStore.currentRecipientId) {
        //       msgStore.messages.push(msg)
        //     }
        //   })
        // }

        return true
      } catch (e) {
        console.error("Register error:", e)
        return false
      }
    },

    /** Получение профиля */
    async loadCurrentUser() {
      try {
        this.currentUser = await fetchMe()
      } catch (error) {
        console.error("Ошибка получения пользователя:", error)
        this.currentUser = null
      }
    },

    /** Логаут: чистим всё */
    async logout() {
      try {
        await wsService.disconnect()
      } catch {}
      removeToken()
      this.token = ""
      this.userId = null
      this.username = null
      this.publicKey = null
      this.privateKey = null
      this.isAuthenticated = false
      this.currentUser = null

      localStorage.removeItem("userId")
      localStorage.removeItem("username")
      localStorage.removeItem("publicKey")
      localStorage.removeItem("privateKeyBase64")
    }
  }
})
