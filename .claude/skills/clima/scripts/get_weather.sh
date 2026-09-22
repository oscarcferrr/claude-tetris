#!/usr/bin/env bash
# Fetches current weather for a city using wttr.in (no API key required).
# Usage: get_weather.sh <city> [format]
#   format: "text" (default, human-readable) or "json" (raw JSON from wttr.in)

set -euo pipefail

CITY="${1:-}"
FORMAT="${2:-text}"

if [ -z "$CITY" ]; then
  echo "Uso: get_weather.sh <ciudad> [text|json]" >&2
  exit 1
fi

# URL-encode spaces and accents-safe city name for the request path.
ENCODED_CITY=$(printf '%s' "$CITY" | sed 's/ /%20/g')

if [ "$FORMAT" = "json" ]; then
  curl -fsS "https://wttr.in/${ENCODED_CITY}?format=j1" \
    || { echo "Error: no se pudo contactar wttr.in" >&2; exit 1; }
else
  # %l=lugar %c=condicion(icono) %t=temp %f=sensacion %h=humedad %w=viento %p=precipitacion
  curl -fsS "https://wttr.in/${ENCODED_CITY}?format=%l:+%c+%t+(sensacion+%f)+humedad:%h+viento:%w+precipitacion:%p&lang=es" \
    || { echo "Error: no se pudo contactar wttr.in" >&2; exit 1; }
  echo
fi
