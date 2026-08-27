# Línea Hotelera — Cotizador

Cotizador comercial para "Línea Hotelera": una app de una sola página (sin
build step, sin framework) para armar cotizaciones/órdenes de compra,
llevar historial, catálogo de productos y sucursales, seguimiento de
envíos Shalom / entregas locales Lima, fichas técnicas y un dashboard de
ventas. El backend es [Back4App](https://www.back4app.com/) (Parse
Server) vía su API REST.

## Cómo correr el proyecto

Los módulos de JavaScript usan `import`/`export` nativos de ES Modules,
que **no funcionan abriendo `index.html` directo con `file://`** —
necesitan servirse por HTTP. Cualquier servidor estático sirve:

```bash
python3 -m http.server 8123
```

y abrir `http://localhost:8123/index.html`. (También funciona con
`npx serve`, la extensión "Live Server" de VS Code, GitHub Pages, etc.)

## Estructura

```
index.html                  Solo estructura HTML + <script type="module" src="js/main.js">
css/
  base.css                  Variables :root, reset, tipografía, tokens de dark mode
  layout.css                Header, tabs, modales, botones, tablas, componentes
  print.css                 Cotización/ficha/sucursales imprimibles (exportadas a imagen/PDF)
js/
  main.js                   Punto de entrada: importa todo, registra listeners globales, window.onload
  core/
    state.js                Objeto único de estado compartido (state = {...})
    parseClient.js           parseFetch() + constantes de clase de Parse/Back4App
    auth.js                  Login, registro, logout, panel de cuenta, validarAccesoAlCargar
    ui-helpers.js            Notificaciones, modal de confirmación/prompt, dark mode, debounce
  cotizador/
    productos-tabla.js       Tabla de la cotización, autocompletar, totales, pago, plantillas, switchTab
    precios.js                IGV, niveles de precio (tiers), overrides de precio manual
    cliente.js                Panel de datos de cliente + base de clientes local
    export.js                  Imagen, Excel, WhatsApp, armado del bloque imprimible
  catalogo/
    productos-crud.js        Alta/edición/baja de productos, migración de catálogo a la nube
    sucursales-crud.js       Alta/edición/baja de sucursales, filtro y mapa por provincia
  historial/
    historial.js             Guardar/listar/filtrar/ver/cargar/eliminar cotizaciones
    correlativos.js           Contadores COT-/OC- (numeración consecutiva)
  envios/
    shalom.js                 Escaneo QR, registro y seguimiento de guías Shalom
    lima.js                    Pestaña "Envíos" (resumen) + entregas locales Lima
    lista-compra.js           Lista de compra agregada de órdenes pendientes de despacho
  dashboard/
    dashboard.js               KPIs y gráficos (Chart.js) por rango de fechas
  fichas-tecnicas/
    fichas.js                  Formulario → vista previa → PDF de fichas técnicas
```

## Estado compartido

Antes vivía como variables sueltas (`let productosDB`, `let
sucursalSeleccionada`, etc.) repartidas por un único script de ~4600
líneas. Ahora todas viven como propiedades de un único objeto exportado
desde `js/core/state.js`:

```js
export const state = { productosDB, sucursalesDB, productosEnTabla,
  historialCache, cloudConfig, sesionUsuario, mostrarConIGV,
  forzarPorMayor, shalomEnviosCache, dashRango, contadorObjectIds,
  chartDepartamentosInstancia, chartTendenciaInstancia, tabActual,
  tipoFiltro, productoSeleccionado, sucursalSeleccionada,
  productoEditandoIndex, sucursalEditandoIndex, cotizacionActualId };
```

Todos los módulos importan `state` y mutan sus propiedades
(`state.productosDB = ...`) en vez de tener su propia variable — la
lógica de negocio no cambió, solo el lugar donde vive el dato.

## Funciones expuestas en `window`

