# dsh-nan-provider

Configura y vigila tu suscripción **NaN** ([nan.builders](https://nan.builders))
dentro de DeepSeek Harness, tanto en la **TUI** ([dsh-tui](https://github.com/ccch1mneyyy/dsh-TUI))
como en **Desktop**: crea el proveedor, guarda la clave, deja el modelo por
defecto y muestra créditos y gasto. Basado en la idea de
[pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider).

[![npm](https://img.shields.io/npm/v/dsh-nan-provider.svg?color=blue)](https://www.npmjs.com/package/dsh-nan-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.2-6f42c1.svg)](https://github.com/deepseek-ai/deepseek-harness)

🇬🇧 [English](README.en.md) · 🇪🇸 **Español**

<p align="center">
  <img src="docs/panel.jpg" alt="Panel «NaN usage» y chip de créditos en el footer" width="900">
</p>

## Qué hace

- **`/nan-setup`**: crea o refresca el proveedor `nan`. Pregunta la clave si
  falta (y la guarda), descarga `{baseURL}/models`, la une al catálogo —los
  modelos nuevos de chat entran con valores conservadores; embeddings, rerank,
  STT, TTS e imagen se filtran— y fija `deepseek-v4-flash` como modelo por
  defecto. No borra `openai` ni edita el YAML a mano: escribe por el servicio
  de settings, igual que `/provider`.
- **Pestaña «NaN usage»** en el sidebar, junto a Info / Todo / Jobs (icono `◈`):
  barra de créditos del periodo, restante y días, últimos 30 días con top de
  modelos, sparkline diaria y total histórico.
- **`/nan-usage`** abre la pestaña; **`/nan-usage text`** devuelve el informe en el chat.
- **Chip en el footer** (`NaN 6,195 cr · 14d`) en la línea de estado, con el
  desglose al pasar el ratón. `footer: false` lo apaga.
- **Tarjeta en Ajustes** (Desktop/web): créditos, periodo y gasto por modelo,
  con botón de refresco. El navegador nunca ve la clave: consulta una ruta
  loopback autenticada del host (`/api/nan-provider/usage`).

> El panel Info del sidebar es código del host con secciones fijas; la vía
> soportada es una pestaña propia. El chip se une a la línea de estado existente
> porque no hay seam para una segunda línea de footer.

## Instalación

### TUI (`dsh-tui`)

```bash
dsh plugin --profile dsh-tui add dsh-nan-provider
```

O dentro de la propia TUI: `/plugin install dsh-nan-provider`.

### Desktop (DeepSeek Harness)

1. Abre **Ajustes → Plugins → Add plugin**.
2. Escribe `dsh-nan-provider` y confirma.
3. Reinicia la app cuando termine.

El perfil `desktop` está gestionado por la app Electron: `dsh plugin --profile
desktop` responde `profile "desktop" is managed exclusively by the Electron
application`. Instálalo siempre desde Ajustes.

En los dos casos comprueba que quedas en la última versión (`npm view
dsh-nan-provider version`): si reinstalas poco después de publicar, fija la
versión explícita (`add dsh-nan-provider@latest`) para no dejar que un cache
del registro resuelva una vieja.

## Puesta en marcha (TUI + Desktop)

El orden de instalación da igual (primero TUI, primero Desktop, o a la vez). Lo
único que importa es ejecutar **`/nan-setup` una vez** en cualquiera de los dos
y abrir el otro después.

1. **Primera vez**: abre la TUI (o Desktop) y ejecuta `/nan-setup`.
   - Crea o refresca el proveedor `nan` con los modelos del catálogo.
   - Pide la clave si no existe y la guarda como `NAN_API_KEY`.
   - Deja `deepseek-v4-flash` como modelo por defecto.
   - Publica todo en **`~/.dsh/nan-provider.json`**.
2. **TUI**: `/nan-usage` abre la pestaña `◈` con los créditos.
3. **Desktop**: la próxima vez que lo abras, a los ~3 s aplica ese fichero con
   el servicio de settings del perfil `desktop`. Lo confirma con una línea
   “NaN provider synced” y dejando la ruta escrita en
   `~/.dsh/profiles/desktop/cordis.patch.yml`. Si Desktop ya estaba abierto
   cuando corriste `/nan-setup`, ciérralo y ábrelo otra vez.
4. **Desktop**: `/nan-usage` devuelve el informe en texto.

Cómo se enlazan los perfiles:

- La clave es común: `~/.dsh/.credentials.yaml` (`NAN_API_KEY`).
- El proveedor y los modelos viajan por `~/.dsh/nan-provider.json`.
- Si un perfil no encuentra el fichero pero ya tiene una ruta `nan`, la publica
  él (primer arranque tras actualizar). `/nan-setup` es quien lo actualiza.

En Desktop no hay panel ni chip (son seams del TUI): tienes `/nan-setup` y
`/nan-usage` como informe de texto.

Funciona igual en macOS, Windows y Linux: ESM puro con `fetch`, sin
dependencias nativas. La config vive en `~/.dsh` (`%USERPROFILE%\.dsh` en
Windows) y el estado del TUI en `~/.dsh-tui`.

## Empezar de cero (reset)

Si quieres que el harness arranque como si fuese la primera vez, sin perder los
históricos:

```bash
./scripts/reset.sh --dry-run   # enseña qué borraría
./scripts/reset.sh             # pide confirmación y hace backup
```

En Windows nativo (PowerShell):

```powershell
pwsh -File .\scripts\reset.ps1 -DryRun
pwsh -File .\scripts\reset.ps1
```

Qué borra:

- `~/.dsh/.credentials.yaml` (claves guardadas, incluida `NAN_API_KEY`)
- `~/.dsh/nan-provider.json` (proveedor compartido)
- `cordis.patch.yml` de `dsh-tui` y de `desktop` (proveedores y modelo)
- preferencias del TUI: `model.json`, `model-recents.json`, `effort.json`,
  `permission.json`

Qué **no** toca: `~/.dsh/sessions`, `~/.dsh/attachments`, `~/.dsh/storages`,
`~/.dsh-tui/history.jsonl`, `session-index.json` ni `session-lists`.

Cada ejecución guarda un backup en `~/dsh-backup-<fecha>/`. Respeta
`DSH_HOME` y `DSH_TUI_HOME` si los tienes cambiados.

Después del reset: instala el plugin en cada perfil, `/nan-setup` en la TUI y
abre Desktop.

## Clave de API

El plugin detecta el proveedor por id `nan`, por `baseURL` de `nan.builders` o
por etiqueta «NaN», y usa su `apiKeyEnv` (y su `baseURL`) para consultar
`/nan-usage`. Sin una ruta NaN configurada la consulta falla con un aviso para
ejecutar `/nan-setup`: no hay fallback a una clave o URL suelta.

El ref de credencial es **`NAN_API_KEY`**, propio del plugin: un proveedor
OpenAI aparte puede seguir usando `OPENAI_API_KEY` sin que se pisen. Se
resuelve por operación desde el store de credenciales del harness
(`~/.dsh/.credentials.yaml`) y, si no está, desde la variable de entorno
`NAN_API_KEY`. Si tampoco hay, `/nan-setup` la pide en un diálogo (visible
mientras escribes) y la guarda en el store. El fichero nunca se lee
directamente.

El endpoint es `GET {baseURL}/usage` (documentado en
`https://nan.builders/openapi.json`); no consume créditos.

## Configuración

Opcional; se ajusta en la fila `nan` de
`~/.dsh/profiles/dsh-tui/cordis.patch.yml`:

| clave                  | por defecto                   | qué hace                                                |
| ---------------------- | ----------------------------- | ------------------------------------------------------- |
| `provider`             | `nan`                         | id de la ruta que se detecta y configura                |
| `apiKeyEnv`            | `NAN_API_KEY`                 | ref de credencial que usa `/nan-setup` al crear la ruta |
| `baseUrl`              | `https://api.nan.builders/v1` | base que usa `/nan-setup` al crear la ruta              |
| `windowDays`           | `30`                          | ventana del desglose (1–90)                             |
| `autoRefreshSeconds`   | `60`                          | refresco con el panel visible (`0` lo apaga)            |
| `lowCreditsPercent`    | `10`                          | umbral del badge `warning`/`error`                      |
| `commandName`          | `usage`                       | nombre del comando de consumo                           |
| `panelId`              | `usage`                       | id interno del panel                                    |
| `panelTitle`           | `NaN usage`                   | título de la pestaña                                    |
| `footer`               | `true`                        | chip de créditos en el footer                           |
| `footerRefreshMinutes` | `15`                          | refresco del chip                                       |
| `cacheSeconds`         | `20`                          | caché compartida panel/comando                          |
| `setupModel`           | `deepseek-v4-flash`           | modelo que fija `/nan-setup`                            |
| `setupEffort`          | `max`                         | effort que fija `/nan-setup`                            |

## Desarrollo

```bash
npm install --include=dev   # NODE_ENV=production omite devDependencies si no se lo pides
npm test                    # 49 tests; los 3 de render usan react-test-renderer
```

Sin dependencias de runtime: solo `fetch` y los servicios del harness. El panel
usa el React y el `ui` del host (regla single-React) y `ui.useAnimationTime`
como reloj.

## Estructura

```text
lib/index.js        panel, /nan-usage, /nan-setup y footer (cordis inject)
lib/catalog.js      perfil canónico del proveedor NaN (11 modelos)
lib/provider.js     detección de la ruta nan (settings)
lib/setup.js        /nan-setup: provider + clave + modelo por defecto
lib/shared.js       fichero compartido y auto-sync entre perfiles
lib/overrides.js    overrides medidos del catálogo (pi-nan-provider)
lib/api.js          cliente de /usage + normalización defensiva
lib/source.js       caché compartida y resolución de la ruta/clave
lib/panel.js        componente React del panel (sin JSX, React del host)
lib/format.js       números, barras, sparkline, fechas (puro)
lib/text-report.js  informe de texto y mensajes de error
cordis.patch.yml    fila que monta el bundle en el perfil
scripts/reset.sh    reset de config/credenciales (bash: macOS, Linux, Windows Git Bash)
scripts/reset.ps1   lo mismo para PowerShell en Windows
dsh-plugin.json     manifiesto 0.15 (metadata de ecosistema)
```

## Créditos

La idea de generar el catálogo desde una fuente pública y corregirlo con
overrides medidos —además del filtrado de endpoints no-chat— viene de
[pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider), MIT
(Copyright (c) 2026 gtrabanco). Los valores y las notas de procedencia de
`lib/overrides.js` salen de su `scripts/manual-overrides.ts`; la licencia y la
atribución completa están en [LICENSE](LICENSE) y [NOTICE](NOTICE). Este
proyecto se distribuye con la misma licencia MIT.

Los modelos nuevos que el endpoint anuncie sin metadatos entran con el sobre
conservador de pi-nan-provider: 128k de contexto, 4k de salida, solo texto y sin
reasoning ajustable; nunca se inventan capacidades.
