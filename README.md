# task-dashboard

Sistema personal de gestión de tareas con dos caras:

- **Bot de Telegram** (`/api/telegram/webhook`): mandas una nota de texto (o una transcripción de voz) y Groq la convierte en una propuesta de tarea (título corto, tipo, duración estimada, si es paralelizable y proyecto) que confirmas con «sí» antes de que se guarde.
- **Panel web** (Next.js 14 App Router + InsForge): columnas Hoy / Mañana / Esta semana / Proyectos futuros / Sin terminar, arrastre de tareas entre columnas, historial de las hechas en los últimos 3 días, progreso por proyecto, detalle en panel lateral, plan del día según el tiempo que tengas y alta manual de tareas eligiendo destino. El panel pide una contraseña antes de mostrar nada y cada columna o proyecto se puede abrir a pantalla completa, solo con sus tareas.

```
Telegram  →  /api/telegram/webhook  →  Groq (clasifica)  →  InsForge (Postgres)
                                                                     ↑
Navegador  →  @insforge/sdk (ANON_KEY, lectura/escritura directa)  ──┘
Navegador  →  /api/plan-dia (algoritmo, sin IA)  ────────────────────┘
Vercel Cron →  /api/cron/cerrar-dia (00:05 Madrid)  ─────────────────┘
```

## 1. Backend en InsForge

El proyecto `task_dashboard` ya está vinculado a este directorio (`.insforge/`).

1. Aplica el esquema con la CLI (importa el archivo completo en una sola pasada):

```bash
npx @insforge/cli db import insforge/schema.sql
```

   También puedes pegar `insforge/schema.sql` en el SQL editor del dashboard. Si usas `db query`, ejecuta una sentencia por llamada: la CLI ignora el SQL con varias sentencias.

2. Comprueba que existen las tablas:

```bash
npx @insforge/cli db tables
```

3. Claves del proyecto (**Dashboard → Install → API Keys**, o por CLI):

```bash
npx @insforge/cli secrets get ANON_KEY   # pública, va al navegador
npx @insforge/cli secrets get API_KEY    # admin (ik_...), solo servidor
```

El esquema crea los tipos `tipo_tarea` y `estado_tarea`, las tablas `proyectos` y `tareas`, índices, `GRANT` para `anon` y RLS permisiva. **No hay cuentas de usuario**: el panel pide una contraseña única (`APP_PASSWORD`) antes de mostrar nada, pero la anon key viaja al navegador y la RLS es permisiva, así que la contraseña protege la interfaz y no la base de datos. Es válido para un dashboard personal; no lo uses con datos sensibles ni compartas las claves.

## 2. Variables de entorno

Copia `.env.example` a `.env.local` (ya existe uno con la URL y la API_KEY de este proyecto) y rellena lo que falte:

| Variable | Dónde se usa |
| --- | --- |
| `NEXT_PUBLIC_INSFORGE_URL` | web y servidor |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | navegador (lectura/escritura de tareas) |
| `INSFORGE_API_KEY` | webhook de Telegram, `/api/plan-dia`, cron |
| `GROQ_API_KEY` | clasificación de la nota |
| `GROQ_MODEL` | opcional, por defecto `openai/gpt-oss-120b` |
| `TELEGRAM_BOT_TOKEN` | responder en el chat |
| `TELEGRAM_WEBHOOK_SECRET` | opcional, valida `X-Telegram-Bot-Api-Secret-Token` |
| `APP_PASSWORD` | contraseña del panel (opcional, si falta se usa la de siempre) |
| `APP_PASSWORD_HASH` | alternativa a `APP_PASSWORD`: sha256 en hexadecimal |
| `APP_SESSION_SECRET` | opcional, firma la cookie de sesión |

`INSFORGE_API_KEY` es una clave de admin: no la prefijes con `NEXT_PUBLIC_` ni la subas al repo.

## 3. Arrancar en local

```bash
npm install
npm run dev
```

Abre la URL que imprime Next.js (normalmente `http://localhost:3000`).

La primera pantalla pide la contraseña del panel. Se cambia con `APP_PASSWORD` en Vercel o en `.env.local`; si no defines ninguna, se usa la de siempre. Sin la cookie de sesión, `/` redirige a `/login` y las rutas de API responden 401. Quedan fuera el webhook del bot y el cron, que ya tienen su propio secreto.

