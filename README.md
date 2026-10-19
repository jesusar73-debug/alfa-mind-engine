# Alfa Mind Engine

Entrenador guiado de relajación y visualización por cuenta regresiva.
Voz guía en español + tono alfa de 10 Hz.
**Funciona sin internet** una vez instalada.

> Inspirado en técnicas clásicas de relajación y visualización por cuenta regresiva.
> No sustituye atención médica ni psicológica. No usar manejando ni operando maquinaria.

---

## 📱 Instalar en Android

1. Abre el enlace de la app en **Chrome**. Usa **Wi-Fi**: la primera vez descarga ~36 MB.
2. Espera a que aparezca el aviso **"Lista para usarse sin internet"**.
3. Toca el menú **⋮** → **Instalar app** (o "Agregar a pantalla principal").
4. Abre la app desde el ícono nuevo.

**Comprobar que funciona offline:**
1. Activa el **modo avión**.
2. Abre la app desde el ícono.
3. Inicia una sesión: debe sonar la voz y el tono.

Se necesita internet **una sola vez** para instalarla. Después funciona sin conexión.

---

## ✅ Qué incluye

- **Acondicionamiento:** 5 niveles (100, 50, 25, 10 y 5 → 1) más el nivel Rápido (3 → 1).
- **Herramientas:** Pantalla Mental, Espejo de la Mente, Tres Dedos y Vaso de Agua.
- **Tracker:** calendario, racha y "retoma donde quedaste".
- **Respaldo:** exportar e importar tu progreso en JSON.
- **Tono:** binaural (con audífonos) o isocrónico (con bocina). Dos volúmenes separados.
- **Durante la sesión:** pantalla encendida (Wake Lock), controles en la notificación (Media Session) y modo "Ojos cerrados".

---

## 🔊 Pantalla bloqueada: qué esperar

| Situación | Resultado esperado en Android |
|---|---|
| Pantalla encendida con la app abierta | ✅ Funciona completo |
| Modo "Ojos cerrados" | ✅ Pantalla casi negra pero encendida |
| Bloquear la pantalla | ⚠️ Chrome normalmente sigue sonando. **Hay que confirmarlo en tu celular.** |
| Si el sonido se corta al bloquear | Activa **Ajustes → Motor de audio → Compatibilidad** |
| Llamada entrante | La sesión se pausa; toca **Continuar** al volver |

**Modo Compatibilidad:** el tono suena desde un audio pregrabado en bucle, sin Web Audio. Es más resistente en segundo plano. A cambio, los fundidos de volumen son menos suaves.

---

## 🛠️ Para desarrolladores (laptop Windows)

Requisitos: Node 24, Python 3.12, ffmpeg.

```powershell
npm install
py -3.12 -m venv .venv
.venv\Scripts\pip install -r tools\requirements.txt
.venv\Scripts\python -m piper.download_voices es_AR-daniela-high --data-dir .voices
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build:audio` | Regenera **todos** los audios desde `content/scripts` |
| `npm run verify:sync` | Mide la sincronía real voz ↔ timeline (límite 300 ms) |
| `npm run build:icons` | Regenera los íconos |
| `npm run build` | Compila para producción (`dist/`) |
| `npm test` | Pruebas Playwright (390×844): sesión, tracker, respaldo, offline y sincronía |
| `npm run audit` | Lighthouse + instalabilidad (con `npm run preview` abierto) |

### Cambiar un texto
1. Edita el guion en `content/scripts/*.json`. Cada frase tiene `texto` y `pausa_ms`.
2. Corre `npm run build:audio`.
3. Haz commit y push: GitHub Pages se actualiza solo.

### Cambiar la duración de un nivel
Edita `days` en `content/levels.json`. El tracker se ajusta solo, sin regenerar audio.

### Estructura
```
content/scripts/   guiones originales (JSON)
content/levels.json, modules.json
tools/             TTS (Piper), armado de audio, íconos, verificación
public/audio/      MP3 + WAV + manifest.json (timelines)
src/audio/         motor: tono en vivo, voz por segmentos, timeline
src/screens/       Inicio, Sesión, Progreso, Ajustes, Acerca de
tests/             Playwright
```

---

## 📜 Licencias

- **Voz:** Piper `es_AR-daniela-high`. El dataset es OpenSLR 61 (Google), con licencia **CC BY-SA 4.0**: requiere dar crédito (ya está en "Acerca de"). El modelo se afinó desde la voz inglesa *lessac*, cuyo dataset tiene licencia de investigación. Si vas a cobrar por la app, revísalo con un abogado.
- **Piper TTS:** GPL-3.0. Solo se usa en la laptop para generar los audios; no va dentro de la app.
- **Guiones:** originales, escritos para este proyecto.
