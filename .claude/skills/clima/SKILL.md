---
name: clima
description: Obtiene el clima actual (temperatura, sensación térmica, humedad, viento, precipitación) para una ciudad dada, usando la API pública gratuita wttr.in vía curl — no requiere API key ni configuración. Usa esta skill siempre que el usuario pregunte por el clima, el tiempo, la temperatura o el pronóstico de una ciudad, aunque no mencione "wttr" o "API" explícitamente, por ejemplo "¿cómo está el clima en Madrid?", "dame la temperatura de Buenos Aires" o "necesito el pronóstico de mañana en Bogotá".
compatibility: Requiere curl y acceso a internet (https://wttr.in). No requiere API key.
---

# Clima local

Esta skill obtiene el clima actual de cualquier ciudad del mundo ejecutando una petición HTTP local con `curl` contra [wttr.in](https://wttr.in), un servicio público y gratuito que no requiere autenticación.

## Cómo usarla

Ejecuta el script incluido con el nombre de la ciudad como argumento:

```bash
bash .claude/skills/clima/scripts/get_weather.sh "<ciudad>"
```

Esto devuelve una línea legible en español con lugar, condición, temperatura, sensación térmica, humedad, viento y precipitación. Por ejemplo:

```
Madrid: ☀️  +21°C (sensacion +18°C) humedad:24% viento:↙8km/h precipitacion:0.0mm
```

Toma ese resultado y respóndele al usuario en lenguaje natural (no le pegues el output crudo salvo que lo pida), por ejemplo: "En Madrid hace 21°C, cielo despejado, con sensación térmica de 18°C."

## Modo JSON (datos detallados o pronóstico extendido)

Si el usuario pide más detalle (pronóstico de varios días, humedad por hora, fase lunar, etc.), pide el JSON completo:

```bash
bash .claude/skills/clima/scripts/get_weather.sh "<ciudad>" json
```

Esto devuelve la respuesta completa de wttr.in en JSON (incluye `current_condition`, `weather` con pronóstico a 3 días, `astronomy`, etc.). Parsea el campo relevante para responder la pregunta puntual del usuario en vez de mostrar el JSON completo.

## Notas

- El nombre de ciudad puede tener espacios (el script los codifica automáticamente); si tiene tildes o caracteres especiales, probá primero tal cual lo escribió el usuario.
- Si `curl` falla (sin conexión, ciudad no reconocida, servicio caído), el script imprime un error por stderr y termina con código de salida 1 — informá al usuario que no se pudo obtener el clima en vez de inventar datos.
- No se necesita ninguna API key ni variable de entorno.