### Instalar en el móvil

El panel es una PWA: se instala desde el navegador y se abre a pantalla completa, sin barra de direcciones.

- **Android (Chrome/Edge)**: menú ⋮ → «Instalar aplicación» (o «Añadir a pantalla de inicio»).
- **iPhone/iPad (Safari)**: botón Compartir → «Añadir a pantalla de inicio».

Si Chrome dice que no se puede instalar, suele ser caché de un despliegue anterior: recarga forzada (o borra datos del sitio) y vuelve a probar. Los iconos y el service worker llevan nombres versionados (`-v2`, `service-worker.js`) justo para esquivar esos 404 cacheados.

En producción funciona sobre el HTTPS de Vercel; en local basta con `localhost`. El manifest está en `app/manifest.ts`, los iconos se generan desde `public/icons/app-icon.png` con `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generar-iconos.ps1` y el service worker (`public/service-worker.js`) guarda el shell para abrir el panel sin conexión (las tareas se piden a InsForge, así que sin red se ve la última carga).

## 4. Crear el bot de Telegram y configurar el webhook

1. Habla con [@BotFather](https://t.me/BotFather), usa `/newbot` y guarda el token en `TELEGRAM_BOT_TOKEN`.
2. Despliega primero en Vercel (paso 5) para tener una URL pública, o usa un túnel (`ngrok http 3000`) en local.
3. Registra el webhook (sustituye token y URL):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://TU-DOMINIO.vercel.app/api/telegram/webhook",
    "secret_token": "TU_TELEGRAM_WEBHOOK_SECRET"
  }'