El HTML original tenía ~96 atributos `onclick`/`onchange`/`oninput`/
`onsubmit` estáticos en el marcado — **todos** se convirtieron a
`addEventListener` (con `id` o `data-*` donde faltaba) registrados desde
la función `initXxx()` de cada módulo, llamadas todas desde
`js/main.js`.

Además del HTML estático, varias funciones **generan** HTML dinámicamente
con `onclick="miFuncion(...)"` dentro de un string (filas de tabla,
tarjetas de historial/envíos/sucursales, etc.). Esos atributos se
evalúan en el scope global del navegador, así que las funciones que
referencian se quedaron expuestas explícitamente en `window` (dentro del
`initXxx()` de su propio módulo) en vez de convertirse a
`addEventListener`, que hubiera requerido reescribir cada función de
render para construir nodos DOM en vez de strings — fuera del alcance de
esta migración (solo reorganizar, no reescribir lógica). Lista completa:

`cambiarEstadoCotizacion`, `cambiarEstadoLima`, `cancelarPrecioEdit`,
`cargarClienteDB`, `cargarDesdeHistorial`, `cargarEnviosShalom`,
`cargarPlantilla`, `copiarListaCompraTexto`, `editarProducto`,
`editarSucursal`, `eliminarDeHistorial`, `eliminarEnvioShalom`,
`eliminarPlantilla`, `eliminarProducto`, `eliminarSucursal`,
`exportarListaCompraExcel`, `guardarPrecioOverride`, `irARegistrarGuia`,
`marcarNotificadoShalom`, `mostrarConfirmacion`, `mostrarPrompt`,
`registrarPagoCotizacion`, `removeProduct`, `restaurarPrecio`, `seleccionarSucursal`,
`switchTabById`, `togglePrecioEdit`, `updateCantidad`,
`verCotizacionDetalle`.

`mostrarConfirmacion`/`mostrarPrompt` ya estaban expuestas así en el
código original (no es algo nuevo de la migración).

## Notas / riesgos encontrados durante la migración

- **`renderPlantillas` no existe.** Se llama en 3 sitios
  (`js/cotizador/productos-tabla.js`, dos veces, y `js/main.js` en el
  bootstrap de `window.onload`) pero nunca se definió en el código
  original. Es un bug preexistente (no introducido por esta migración):
  produce un `ReferenceError` silencioso, atrapado por el `try/catch`
  del `window.onload`, que corta la inicialización justo ahí (por eso
  los `console.log` de "Cotizador cargado correctamente" nunca
  aparecen). Se dejó tal cual — no se creó la función — para no cambiar
  comportamiento sin que se pida explícitamente.
- **`cargarProductosSelectorFicha` (fichas técnicas) tampoco se llama
  desde ningún lado** en el código original — el selector de producto de
  la pestaña "Fichas Técnicas" nunca se puebla automáticamente. Mismo
  criterio: se dejó como estaba, exportada pero sin invocar.
- **`enviarWhatsApp()`** (en `js/cotizador/export.js`) no tiene ningún
  botón que lo dispare en el HTML actual, ni la clase `.btn-whatsapp` se
  usa en ningún elemento visible — código huérfano ya desde antes de la
  migración. Se dejó exportado por si se vuelve a enganchar más
  adelante.
- **App ID y JavaScript Key de Back4App hardcodeados** en
  `js/core/state.js` — es intencional y ya estaba documentado así en el
  código original (son claves públicas, seguras de exponer en cliente;
  la Master Key nunca estuvo en el código). No se tocó.
- No se encontró ningún otro riesgo de seguridad real durante la
  migración.

## Qué NO cambió

La lógica de negocio (precios, IGV, tiers, correlativos, ACLs de
Back4App, URLs de la API) es exactamente la misma que antes — esta
migración solo reorganizó dónde vive el código. Los únicos ajustes de
comportamiento fueron los estrictamente necesarios para resolver el
acoplamiento de `onclick` inline y variables globales sueltas (ver
sección anterior y los comentarios en `switchTab`/`switchTabById` sobre
`data-tab` reemplazando el parseo del atributo `onclick`).
