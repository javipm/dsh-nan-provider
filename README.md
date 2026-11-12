# dsh-nan-provider

Configura y vigila tu suscripción **NaN** ([nan.builders](https://nan.builders))
dentro de DeepSeek Harness, tanto en la **TUI** ([dsh-tui](https://github.com/ccch1mneyyy/dsh-TUI))
como en **Desktop**: crea el proveedor, guarda la clave, deja el modelo por
defecto y muestra créditos y gasto. Basado en la idea de
[pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider).

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

Cada perfil guarda su propia configuración, así que este es el único orden que
funciona:

1. **Configura una vez en la TUI:** `/restart` y luego `/nan-setup`.
   - Crea o refresca el proveedor `nan` con los modelos del catálogo.
   - Pide la clave si no existe y la guarda como `NAN_API_KEY`.
   - Deja `deepseek-v4-flash` como modelo por defecto.
   - Publica el resultado en **`~/.dsh/nan-provider.json`**.
2. **Comprueba en la TUI:** `/nan-usage` abre la pestaña `◈` con los créditos.
3. **Abre Desktop.** A los ~3 s el plugin aplica ese fichero con el servicio de
   settings del perfil `desktop` y verás el proveedor configurado. Lo confirma
   con una línea “NaN provider synced” y escribiendo la ruta en
   `~/.dsh/profiles/desktop/cordis.patch.yml`.
4. **Comprueba en Desktop:** `/nan-usage` devuelve el informe en texto.

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