```

Si no usas secreto, omite `secret_token` y deja `TELEGRAM_WEBHOOK_SECRET` vacío.

4. Comprueba el estado:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

5. Escribe al bot cualquier cosa, por ejemplo:

> mañana tengo que llamar al gestor para lo del contrato del piso, calculo media hora

Respuesta esperada: `¿Creo esta tarea?` con el título, la columna y la duración. Contesta «sí» y verás `✅ Añadida a Hoy: Llamar al gestor por el contrato`.

Detalles del webhook:

- Devuelve `200` siempre que el update esté bien formado, para que Telegram no reintente en bucle; si Groq o InsForge fallan, el error se cuenta en el chat y la tarea no se da por guardada.
- **Nada se crea sin confirmar**: en cuanto la tarea tiene título y destino, el bot responde «¿Creo esta tarea?» con el título, dónde iría, la duración y dos botones, **✅ Sí, crearla** y **❌ No, cancelar** (los pulsas y se envían solos). También valen por texto «sí», «vale», «ok», «adelante»; «no» la descarta. La propuesta vive en `estados_chat` con `accion = confirmar_tarea`, así que sobrevive a reinicios.
- **Corregir antes de crear**: en vez de «sí» o «no» puedes decir el cambio: «la tarea es up convives», «sería que el título es …», «mejor mañana», «en el proyecto Kerbal», «cambia la duración a 45 min» (o «media hora», «sin duración»). El bot reescribe la propuesta y vuelve a pedir confirmación, sin crear nada. Si le mandas otra orden («crea el proyecto X»), descarta la propuesta y ejecuta la orden.
- **Varias tareas en un mensaje**: si la nota enumera cosas («comprar pan; llamar a Ana; recoger el paquete»), el clasificador devuelve una lista y el bot propone todas juntas antes de crearlas. Si alguna no dice cuándo va, pregunta una vez por todas.
- **Recordatorios con hora**: «recuérdame el viernes a las 18:00 llamar a Ana». El bot propone el asunto y la fecha, y a esa hora te manda un mensaje al chat. Si no dices cuándo, te lo pregunta. El botón **✏️ Editar** copia al portapapeles un borrador (`recuérdame el 14/11/2026 a las 18:00: Llamar a Ana`): lo pegas en el campo de texto, cambias lo que quieras y lo mandas.
- Los proyectos **solo se crean si lo pides**: «crea el proyecto Kerbal» o «crea un nuevo proyecto titulado Kerbal». Si el clasificador sugiere un proyecto que no existe, la tarea se guarda sin proyecto.
- Para meter una tarea en un proyecto: «mete en el proyecto Kerbal la tarea jugar al roblox». Si no dices la tarea, el bot pregunta «¿Qué tarea meto en Kerbal?» y usa tu siguiente mensaje.
- Borrar por chat: «elimina la tarea anterior» (la última que creó el bot), «elimina la tarea de comprar pan» (por título) o «elimina tareas» → pregunta «hoy», «mañana» o «esta semana», lista esa columna numerada y borra la que elijas por número o título. El estado de cada conversación vive en la tabla `estados_chat`.
- Las tareas de tipo `hoy` se guardan con `fecha_para` = hoy (zona `Europe/Madrid`).
- El endpoint acepta también `edited_message`.
- Si la nota no dice cuándo ni dónde va (el clasificador devuelve `destino_claro: false`), el bot **pregunta** «¿Hoy, mañana, esta semana o en un proyecto?» y guarda la nota en `tareas_pendientes`, asociada al chat. El siguiente mensaje de ese chat se interpreta como respuesta («hoy», «esta semana», «en el proyecto Web», «cancela») y ahí se crea la tarea. La memoria sobrevive a reinicios y caduca a las 24 h.
- Un solo pendiente por chat: si llega otra nota sin destino, reemplaza a la anterior.
- Si el guardado falla, el mensaje de error lo dice y, si había una tarea esperando destino, se conserva para reintentar.

## 5. Desplegar en Vercel

1. Sube el repo a GitHub.
2. En Vercel: **Add New → Project → Import** el repo. Framework: Next.js (detección automática).
3. En **Settings → Environment Variables** añade las variables del paso 2 para Production, Preview y Development.
4. Deploy. Después vuelve al paso 4 para apuntar el webhook a la URL de producción.
5. El cron de `vercel.json` (`5 23 * * *` UTC ≈ 00:05 en Madrid en horario de invierno y 01:05 en verano) llama a `/api/cron/cerrar-dia`. Primero pasa las tareas de **Mañana** a **Hoy** con la fecha del día; después mueve a **Sin terminar** las de Hoy que sigan pendientes y sean de un día anterior. Es idempotente, así que puede ejecutarse varias veces sin efectos raros. Los crons diarios funcionan en el plan Hobby de Vercel.

## 6. MCP de InsForge

`.mcp.json` (ignorado por git porque contiene la clave) ya apunta al proyecto. Si tu cliente MCP es otro, usa la misma configuración:

```json
{
  "mcpServers": {
    "insforge": {
      "command": "npx",
      "args": ["-y", "@insforge/mcp@latest"],
      "env": {
        "API_KEY": "ik_...",
        "API_BASE_URL": "https://TU-PROYECTO.insforge.app"
      }
    }
  }
}
```

Reinicia el cliente de IA y comprueba la conexión pidiendo el tool `fetch-docs`. Los tools de escritura y admin (SQL crudo, esquema) requieren esa API_KEY; la anon key no sirve para ellos.

## Cómo funciona el plan del día

`/api/plan-dia` recibe `{ minutos }`:

1. Toma las tareas `hoy` + `pendiente`.
2. Ordena las no paralelizables de menor a mayor duración y las mete mientras quepan en el tiempo disponible.
3. Añade las `paralelizable` aunque sumen de más, porque se hacen a la vez que otra (cada una debe caber por sí sola en el tiempo disponible).
4. Devuelve los ids sugeridos; la web los resalta con borde y fondo azul dentro de la columna Hoy, sin ocultar el resto.

Duración desconocida = 30 min. Entradas de tiempo aceptadas: `2h 30min`, `1,5h`, `90`, `90 min`, `1:30`.

## Modelo de datos

`proyectos`: `id` (uuid), `nombre`, `color` (hex), `created_at`.

`tareas`: `id` (uuid), `titulo`, `detalle`, `tipo` (`hoy` | `manana` | `semana` | `proyecto`), `estado` (`pendiente` | `hecha` | `sin_terminar`), `duracion_estimada_min` (nullable), `paralelizable` (bool), `proyecto_id` (fk nullable), `fecha_para` (date nullable), `created_at`, `completed_at`. Las de `manana` guardan `fecha_para` = mañana; el cron las convierte en `hoy` al cambiar el día.

`tareas_pendientes`: `id`, `chat_id` (único), `texto`, `titulo`, `detalle`, `duracion_estimada_min`, `paralelizable`, `created_at`. Solo la usa el servidor; no tiene acceso para `anon`.

`recordatorios`: `id`, `titulo`, `detalle`, `recordar_at` (timestamptz), `enviado`, `chat_id`, `created_at`. Un schedule de InsForge llama cada minuto a `/api/recordatorios/enviar` (cabecera `x-recordatorios-token`, token guardado en `ajustes`); los que ya vencieron se mandan por Telegram y se marcan con `enviado = true`.

`ajustes`: pares `clave`/`valor` del servidor (por ejemplo el token del cron de recordatorios). Sin acceso para `anon`.

## Estructura

```
app/
  api/telegram/webhook/route.ts   # recibe, clasifica, guarda y responde
  api/plan-dia/route.ts           # subconjunto sugerido de tareas de hoy
  api/cron/cerrar-dia/route.ts    # pasa las de hoy no hechas a sin_terminar
  api/recordatorios/enviar/route.ts # manda los recordatorios vencidos por Telegram
  api/login/route.ts              # comprueba la contraseña y pone la cookie
  login/page.tsx                  # pantalla de contraseña
  layout.tsx / page.tsx / globals.css / manifest.ts   # metadatos y PWA
