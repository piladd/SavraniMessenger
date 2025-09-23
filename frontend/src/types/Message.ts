export interface MessageDto {
    id: string
    chatId?: string
    senderId: string
    receiverId: string
    senderName: string
    senderAvatar: string | null
    encryptedContent: string | null
    encryptedAesKey: string | null
    iv: string | null
    createdAt: string
    decryptedContent?: string | null
    plainText?: string
}


export interface SendMessageRequest {
    receiverId:      string   // Guid получателя
    chatId:          string   // Guid чата
    encryptedContent:string
    encryptedAesKey: string
    iv:              string
    type?:           number
}
  