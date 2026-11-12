# AGENTS.md — dsh-nan-provider

Guía para agentes y mantenedores que trabajen en este repo. Resume la
arquitectura, las reglas que no se pueden romper, cómo probar y cómo publicar.

## Qué es

Plugin de **DeepSeek Harness** para la suscripción **NaN** (nan.builders). Hace
dos cosas:

1. **Configurar**: `/nan-setup` crea o refresca el proveedor `nan` (11 modelos,
   endpoint `api.nan.builders`, compat, retry), pide y guarda la clave como
   `NAN_API_KEY`, y deja `deepseek-v4-flash` como modelo por defecto.
2. **Mostrar consumo**: `/nan-usage` (informe en texto) y, en la TUI, una pestaña
   `◈` en el sidebar más un chip de créditos en el footer.

La idea original (catálogo con overrides medidos, filtrado de endpoints no-chat,
sobre conservador para modelos desconocidos) viene de
[pi-nan-provider](https://github.com/gtrabanco/pi-nan-provider) (MIT). Ver
`NOTICE` y `lib/overrides.js`.

## Arquitectura

```
lib/index.js      apply(): inyecta servicios y registra panel, comandos, footer y sync
lib/catalog.js    perfil de proveedor del catálogo base (generado) + overrides
lib/overrides.js  correcciones medidas (pi-nan-provider) y alineación con nan-cli
lib/provider.js   detección de la ruta nan en los settings del perfil
lib/setup.js      /nan-setup: clave, fetch de /v1/models, escritura de settings, modelo por defecto
lib/shared.js     ~/.dsh/nan-provider.json: publicar y sincronizar entre perfiles
lib/api.js        cliente HTTP (/usage, /models) y resolución de la clave
lib/source.js     caché compartida panel/comando/command
lib/panel.js      componente React del panel (sin JSX, React del host)
lib/format.js     números, barras, sparkline, fechas (puro)
lib/text-report.js informe de texto y mensajes de error
cordis.patch.yml  fila que monta el bundle en el perfil
dsh-plugin.json   manifiesto v0.15 (metadata de ecosistema)
```

Flujo de datos:

1. `apply()` espera (`ctx.inject`) a que existan `tuiPanels`, `commands`,
   `settings` y `tuiStatus`; nunca hace `ctx.get` a ciegas al activar.
2. El panel, el chip y `/nan-usage` leen de `lib/source.js`, que resuelve la ruta
   nan (id, `baseURL`, `apiKeyEnv`) y consulta `GET {baseURL}/usage`.
3. `/nan-setup` escribe con `settings.mutate('llm-pi-ai', …)` (igual que
   `/provider`), guarda la clave con `credentials.set` y fija el modelo con
   `agentDefaultModel.saveSelection`.
4. El resultado se publica en `~/.dsh/nan-provider.json`; cualquier perfil
   (`dsh-tui`, `desktop`) lo aplica a los ~3 s de arrancar si le falta o va por
   detrás.

## Reglas que no se rompen

- **Sin dependencias de runtime.** Solo `fetch` y servicios del harness. Nada de
  librerías nativas: así funciona en macOS, Linux y Windows.
- **Compatibilidad con la TUI**: el panel usa el React y el `ui` que inyecta el
  host (regla single-React). El reloj es `ui.useAnimationTime`, no timers.
- **Nunca leer el fichero de credenciales.** Siempre `ctx.get('credentials')`.
- **Sin fallback suelto**: si no hay ruta `nan`, `/nan-usage` responde “No NaN
  provider configured — run /nan-setup first”. No consultar URLs ni claves
  sueltas.
- **No inventar capacidades.** Los números salen del catálogo, de nan-cli o de
  overrides con nota de procedencia. Un modelo nuevo desconocido entra con
  128k/4k, texto y sin reasoning ajustable.
- **Etiquetas de esfuerzo**: DSH exige al menos un nivel además de `off` o
  `false`. `false` significa “no razona”: no usarlo para modelos que razonan
  (p. ej. deepseek-v4-flash). Las modalidades solo admiten `text` e `image`.
- **Escrituras idempotentes**: `/nan-setup` nunca borra el proveedor `openai`
  ni los modelos que el usuario haya añadido.
- **Rutas**: siempre `os.homedir()` + `path.join()` + `DSH_HOME`; nada de rutas
  fijas de un SO.

## Desarrollo

```bash
npm install --include=dev   # NODE_ENV=production omite devDependencies
npm test                    # node --test; 52 tests (3 de render se saltan sin React)
```

Convenciones:

- ESM puro con imports relativos terminados en `.js`.
- Sin TypeScript ni build: `lib/` es el artefacto.
- Los tests no tocan la red ni `~/.dsh`: todo va por inyección (`fetchImpl`,
  `settings`/`credentials` falsos, rutas temporales).

## Probar en un perfil real (sin destrozar el tuyo)

1. Crea una copia: `cp -R ~/.dsh/profiles/dsh-tui /tmp/perfil-test`.
2. Apunta el perfil a tu copia del repo: `dsh plugin --profile <perfil> add .`
   (o enlaza `node_modules/dsh-nan-provider` al repo).
3. Arranca la TUI con `DSH_HOME` apuntando a la copia.
4. `/nan-setup` y `/nan-usage`.
5. Antes de tocar tu HOME real, mira `scripts/reset.sh --dry-run`.

## Publicar

1. Cambia la versión en **`package.json` y `dsh-plugin.json`** (deben coincidir;
   el CI lo comprueba). `npm version patch` solo toca `package.json`, así que
   edita el manifiesto a mano.
2. Commit y push a `main` → CI (tests + versión).
3. Crea el tag y el release:
   ```bash
   git tag -a vX.Y.Z -m "dsh-nan-provider X.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "…"
   ```
4. El workflow `publish` publica en npm con provenance cuando el tag llega a
   GitHub. Si la versión ya existe en npm, el job **no falla**: la omite.

   Publicación manual (como alternativa): `npm publish --access public`.
   Nunca reutilices un número ya publicado: npm responde 409.
5. Verifica lo que ve el usuario:
   ```bash
   cd /tmp && npm pack dsh-nan-provider@X.Y.Z && tar -tzf dsh-nan-provider-X.Y.Z.tgz
   ```
6. Notas sobre el ecosistema: el manifiesto v0.15 pasa el chequeo de formas,
   pero la admisión del ecosistema (badges, `Backend`, revisión) se revisa
   aparte; publicar no es estar admitido.

## Instalación para usuarios

- TUI: `dsh plugin --profile dsh-tui add dsh-nan-provider`
  (o `/plugin install dsh-nan-provider`).
- Desktop: Ajustes → Plugins → Add plugin → `dsh-nan-provider`. El perfil
  `desktop` solo lo gestiona la app Electron.
- Configurar una vez con `/nan-setup`; el otro cliente se sincroniza solo.
  El orden de instalación da igual.

## Problemas conocidos

- **Desktop**: no hay panel ni chip (son seams de la TUI). `/nan-usage` da
  texto. Un panel de cliente web requeriría un bundle `dsh.client` propio.
- **Orden de instalación y caché**: instalar justo después de publicar puede
  resolver una versión anterior (`^0.x`). Fija `@latest` o la versión exacta.
- **Sin PowerShell en CI**: `scripts/reset.ps1` no se prueba automáticamente.
- **Windows/Linux**: el código es neutro, pero el desarrollo se valida en
  macOS. Cualquier cambio de rutas o de scripts debe probarse en los tres S.O.
