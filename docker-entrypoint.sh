#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Check if all required environment variables are set, otherwise exit with an error.
required_vars="OIDC_CLIENT_ID OIDC_ISSUER_URL"

for var in $required_vars; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "Error: $var environment variable is not set."
    exit 1
  fi
done

# Booleans are written into config.js unquoted, i.e. as JavaScript: anything but
# true/false would be a ReferenceError at load time (a blank page), so refuse to
# start instead.
for var in APP_STORE_ENABLED DUMMY_AUTH; do
  value="$(eval echo \$$var)"
  case "$value" in
    ""|true|false) ;;
    *) echo "Error: $var must be 'true' or 'false', got '$value'."; exit 1 ;;
  esac
done

# The DHBW App Store (our FastAPI backend) is opt-in. Its address has no
# default (see APP_STORE_UPSTREAM in the Caddyfile): required while it is on;
# switched off, Caddy still needs a syntactically valid upstream and nothing
# routes to it.
APP_STORE_ENABLED="${APP_STORE_ENABLED:-false}"
if [ "$APP_STORE_ENABLED" = "true" ]; then
  if [ -z "$APP_STORE_UPSTREAM" ]; then
    echo "Error: APP_STORE_UPSTREAM must be set (host:port of the App Store backend), or APP_STORE_ENABLED=false."
    exit 1
  fi
else
  export APP_STORE_UPSTREAM="127.0.0.1:9"
fi

# Where config.js goes. The default is the web root; a deployment with a
# read-only root filesystem points CONFIG_DIR at a writable volume, which the
# Caddyfile serves as /config.js.
CONFIG_DIR="${CONFIG_DIR:-/srv/www}"

# Dynamically generate the config file
cat > "${CONFIG_DIR}/config.js" << EOF
window.appconfig = {
  appStoreEnabled: ${APP_STORE_ENABLED},
  appStoreBaseUrl: "${APP_STORE_BASE_URL:-/api/app-store}",
  appStoreFrontendUrl: "${APP_STORE_FRONTEND_URL}",
  dynamicZonesBaseUrl: "${DYN_ZONES_BASE_URL}",
  cloudResourcesBaseUrl: "${CLOUD_RESOURCES_BASE_URL}",
  cloudResourcesMcpUrl: "${CLOUD_RESOURCES_MCP_URL}",
  dynamicZonesMcpUrl: "${DYN_ZONES_MCP_URL}",
  llmBaseUrl: "${LLM_BASE_URL}",
  acmeServer: "${ACME_SERVER:-https://certificates.dhbw.cloud}",
  dummyAuth: ${DUMMY_AUTH:-false},
  "oidc": {
    "client_id": "${OIDC_CLIENT_ID}",
    "issuer_url": "${OIDC_ISSUER_URL}",
    "end_session_url": "${OIDC_END_SESSION_URL}",
  }
};
EOF

# Execute the main container command passed via CMD (e.g., the Caddy command).
exec "$@"