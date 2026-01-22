# Fantasy Markets Platform - Matrix Chat Stack

This directory contains the Matrix homeserver setup for the Fantasy Markets platform, providing federated chat capabilities with bridges to Discord, Slack, and Telegram.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Fantasy Markets Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  Mobile App  │     │   Web App    │     │   API Server │    │
│  │  (React      │     │  (Next.js)   │     │   (Hono)     │    │
│  │   Native)    │     │              │     │              │    │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   Matrix Stack    │                        │
│                    ├───────────────────┤                        │
│  ┌─────────────────┤     Synapse      ├─────────────────┐      │
│  │                 │   (Homeserver)   │                 │      │
│  │                 └─────────┬────────┘                 │      │
│  │                           │                          │      │
│  │    ┌──────────────────────┼──────────────────────┐  │      │
│  │    │                      │                      │  │      │
│  ▼    ▼                      ▼                      ▼  ▼      │
│ ┌────────┐  ┌────────────┐  ┌───────────┐  ┌────────────┐    │
│ │Element │  │  Discord   │  │   Slack   │  │  Telegram  │    │
│ │  Web   │  │   Bridge   │  │   Bridge  │  │   Bridge   │    │
│ └────────┘  └─────┬──────┘  └─────┬─────┘  └─────┬──────┘    │
│                   │               │               │           │
└───────────────────┼───────────────┼───────────────┼───────────┘
                    │               │               │
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │ Discord  │   │  Slack   │   │ Telegram │
              └──────────┘   └──────────┘   └──────────┘
```

## Components

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| synapse | matrixdotorg/synapse:v1.98.0 | 8008, 8448 | Matrix homeserver |
| postgres-matrix | postgres:16-alpine | 5432 | Synapse database |
| redis-matrix | redis:7-alpine | 6379 | Synapse caching |
| element | vectorim/element-web:v1.11.52 | 8080 | Matrix web client |
| mautrix-discord | dock.mau.dev/mautrix/discord:v0.6.5 | 29334 | Discord bridge |
| mautrix-slack | dock.mau.dev/mautrix/slack:v0.1.0 | 29335 | Slack bridge |
| mautrix-telegram | dock.mau.dev/mautrix/telegram:v0.15.1 | 29336 | Telegram bridge |

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 2. Initialize the Stack

```bash
chmod +x scripts/*.sh
./scripts/init.sh
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Create Admin User

```bash
docker exec -it matrix-synapse register_new_matrix_user \
  -c /data/homeserver.yaml \
  -a -u admin
```

### 5. Access Services

- **Element Web**: http://localhost:8080
- **Synapse API**: http://localhost:8008

## League Integration

### Creating Rooms for a League

```bash
./scripts/create-league-rooms.sh <league_id> "<league_name>"
```

This creates:
- Main league chat
- Trade discussion room
- Waiver wire room
- Trash talk room
- Commissioner announcements

### Inviting Users to League Rooms

Use the Matrix Admin API or the fantasy backend to invite users:

```bash
curl -X POST "http://localhost:8008/_matrix/client/v3/rooms/{roomId}/invite" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "@username:matrix.fantasy.local"}'
```

## Bridge Configuration

### Discord Bridge

1. No Discord bot token required for user login bridging
2. Users run `!discord login` in a DM with the bridge bot
3. Scans QR code to link their Discord account

### Slack Bridge

1. Users run `!slack login` in a DM with the bridge bot
2. Follows OAuth flow to connect Slack workspace

### Telegram Bridge

1. Get API credentials from https://my.telegram.org
2. Add to `.env`:
   ```
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   ```
3. Users run `!tg login` to link their Telegram account

## Production Deployment

### SSL/TLS

Use a reverse proxy (nginx, Traefik, Caddy) to terminate SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name matrix.fantasy.local;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /_matrix {
        proxy_pass http://localhost:8008;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_synapse {
        proxy_pass http://localhost:8008;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

### Federation

To enable federation with other Matrix servers:

1. Set up proper DNS (SRV records or .well-known)
2. Open port 8448 for federation traffic
3. Remove `federation_disabled: true` from homeserver.yaml

### Scaling

For larger deployments:
1. Use external PostgreSQL cluster
2. Deploy Redis Sentinel/Cluster
3. Run multiple Synapse workers
4. Use S3-compatible storage for media

## Maintenance

### Backup

```bash
# Database
docker exec matrix-postgres pg_dump -U synapse synapse > backup.sql

# Media
docker cp matrix-synapse:/data/media_store ./media_backup
```

### Logs

```bash
# Synapse logs
docker logs -f matrix-synapse

# Bridge logs
docker logs -f matrix-bridge-discord
docker logs -f matrix-bridge-slack
docker logs -f matrix-bridge-telegram
```

### Health Check

```bash
curl http://localhost:8008/health
```

## Troubleshooting

### Bridge Not Connecting

1. Check bridge logs for errors
2. Verify registration file is in synapse/bridges/
3. Restart synapse after adding new registrations

### Database Connection Issues

1. Ensure postgres-matrix is healthy
2. Check database credentials in configs
3. Verify bridge databases exist

### Element Can't Connect

1. Check Element config.json has correct homeserver URL
2. Verify CORS headers if using different domains
3. Check browser console for errors

## Security Considerations

1. **Change all default secrets** in production
2. **Enable rate limiting** for public-facing endpoints
3. **Use strong passwords** for all accounts
4. **Regular backups** of database and media
5. **Monitor logs** for suspicious activity
6. **Keep images updated** for security patches