middleware.ts                     # sin sesión, todo va a /login
public/
  sw.js                           # service worker (shell offline)
  offline.html                    # aviso sin conexión
  icons/ y apple-touch-icon-v3.png # iconos generados desde el diseño
components/
  Dashboard.tsx                   # estado, mutaciones, layout y vista a pantalla completa
  AppHeader.tsx                   # saludo, fecha y "Proponer plan"
  StatsRow.tsx                    # hechas hoy, racha, activas, sin terminar
  TaskCard.tsx                    # checkbox, badges, reasignación rápida
  TaskDetailPanel.tsx             # detalle completo + editar duración
  NewTaskPanel.tsx                # alta manual: título, detalle, destino, proyecto, duración
  ProjectsColumn.tsx              # barras de progreso y proyectos expandibles
lib/
  ai.ts                           # llamada a Groq + prompt JSON
  acceso.ts                       # contraseña del panel y cookie de sesión
  correccion.ts                   # cambios sobre la tarea antes de confirmarla
  plan.ts                         # algoritmo del plan del día
  dates.ts                        # zona horaria, saludo, racha
  duration.ts                     # parseo/formato de tiempos
  insforge/client.ts              # cliente de navegador (anon key)
  insforge/server.ts              # cliente de servidor (admin API key)
  pending.ts                      # notas esperando que el usuario diga el destino
  recordatorios.ts                # fechas en Madrid, borradores y envío de avisos
insforge/schema.sql
insforge/migrations/              # cambios aplicados sobre una base existente
scripts/generar-iconos.ps1       # regenera los iconos PNG desde public/icons/app-icon.png
```

## Notas

- El panel usa un único árbol de componentes: en escritorio se convierte en grid de 5 columnas; en móvil (`< 1024px`) muestra pestañas horizontales con scroll y solo la sección activa. La lógica no está duplicada.
- Arrastrar: con ratón basta mover la tarjeta; en táctil hay que mantener pulsada (~320 ms) para no bloquear el scroll. Se puede soltar en Hoy, Mañana, Esta semana, Sin terminar o sobre una tarjeta de proyecto. En móvil se mantiene pulsada la tarea y se suelta sobre la pestaña de la columna (Hoy, Mañana, Semana, Proyectos o Sin terminar), que se resalta mientras arrastras; la barra de pestañas queda fija arriba para poder soltar ahí aunque estés bajado en la lista. Además, el detalle de cada tarea tiene botones «Mover a» para cambiar de columna sin arrastrar.
- «Hechas · 3 días» abre el historial de tareas completadas hoy, ayer y anteayer, agrupadas por día.
- No hay backend propio para leer datos: el navegador habla directo con InsForge usando la anon key.
- «Nueva tarea» abre un panel para crear tareas sin pasar por Telegram: eliges Hoy, Esta semana o un proyecto (creándolo si escribes uno nuevo), con duración y si es paralelizable. Las de Hoy se guardan con `fecha_para` = hoy.
- El clasificador usa Groq (`https://api.groq.com/openai/v1/chat/completions`) en modo JSON. Cambia el modelo con `GROQ_MODEL`; el valor por defecto es `openai/gpt-oss-120b` (comprueba con `GET /openai/v1/models` qué modelos expone tu cuenta).
