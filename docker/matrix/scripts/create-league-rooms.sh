#!/bin/bash

# Fantasy Markets Platform - Create League Chat Rooms
# This script creates Matrix rooms for a fantasy league

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MATRIX_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment
if [ -f "$MATRIX_DIR/.env" ]; then
    export $(cat "$MATRIX_DIR/.env" | grep -v '^#' | xargs)
fi

HOMESERVER_URL="${MATRIX_HOMESERVER_URL:-http://localhost:8008}"
ACCESS_TOKEN="${MATRIX_ADMIN_TOKEN:-}"

if [ -z "$ACCESS_TOKEN" ]; then
    echo "Error: MATRIX_ADMIN_TOKEN not set in .env"
    exit 1
fi

LEAGUE_ID="$1"
LEAGUE_NAME="$2"

if [ -z "$LEAGUE_ID" ] || [ -z "$LEAGUE_NAME" ]; then
    echo "Usage: $0 <league_id> <league_name>"
    echo "Example: $0 abc123 'Dynasty Champions League'"
    exit 1
fi

echo "Creating Matrix rooms for league: $LEAGUE_NAME ($LEAGUE_ID)"

# Function to create a room
create_room() {
    local room_name="$1"
    local room_alias="$2"
    local room_topic="$3"
    local is_direct="${4:-false}"

    response=$(curl -s -X POST "$HOMESERVER_URL/_matrix/client/v3/createRoom" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$room_name\",
            \"room_alias_name\": \"$room_alias\",
            \"topic\": \"$room_topic\",
            \"preset\": \"private_chat\",
            \"visibility\": \"private\",
            \"initial_state\": [
                {
                    \"type\": \"m.room.guest_access\",
                    \"state_key\": \"\",
                    \"content\": {\"guest_access\": \"forbidden\"}
                },
                {
                    \"type\": \"m.room.history_visibility\",
                    \"state_key\": \"\",
                    \"content\": {\"history_visibility\": \"shared\"}
                }
            ],
            \"power_level_content_override\": {
                \"events_default\": 0,
                \"invite\": 50,
                \"kick\": 50,
                \"ban\": 50,
                \"redact\": 50,
                \"state_default\": 50
            }
        }")

    room_id=$(echo "$response" | jq -r '.room_id // empty')

    if [ -n "$room_id" ]; then
        echo "  Created: $room_name -> $room_id"
        echo "$room_id"
    else
        error=$(echo "$response" | jq -r '.error // "Unknown error"')
        echo "  Failed to create $room_name: $error" >&2
        echo ""
    fi
}

# Create main league room
echo ""
echo "Creating league rooms..."

MAIN_ROOM=$(create_room \
    "$LEAGUE_NAME" \
    "league_${LEAGUE_ID}" \
    "Main chat for $LEAGUE_NAME - Fantasy Markets")

# Create trade discussion room
TRADE_ROOM=$(create_room \
    "$LEAGUE_NAME - Trade Talk" \
    "league_${LEAGUE_ID}_trades" \
    "Trade discussions and offers for $LEAGUE_NAME")

# Create waiver wire room
WAIVER_ROOM=$(create_room \
    "$LEAGUE_NAME - Waiver Wire" \
    "league_${LEAGUE_ID}_waivers" \
    "Waiver wire discussion for $LEAGUE_NAME")

# Create trash talk room
TRASH_ROOM=$(create_room \
    "$LEAGUE_NAME - Trash Talk" \
    "league_${LEAGUE_ID}_trashtalk" \
    "Friendly banter for $LEAGUE_NAME 🗑️🔥")

# Create commissioner room
COMMISH_ROOM=$(create_room \
    "$LEAGUE_NAME - Commissioner" \
    "league_${LEAGUE_ID}_commissioner" \
    "Commissioner announcements for $LEAGUE_NAME")

echo ""
echo "========================================"
echo "League rooms created successfully!"
echo "========================================"
echo ""
echo "Room IDs:"
echo "  Main:         $MAIN_ROOM"
echo "  Trades:       $TRADE_ROOM"
echo "  Waivers:      $WAIVER_ROOM"
echo "  Trash Talk:   $TRASH_ROOM"
echo "  Commissioner: $COMMISH_ROOM"
echo ""
echo "Store these room IDs in your database for the league."
echo ""

# Output JSON for programmatic use
cat << EOF

JSON Output:
{
  "leagueId": "$LEAGUE_ID",
  "rooms": {
    "main": "$MAIN_ROOM",
    "trades": "$TRADE_ROOM",
    "waivers": "$WAIVER_ROOM",
    "trashTalk": "$TRASH_ROOM",
    "commissioner": "$COMMISH_ROOM"
  }
}
EOF
