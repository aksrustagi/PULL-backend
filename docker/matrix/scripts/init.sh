#!/bin/bash

# Fantasy Markets Platform - Matrix Stack Initialization Script
# This script initializes the Matrix homeserver and bridges

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MATRIX_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Fantasy Markets - Matrix Stack Setup"
echo "========================================"

# Load environment variables
if [ -f "$MATRIX_DIR/.env" ]; then
    export $(cat "$MATRIX_DIR/.env" | grep -v '^#' | xargs)
else
    echo "Warning: .env file not found. Using defaults."
    echo "Copy .env.example to .env and configure before production use."
fi

# Create required directories
echo ""
echo "Creating directories..."
mkdir -p "$MATRIX_DIR/synapse/logs"
mkdir -p "$MATRIX_DIR/synapse/media_store"
mkdir -p "$MATRIX_DIR/bridges/discord/logs"
mkdir -p "$MATRIX_DIR/bridges/slack/logs"
mkdir -p "$MATRIX_DIR/bridges/telegram/logs"

# Generate signing key if it doesn't exist
if [ ! -f "$MATRIX_DIR/synapse/signing.key" ]; then
    echo ""
    echo "Generating Synapse signing key..."
    docker run --rm -v "$MATRIX_DIR/synapse:/data" \
        -e SYNAPSE_SERVER_NAME="${MATRIX_SERVER_NAME:-matrix.fantasy.local}" \
        matrixdotorg/synapse:v1.98.0 generate
    echo "Signing key generated."
fi

# Generate application service registration files
echo ""
echo "Generating application service registrations..."

# Discord bridge registration
if [ ! -f "$MATRIX_DIR/synapse/bridges/discord-registration.yaml" ]; then
    mkdir -p "$MATRIX_DIR/synapse/bridges"

    DISCORD_AS_TOKEN=$(openssl rand -hex 32)
    DISCORD_HS_TOKEN=$(openssl rand -hex 32)

    cat > "$MATRIX_DIR/synapse/bridges/discord-registration.yaml" << EOF
id: discord
url: http://mautrix-discord:29334
as_token: $DISCORD_AS_TOKEN
hs_token: $DISCORD_HS_TOKEN
sender_localpart: discordbot
rate_limited: false
namespaces:
  users:
    - regex: '@discord_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
    - regex: '@discordbot:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
  aliases:
    - regex: '#discord_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
de.sorunome.msc2409.push_ephemeral: true
push_ephemeral: true
EOF

    # Update Discord config with tokens
    sed -i "s/DISCORD_AS_TOKEN:-GENERATE_NEW_TOKEN/DISCORD_AS_TOKEN:-$DISCORD_AS_TOKEN/" "$MATRIX_DIR/bridges/discord/config.yaml"
    sed -i "s/DISCORD_HS_TOKEN:-GENERATE_NEW_TOKEN/DISCORD_HS_TOKEN:-$DISCORD_HS_TOKEN/" "$MATRIX_DIR/bridges/discord/config.yaml"

    echo "  - Discord bridge registration created"
fi

# Slack bridge registration
if [ ! -f "$MATRIX_DIR/synapse/bridges/slack-registration.yaml" ]; then
    mkdir -p "$MATRIX_DIR/synapse/bridges"

    SLACK_AS_TOKEN=$(openssl rand -hex 32)
    SLACK_HS_TOKEN=$(openssl rand -hex 32)

    cat > "$MATRIX_DIR/synapse/bridges/slack-registration.yaml" << EOF
id: slack
url: http://mautrix-slack:29335
as_token: $SLACK_AS_TOKEN
hs_token: $SLACK_HS_TOKEN
sender_localpart: slackbot
rate_limited: false
namespaces:
  users:
    - regex: '@slack_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
    - regex: '@slackbot:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
  aliases:
    - regex: '#slack_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
de.sorunome.msc2409.push_ephemeral: true
push_ephemeral: true
EOF

    sed -i "s/SLACK_AS_TOKEN:-GENERATE_NEW_TOKEN/SLACK_AS_TOKEN:-$SLACK_AS_TOKEN/" "$MATRIX_DIR/bridges/slack/config.yaml"
    sed -i "s/SLACK_HS_TOKEN:-GENERATE_NEW_TOKEN/SLACK_HS_TOKEN:-$SLACK_HS_TOKEN/" "$MATRIX_DIR/bridges/slack/config.yaml"

    echo "  - Slack bridge registration created"
fi

# Telegram bridge registration
if [ ! -f "$MATRIX_DIR/synapse/bridges/telegram-registration.yaml" ]; then
    mkdir -p "$MATRIX_DIR/synapse/bridges"

    TELEGRAM_AS_TOKEN=$(openssl rand -hex 32)
    TELEGRAM_HS_TOKEN=$(openssl rand -hex 32)

    cat > "$MATRIX_DIR/synapse/bridges/telegram-registration.yaml" << EOF
id: telegram
url: http://mautrix-telegram:29336
as_token: $TELEGRAM_AS_TOKEN
hs_token: $TELEGRAM_HS_TOKEN
sender_localpart: telegrambot
rate_limited: false
namespaces:
  users:
    - regex: '@telegram_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
    - regex: '@telegrambot:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
  aliases:
    - regex: '#telegram_.*:${MATRIX_SERVER_NAME:-matrix.fantasy.local}'
      exclusive: true
de.sorunome.msc2409.push_ephemeral: true
push_ephemeral: true
EOF

    sed -i "s/TELEGRAM_AS_TOKEN:-GENERATE_NEW_TOKEN/TELEGRAM_AS_TOKEN:-$TELEGRAM_AS_TOKEN/" "$MATRIX_DIR/bridges/telegram/config.yaml"
    sed -i "s/TELEGRAM_HS_TOKEN:-GENERATE_NEW_TOKEN/TELEGRAM_HS_TOKEN:-$TELEGRAM_HS_TOKEN/" "$MATRIX_DIR/bridges/telegram/config.yaml"

    echo "  - Telegram bridge registration created"
fi

# Create bridge databases in PostgreSQL
echo ""
echo "Starting PostgreSQL to create bridge databases..."
docker-compose -f "$MATRIX_DIR/docker-compose.yml" up -d postgres-matrix

echo "Waiting for PostgreSQL to be ready..."
sleep 5

docker exec matrix-postgres psql -U "${MATRIX_DB_USER:-synapse}" -d postgres -c "CREATE DATABASE mautrix_discord;" 2>/dev/null || echo "  - mautrix_discord database exists"
docker exec matrix-postgres psql -U "${MATRIX_DB_USER:-synapse}" -d postgres -c "CREATE DATABASE mautrix_slack;" 2>/dev/null || echo "  - mautrix_slack database exists"
docker exec matrix-postgres psql -U "${MATRIX_DB_USER:-synapse}" -d postgres -c "CREATE DATABASE mautrix_telegram;" 2>/dev/null || echo "  - mautrix_telegram database exists"

echo ""
echo "========================================"
echo "Matrix Stack Initialization Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Configure your .env file with production values"
echo "2. For Telegram: Get API ID/Hash from https://my.telegram.org"
echo "3. Start the stack: docker-compose up -d"
echo "4. Create admin user: docker exec -it matrix-synapse register_new_matrix_user -c /data/homeserver.yaml -a -u admin"
echo ""
echo "Access:"
echo "  - Element Web: http://localhost:8080"
echo "  - Synapse API: http://localhost:8008"
echo ""
