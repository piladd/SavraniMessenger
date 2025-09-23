// frontend/src/services/ws.service.ts
import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { MessageDto } from "@/types/Message";

export class WsService {
  private connection: HubConnection | null = null;

  async connect(userId: string, token: string): Promise<void> {
    if (this.connection) return;

    const url = import.meta.env.VITE_WS_URL!;
    if (!url) throw new Error("VITE_WS_URL не задан в .env");
    console.log("🛰️ SignalR connecting to:", url);

    this.connection = new HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    await this.connection.start();
    console.log("🛰️ SignalR connected");
  }

  async joinChat(chatId: string): Promise<void> {
    if (!this.connection) throw new Error("SignalR не подключён");
    await this.connection.invoke("JoinChat", chatId);
  }

  /**
   * Подписываемся сразу на все три возможных варианта имени события,
   * чтобы точно «поймать» вызов сервера.
   */
  onMessage(cb: (msg: MessageDto) => void): void {
    if (!this.connection) throw new Error("SignalR не подключён");

    const eventNames = [
      "ReceiveMessage",   // PascalCase
      "receiveMessage",   // camelCase
      "receivemessage",   // lowercase
    ];

    for (const name of eventNames) {
      this.connection.on(name, (payload: unknown) => {
        console.log(`🔔 WS got (${name}):`, payload);
        cb(payload as MessageDto);
      });
    }
  }

  async send(msg: {
    chatId: string;
    receiverId: string;
    encryptedContent: string;
    encryptedAesKey: string;
    iv: string;
    type: number;
  }): Promise<void> {
    if (!this.connection) throw new Error("SignalR не подключён");
    await this.connection.invoke(
      "SendMessage",
      msg.chatId,
      msg.receiverId,
      msg.encryptedContent,
      msg.encryptedAesKey,
      msg.iv,
      msg.type
    );
  }

  async disconnect(): Promise<void> {
    await this.connection?.stop();
    this.connection = null;
  }
}

export default new WsService();
