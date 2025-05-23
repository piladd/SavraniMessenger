using System.Security.Claims;
using Messenger.Application.Common.Storage;
using Microsoft.AspNetCore.Mvc;
using Messenger.Application.User.DTOs;
using Messenger.Application.User.Services;

namespace Messenger.API.Endpoints;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/user")
            .WithTags("User")
            .RequireAuthorization();

        // GET /api/user/me
        group.MapGet("/me", async (
                ClaimsPrincipal user,
                [FromServices] IUserService userService)
            =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return Results.Unauthorized();

            var profile = await userService.GetProfileAsync(Guid.Parse(userId));
            return Results.Ok(profile);
        });

        // GET /api/user/search?username=...
        group.MapGet("/search", async (
                [FromQuery] string username,
                [FromServices] IUserService userService)
            =>
        {
            var results = await userService.SearchUsersAsync(username);
            return Results.Ok(results);
        });

        // PUT /api/user/display-name
        group.MapPut("/display-name", async (
                ClaimsPrincipal user,
                [FromBody] UpdateDisplayNameRequest request,
                [FromServices] IUserService userService)
            =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return Results.Unauthorized();

            await userService.UpdateDisplayNameAsync(Guid.Parse(userId), request.DisplayName);
            return Results.NoContent();
        });

        // POST /api/user/avatar
        group.MapPost("/avatar", async (
                ClaimsPrincipal user,
                [FromForm] IFormFile file,
                [FromServices] IStorageService storageService,
                [FromServices] IUserService userService)
            =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return Results.Unauthorized();
            if (file.Length == 0)
                return Results.BadRequest("Файл не предоставлен.");

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var content = ms.ToArray();

            var objectName = await storageService.UploadAsync(file.FileName, content);
            var url = $"/api/attachments/download/{objectName}";

            await userService.SetAvatarUrlAsync(Guid.Parse(userId), url);
            return Results.Ok(new { avatarUrl = url });
        })
        .WithName("UploadAvatar");
    }
}