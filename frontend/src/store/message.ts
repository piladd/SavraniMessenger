// src/store/message.ts
import { defineStore } from 'pinia'
import api from '@/services/api'
import { getMessages, sendMessage } from '@/services/chat.service'
import wsService from '@/services/ws.service'
import { encryptForRecipient, decryptMessageContent } from '@/utils/crypto'
import { useAuthStore } from '@/store/auth'
import type { MessageDto } from '@/types/Message'

interface MessageState {
  currentRecipientId: string | null
  currentChatId:       string | null
  messages:            (MessageDto & { decryptedContent?: string; plainText?: string })[]
  isLoading:           boolean
  error:               string | null
}

export const useMessageStore = defineStore('message', {
  state: (): MessageState => ({
    currentRecipientId: null,
    currentChatId:      null,
    messages:           [],
    isLoading:          false,
    error:              null,
  }),

  actions: {
    /** Создаём или получаем chatId, грузим историю и подписываемся на WS */
    async startDialog(recipientId: string) {
      this.isLoading = true
      this.error     = null

      try {
        // ——— 1) HTTP: получить/создать чат ———
        const { data } = await api.post<{ chatId: string }>(
            '/api/chat/start',
            { interlocutorId: recipientId }
        )
        this.currentChatId      = data.chatId
        this.currentRecipientId = recipientId

        // ——— 2) HTTP: загрузить и обрабатывать историю ———
        const msgs = await getMessages(this.currentChatId)
        const auth = useAuthStore()
        this.messages = await Promise.all(
            msgs.map(async msg => {
              // Вариант B: не расшифровываем свои сообщения, используем plaintext
              let clear: string
              if (msg.senderId === auth.userId) {
                clear = msg.plainText ?? ''
              } else {
                clear = await decryptMessageContent(msg)
              }
              return {
                ...msg,
                decryptedContent: clear,
              }
            })
        )

        // ——— 3) WS: коннект + joinChat + onMessage ———
        // если ещё не подключены — подключаемся
        await wsService.connect(auth.userId!, auth.token)
        // заходим в группу чата
        // await wsService.joinChat(this.currentChatId!)
        // подписываемся на новые
        // внутри startDialog, вместо текущего:
        // ——— 3) WS: подписка на новые сообщения ———
        await wsService.joinChat(this.currentChatId!)
        wsService.onMessage(async (msg: MessageDto) => {
          // 1) не наш чат — игнорируем
          if (msg.chatId !== this.currentChatId) return

          // 2) уже есть такое сообщение — игнорируем
          if (this.messages.some(m => m.id === msg.id)) {
            console.log('skip duplicate msg', msg.id)
            return
          }

          // 3) иначе дешифруем и пушим
          const auth  = useAuthStore()
          const clear = msg.senderId === auth.userId
            ? msg.plainText ?? ''
            : await decryptMessageContent(msg)

          this.messages.push({
            ...msg,
            decryptedContent: clear,
          })
        })
      } catch (e: any) {
        this.error = e.message || 'Ошибка при старте диалога'
      } finally {
        this.isLoading = false
      }
    },

    /** Грузим и обрабатываем историю сообщений */
    async loadMessages(recipientId: string): Promise<void> {
      console.warn("1")
      if (!this.currentChatId || this.currentRecipientId !== recipientId) {
        console.warn("2")
        await this.startDialog(recipientId)
        return this.loadMessages(recipientId)
      }
      this.isLoading = true
      this.error     = null
      try {
        const msgs = await getMessages(this.currentChatId)
        const auth = useAuthStore()
        console.warn("3")
        console.warn("curentchatid", this.currentChatId)
        console.warn("currentRecipientId", this.currentRecipientId)
        console.warn("recipientId", recipientId)
        this.messages = await Promise.all(
            msgs.map(async msg => {
              let clear: string
              // console.warn("message: ", msg)
              if (msg.senderId === auth.userId) {
                clear = msg.plainText ?? ''
              } else {
                clear = await decryptMessageContent(msg)
              }
              return { ...msg, decryptedContent: clear }
            })
        )
      } catch (e: any) {
        this.error = e.message || 'Ошибка при загрузке сообщений'
      } finally {
        this.isLoading = false
      }
    },

    /** Шифруем и отправляем сообщение */
    async sendEncryptedMessage(recipientId: string, plaintext: string) {
      if (!this.currentChatId) {
        await this.startDialog(recipientId)
      }

      this.isLoading = true
      this.error     = null

      try {
        // 1) Шифруем текст
        const { encryptedContent, encryptedAesKey, iv } =
            await encryptForRecipient(recipientId, plaintext)

        // 2) Отправляем на бэк
        const msgDto = await sendMessage({
          chatId:           this.currentChatId!,
          receiverId:       recipientId,
          encryptedContent,
          encryptedAesKey,
          iv,
          type:             0
        })

        // 3) Добавляем своё сообщение в UI сразу (plaintext)
        this.messages.push({
          ...msgDto,
          decryptedContent: plaintext,
          plainText:        plaintext,
        })

        // 4) Рассылаем по WebSocket для собеседника
        await wsService.send({
          chatId:           this.currentChatId!,
          receiverId:       recipientId,
          encryptedContent,
          encryptedAesKey,
          iv,
          type:             0
        })
      } catch (e: any) {
        this.error = e.message || 'Ошибка при отправке сообщения'
      } finally {
        this.isLoading = false
      }
    }
  }
})