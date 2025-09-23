using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Messenger.Application.Chat.DTOs;
using Messenger.Application.Chat.Services;
using Messenger.Domain.Enums;

namespace Messenger.API.Hubs;

/// <summary>
/// Хаб для обмена сообщениями в реальном времени между двумя пользователями.
/// </summary>
[Authorize]
public class ChatHub : Hub
{
    private readonly IMessageService _messageService;

    // Словарь UserId → ConnectionId, чтобы знать, кому отправлять.
    private static readonly ConcurrentDictionary<string, string> Connections 
        = new ConcurrentDictionary<string, string>();

    /// <summary>
    /// Конструктор хаба.
    /// </summary>
    /// <param name="messageService">Сервис работы с сообщениями.</param>
    public ChatHub(IMessageService messageService)
    {
        _messageService = messageService;
    }

    /// <summary>
    /// При подключении сохраняем связь UserId → ConnectionId.
    /// </summary>
    public override Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrEmpty(userId))
            Connections[userId] = Context.ConnectionId;
        return base.OnConnectedAsync();
    }

    /// <summary>
    /// При отключении удаляем запись из словаря.
    /// </summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrEmpty(userId))
            Connections.TryRemove(userId, out _);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Вызывается клиентом для отправки нового сообщения.
    /// </summary>
    /// <param name="chatId">ID чата (GUID).</param>
    /// <param name="receiverId">ID получателя (GUID).</param>
    /// <param name="encryptedContent">Зашифрованное тело сообщения.</param>
    /// <param name="encryptedAesKey">Зашифрованный симметричный ключ.</param>
    /// <param name="iv">IV для AES.</param>
    /// <param name="type">Тип сообщения (enum MessageType).</param>
    public async Task SendMessage(
        Guid chatId,
        Guid receiverId,
        string encryptedContent,
        string encryptedAesKey,
        string iv,
        int type)
    {
        // Получаем ID отправителя из токена
        var sid = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (sid == null || !Guid.TryParse(sid, out var senderId))
            throw new HubException("Invalid user identifier");

        // Сохраняем сообщение через сервис
        var dto = await _messageService.SendMessageAsync(senderId, new SendMessageRequest
        {
            ChatId           = chatId,
            ReceiverId       = receiverId,
            EncryptedContent = encryptedContent,
            EncryptedAesKey  = encryptedAesKey,
            Iv               = iv,
            Type             = (MessageType)type
        });

        // Отправляем DTO обратно отправителю
        await Clients.Caller.SendAsync("ReceiveMessage", dto);

        // Если получатель онлайн — шлём ему тоже
        if (Connections.TryGetValue(receiverId.ToString(), out var connId))
            await Clients.Client(connId).SendAsync("ReceiveMessage", dto);
    }
}