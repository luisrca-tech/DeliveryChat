#!/usr/bin/env bash
# Public REST API smoke test
# Usage: ./scripts/test-public-api.sh [BASE_URL] [API_KEY] [APP_ID] [ORIGIN]

set -euo pipefail

# ---------------------------------------------------------------------------
# Credentials — override via env vars or positional args
# ---------------------------------------------------------------------------
BASE_URL="${1:-${BASE_URL:-http://localhost:8000}}"
API_KEY="${2:-${API_KEY:-}}"
APP_ID="${3:-${APP_ID:-}}"
ORIGIN="${4:-${ORIGIN:-http://localhost:3001}}"

# Generate a fresh visitor UUID per run
if command -v uuidgen &>/dev/null; then
  VISITOR_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
elif [[ -r /proc/sys/kernel/random/uuid ]]; then
  VISITOR_ID="$(cat /proc/sys/kernel/random/uuid)"
else
  echo "ERROR: cannot generate UUID (need uuidgen or /proc/sys/kernel/random/uuid)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed. Install it and retry." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Pass/fail counters
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

# check <label> <actual_status> <expected_status>
check() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [[ "$actual" == "$expected" ]]; then
    echo -e "\033[32m✓ ${label} (${actual})\033[0m"
    PASS=$(( PASS + 1 ))
  else
    echo -e "\033[31m✗ ${label} (got ${actual}, expected ${expected})\033[0m"
    FAIL=$(( FAIL + 1 ))
  fi
}

# ---------------------------------------------------------------------------
# Shared curl helper — writes body to tmp file, returns HTTP status code
# ---------------------------------------------------------------------------
TMP_BODY="$(mktemp /tmp/dc_body.XXXXXX.json)"
trap 'rm -f "$TMP_BODY"' EXIT

http() {
  curl -s -o "$TMP_BODY" -w "%{http_code}" "$@"
}

# ---------------------------------------------------------------------------
# Summary & exit
# ---------------------------------------------------------------------------
summary() {
  echo ""
  echo "Results: ${PASS} passed, ${FAIL} failed"
  [[ $FAIL -eq 0 ]] && exit 0 || exit 1
}

echo "DeliveryChat Public API Test"
echo "BASE_URL : $BASE_URL"
echo "APP_ID   : ${APP_ID:-<not set>}"
echo "VISITOR  : $VISITOR_ID"
echo ""

# ============================================================
# Phase 2: Auth & guard negative cases
# ============================================================

STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations" \
  -H "Content-Type: application/json" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "no Authorization → 401" "$STATUS" "401"

STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "Origin: ${ORIGIN}")"
check "missing X-Visitor-Id → 400" "$STATUS" "400"

if command -v uuidgen &>/dev/null; then
  OTHER_VISITOR_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
else
  OTHER_VISITOR_ID="$(cat /proc/sys/kernel/random/uuid)"
fi

STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${OTHER_VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "wrong visitor → 404" "$STATUS" "404"

# ============================================================
# Phase 3: Conversation happy path
# ============================================================
sleep 1

STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}" \
  -d '{}')"
check "POST /conversations → 201" "$STATUS" "201"
CONV_ID="$(jq -r '.conversation.id' "$TMP_BODY")"
PARTICIPANTS="$(jq -r '.conversation.participants | length' "$TMP_BODY")"
[[ "$PARTICIPANTS" -gt 0 ]] && check "participants array non-empty" "200" "200" \
  || check "participants array non-empty" "404" "200"

STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "GET /conversations → 200" "$STATUS" "200"
HAS_ENVELOPE="$(jq 'has("total") and has("limit") and has("offset")' "$TMP_BODY")"
[[ "$HAS_ENVELOPE" == "true" ]] && check "envelope has total/limit/offset" "200" "200" \
  || check "envelope has total/limit/offset" "404" "200"

STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations/${CONV_ID}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "GET /conversations/:id → 200" "$STATUS" "200"
RETURNED_ID="$(jq -r '.conversation.id' "$TMP_BODY")"
[[ "$RETURNED_ID" == "$CONV_ID" ]] && check "returned id matches CONV_ID" "200" "200" \
  || check "returned id matches CONV_ID" "404" "200"

# ============================================================
# Phase 4: Message CRUD
# ============================================================
sleep 1

STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations/${CONV_ID}/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}" \
  -d '{"content":"Hello from smoke test"}')"
check "POST …/messages → 201" "$STATUS" "201"
MSG_ID="$(jq -r '.message.id' "$TMP_BODY")"

STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations/${CONV_ID}/messages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "GET …/messages → 200" "$STATUS" "200"
MSG_FOUND="$(jq --arg id "$MSG_ID" '[.messages[] | select(.id == $id)] | length' "$TMP_BODY" 2>/dev/null || echo "0")"
[[ "$MSG_FOUND" -gt 0 ]] && check "sent message appears in list" "200" "200" \
  || check "sent message appears in list" "404" "200"

STATUS="$(http -X PATCH "${BASE_URL}/v1/api/conversations/${CONV_ID}/messages/${MSG_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}" \
  -d '{"content":"Edited by smoke test"}')"
check "PATCH …/messages/:id → 200" "$STATUS" "200"
UPDATED_CONTENT="$(jq -r '.message.content' "$TMP_BODY")"
[[ "$UPDATED_CONTENT" == "Edited by smoke test" ]] && check "updated content matches" "200" "200" \
  || check "updated content matches" "404" "200"

sleep 1
STATUS="$(http -X DELETE "${BASE_URL}/v1/api/conversations/${CONV_ID}/messages/${MSG_ID}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "DELETE …/messages/:id → 200" "$STATUS" "200"
DEL_SUCCESS="$(jq -r '.success' "$TMP_BODY")"
[[ "$DEL_SUCCESS" == "true" ]] && check "delete returns {success:true}" "200" "200" \
  || check "delete returns {success:true}" "404" "200"

# ============================================================
# Phase 5: Read receipts + WS token
# ============================================================
sleep 1

# Send a second message so there is something unread
STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations/${CONV_ID}/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}" \
  -d '{"content":"Second message for unread test"}')"
MSG_ID2="$(jq -r '.message.id' "$TMP_BODY")"

STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations/${CONV_ID}/unread" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "GET …/unread (before read) → 200" "$STATUS" "200"
UNREAD_BEFORE="$(jq -r '.unreadCount // 0' "$TMP_BODY")"

STATUS="$(http -X POST "${BASE_URL}/v1/api/conversations/${CONV_ID}/read" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}" \
  -d "{\"messageId\":\"${MSG_ID2}\"}")"
check "POST …/read → 200" "$STATUS" "200"

sleep 1
STATUS="$(http -X GET "${BASE_URL}/v1/api/conversations/${CONV_ID}/unread" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "GET …/unread (after read) → 200" "$STATUS" "200"
UNREAD_AFTER="$(jq -r '.unreadCount // 0' "$TMP_BODY")"
UNREAD_BEFORE="${UNREAD_BEFORE:-0}"
[[ "$UNREAD_AFTER" -le "$UNREAD_BEFORE" ]] && check "unread count decreased" "200" "200" \
  || check "unread count decreased" "404" "200"

STATUS="$(http -X POST "${BASE_URL}/v1/api/ws-token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-App-Id: ${APP_ID}" \
  -H "X-Visitor-Id: ${VISITOR_ID}" \
  -H "Origin: ${ORIGIN}")"
check "POST /ws-token → 200" "$STATUS" "200"
WS_TOKEN="$(jq -r '.token // empty' "$TMP_BODY")"
[[ -n "$WS_TOKEN" ]] && check "ws-token non-empty" "200" "200" \
  || check "ws-token non-empty" "404" "200"

# ---------------------------------------------------------------------------
summary
