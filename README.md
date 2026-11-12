# dsh-nan-usage

Usage de tu suscripción **NaN** ([nan.builders](https://nan.builders)) dentro de
la TUI de DeepSeek Harness: créditos del periodo de facturación, gasto de tokens
de los últimos 30 días y desglose por modelo, en el sidebar.

🇬🇧 [English](README.en.md) · 🇪🇸 **Español**

<p align="center">
  <img src="docs/panel.jpg" alt="Panel «NaN usage» y chip de créditos en el footer" width="900">
</p>

## Qué añade

- **Pestaña «NaN usage»** en el sidebar, junto a Info / Todo / Jobs (icono `◈`).
  Se abre con `/usage` o clicando su icono. Muestra:
  - barra y porcentaje de créditos usados en el periodo,
  - créditos restantes, días que quedan y créditos de pack,
  - últimos 30 días: tokens, peticiones, créditos y top de modelos,
  - sparkline de créditos diarios y total histórico.
- **`/usage`** abre la pestaña (no gasta una petición si el panel ya está cargado).
- **`/usage text`** devuelve el informe compacto en el chat; también es el
  fallback si el host no tiene panels.
- **`r`** dentro del panel refresca (caché de 20 s y respetando el límite de
  30 peticiones/minuto del endpoint).
- **Chip en el footer** con los créditos restantes (`NaN 6,195 cr · 14d`) en la
  línea de estado del host; al pasar el ratón muestra usado/restante/periodo.
  `footer: false` lo apaga.

> El panel «Info» del sidebar es código del host y tiene secciones fijas: un
> plugin no puede inyectar filas dentro. La vía soportada es una pestaña propia.
> El chip del footer se une a la línea de estado existente del host — dsh-tui no
> tiene seam para una línea extra de footer — y queda después del cwd. Si algún
> día el host expone una API de secciones/footer, la capa de datos se puede mover
> sin cambios.

## Instalación

```bash
dsh plugin --profile dsh-tui add dsh-nan-usage
```

Desde el código:

```bash
git clone https://github.com/javipm/dsh-nan-usage.git
dsh plugin --profile dsh-tui add ./dsh-nan-usage
```

Después reinicia la TUI con `/restart` (o sal y vuelve a entrar). La instalación
queda como dependencia `link:`, así que los cambios en este directorio se ven al
reiniciar sin reinstalar.

## Clave de API

Usa el mismo credential ref que el proveedor NaN del perfil:

1. `credentials.resolve('OPENAI_API_KEY')` del store de credenciales del harness
   (`~/.dsh/.credentials.yaml`), y
2. si no existe, la variable de entorno `OPENAI_API_KEY`.

Configurable con `apiKeyEnv`. Nunca lee el fichero de credenciales directamente.

El endpoint es `GET https://api.nan.builders/v1/usage` (documentado en
`https://nan.builders/openapi.json`). No consume créditos: es una consulta de
facturación.

## Configuración

Todo es opcional; se ajusta en la fila `nan-usage` de
`~/.dsh/profiles/dsh-tui/cordis.patch.yml`:

| clave | por defecto | qué hace |
| --- | --- | --- |
| `apiKeyEnv` | `OPENAI_API_KEY` | ref de credencial / variable de entorno |
| `baseUrl` | `https://api.nan.builders/v1` | base de la API |
| `windowDays` | `30` | ventana del desglose (1–90; la API rechaza más de 90) |
| `autoRefreshSeconds` | `60` | refresco automático con el panel visible (`0` lo apaga) |
| `lowCreditsPercent` | `10` | umbral del badge `warning`/`error` |
| `commandName` | `usage` | nombre del comando |
| `panelId` | `usage` | id interno del panel |
| `panelTitle` | `NaN usage` | título de la pestaña |
| `footer` | `true` | chip en el footer con los créditos restantes (`false` lo apaga) |
| `footerRefreshMinutes` | `15` | refresco del campo de footer |
| `cacheSeconds` | `20` | caché compartida panel/comando |

Ejemplo:

```yaml
- id: nan-usage
  name: 'dsh-nan-usage'
  config:
    windowDays: 30
    autoRefreshSeconds: 120
    footer: true
```

## Desarrollo

```bash
npm install --include=dev   # NODE_ENV=production omite devDependencies si no se lo pides
npm test                    # 19 tests; los 3 de render usan react-test-renderer
```

Sin dependencias de runtime: solo `fetch` y el servicio de credenciales del
harness. El panel renderiza con el React y el `ui` del host (regla single-React)
y usa `ui.useAnimationTime` como reloj, no timers privados.

## Estructura

```text
lib/index.js        alta del panel, /usage y footer (cordis inject)
lib/api.js          cliente de /usage + normalización defensiva
lib/source.js       caché compartida y resolución de la clave
lib/panel.js        componente React del panel (sin JSX, React del host)
lib/format.js       números, barras, sparkline, fechas (puro)
lib/text-report.js  informe de texto y mensajes de error
cordis.patch.yml    fila que monta el bundle en el perfil
dsh-plugin.json     manifiesto 0.15 (metadata de ecosistema)
```
