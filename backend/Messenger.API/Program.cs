using Minio;
using Microsoft.Extensions.Options;
using Messenger.Application.Common.Storage;
using System.Text;
using Messenger.API.Endpoints;
using Messenger.Application.Attachment.Interfaces;
using Messenger.Application.Attachment.Services;
using Messenger.Application.Auth.Services;
using Messenger.Application.Chat.Services;
using Messenger.Application.Interfaces;
using Messenger.Application.User.Services;
using Messenger.Persistence.DbContext;
using Messenger.Persistence.Repositories;
using Messenger.Security.Encryption;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using AttachmentRepository = Messenger.Persistence.Repositories.AttachmentRepository;
using MinioStorageService = Messenger.Application.Common.Storage.MinioStorageService;

var builder = WebApplication.CreateBuilder(args);

// =======================
// 1. Конфигурация из appsettings.json:
//    • ConnectionStrings:DefaultConnection
//    • Security:MasterKey
//    • Jwt:Secret, Jwt:Issuer, Jwt:Audience, Jwt:ExpiresHours
//    • Logging:Minio (Endpoint, AccessKey, SecretKey, BucketName, UseSSL)

// 2. EF Core + PostgreSQL
builder.Services.AddDbContext<MessengerDbContext>(opts =>
    opts.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
);

// 3. EncryptionService
builder.Services.AddSingleton<EncryptionService>();
builder.Services.AddScoped<IStorageService, MinioStorageService>();

// 4. Репозитории
builder.Services.AddScoped<AttachmentRepository>();
builder.Services.AddScoped<ChatRepository>();
builder.Services.AddScoped<MessageRepository>();
builder.Services.AddScoped<UserRepository>();

// 5. Сервисы уровня Auth.Application
builder.Services.AddScoped<IAuthService,      AuthService>();
builder.Services.AddScoped<IChatService,      ChatService>();
builder.Services.AddScoped<IMessageService,   MessageService>();
builder.Services.AddScoped<IAttachmentService, AttachmentService>();
builder.Services.AddScoped<IUserService,      UserService>();
builder.Services.AddScoped<IKeyStoreService,  KeyStoreService>();

// 6. MinIO-хранилище
builder.Services.Configure<MinioOptions>(
    builder.Configuration.GetSection("Minio")
);
builder.Services.AddSingleton<MinioClient>(sp =>
{
    var opts = sp.GetRequiredService<IOptions<MinioOptions>>().Value;
    return (new MinioClient()
        .WithEndpoint(opts.Endpoint)
        .WithCredentials(opts.AccessKey, opts.SecretKey)
        .WithSSL(opts.UseSsl) as MinioClient)!;
});

// 7. CORS для фронтенда
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalDev", policy =>
    {
        policy
          .WithOrigins("https://localhost:5173")   // фронтенд
          .AllowAnyMethod()
          .AllowAnyHeader()
          .AllowCredentials();
    });
});

// 8. Swagger / OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Messenger Auth.API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Bearer authorization",
        Name        = "Authorization",
        In          = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type        = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme      = JwtBearerDefaults.AuthenticationScheme
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        [ new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id   = JwtBearerDefaults.AuthenticationScheme
                }
            }
        ] = Array.Empty<string>()
    });
});

// 9. JWT-аутентификация
var jwtSecret = builder.Configuration["Jwt:Secret"]
                ?? throw new InvalidOperationException("Jwt:Secret missing");
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.RequireHttpsMetadata = false;
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer           = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidateAudience         = true,
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            ValidateLifetime         = true
        };

        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                var path = ctx.HttpContext.Request.Path;
                // если запрос идёт на наш хаб
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/chat"))
                    ctx.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// 10. Controllers / Endpoints
builder.Services.AddControllers();
builder.Services.AddSignalR();

var app = builder.Build();

// === Pipeline ===

app.UseHttpsRedirection();

app.UseRouting();

// Разрешаем CORS именно здесь — после маршрутизации и до авторизации
app.UseCors("AllowLocalDev");

app.UseAuthentication();
app.UseAuthorization();

// Swagger/UI
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Messenger Auth.API V1");
});

// === Endpoint-грoуппы ===

app.MapControllers();
app.MapAttachmentEndpoints();
app.MapUserEndpoints();
app.MapChatEndpoints();
app.MapAuthEndpoints();
app.MapKeyExchangeEndpoints();
app.MapMessageEndpoints();

app.MapHub<Messenger.API.Hubs.ChatHub>("/hubs/chat");

// Авто-добавление миграций
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MessengerDbContext>();
    db.Database.Migrate();
}

app.Run();
