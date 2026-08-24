// PAPELETA DE ENVÍO: tarjeta visual descargable/copiable con el estado de
// un envío Shalom, inspirada en el comprobante que muestra la app oficial
// de Shalom pero con la identidad de Línea Hotelera. Es puramente de
// presentación en el cliente — no escribe nada en Back4App, solo lee de
// state.shalomEnviosCache (ya cargado por envios/shalom.js).
import { state } from '../core/state.js';
import { mostrarNotificacion, showLoading } from '../core/ui-helpers.js';
import { descargarOCompartirBlob, copiarImagenAlPortapapeles } from '../cotizador/export.js';

const ETIQUETAS_PASO = ['En origen', 'En tránsito', 'En destino', 'Entregado'];
const TITULOS_PASO = ['EN ORIGEN', 'EN TRÁNSITO', 'EN DESTINO', 'ENTREGADO'];
const EMOJIS_PASO = ['📍', '🚚', '📦', '✅'];

let envioActual = null;

// Quita tildes y pasa a minúsculas para poder comparar el texto libre
// de detalleEstado contra palabras clave sin que un acento lo rompa.
function normalizar(texto) {
    return (texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

// Determina en qué paso (1-4) de la barra de progreso está el envío.
// Se prioriza el texto libre de detalleEstado sobre el campo grueso
// "estado" porque Shalom a veces manda un detalle más preciso ahí
// (ej. "En destino — Está listo para su recojo") antes de que el
// robot de fondo actualice el "estado" general.
function determinarPasoActual(envio) {
    const detalle = normalizar(envio.detalleEstado);

    if (envio.estado === 'entregado' || detalle.includes('entregad') || detalle.includes('recogido') || detalle.includes('fue recogid')) {
        return 4;
    }
    if (detalle.includes('en destino') || detalle.includes('listo para') || detalle.includes('para su recojo') || detalle.includes('para recojo')) {
        return 3;
    }
    if (envio.estado === 'en_transito' || detalle.includes('transito') || detalle.includes('en camino') || detalle.includes('en ruta')) {
        return 2;
    }
    return 1;
}

function formatearFecha(iso) {
    if (!iso) return 'Aún sin actualizar por el robot';
    const fecha = new Date(iso);
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const aa = String(fecha.getFullYear()).slice(-2);
    const hh = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');
    return `Desde el ${dd}/${mm}/${aa} a las ${hh}:${min}`;
}

function renderBarraPasos(pasoActual) {
    return `
        <div class="papeleta-steps">
            ${[1, 2, 3, 4].map((paso, i) => `
                ${i > 0 ? `<div class="papeleta-step-connector ${paso <= pasoActual ? 'current' : ''}"></div>` : ''}
                <div class="papeleta-step-circle ${paso === pasoActual ? 'current' : ''}">${paso === pasoActual ? '✓' : paso}</div>
            `).join('')}
        </div>
        <div class="papeleta-steps-labels">
            ${ETIQUETAS_PASO.map((etiqueta, i) => `<div class="papeleta-step-label ${i + 1 === pasoActual ? 'current' : ''}">${etiqueta}</div>`).join('')}
        </div>
    `;
}

function armarHtmlPapeleta(envio) {
    const esError = envio.estado === 'error';
    const pasoActual = esError ? null : determinarPasoActual(envio);
    const emojiBadge = esError ? '⚠️' : EMOJIS_PASO[pasoActual - 1];
    const titulo = esError ? '⚠️ ERROR DE SEGUIMIENTO' : TITULOS_PASO[pasoActual - 1];

    const guiaLinea = (envio.guia || envio.codigo)
        ? `<div class="papeleta-guia">${[envio.guia, envio.codigo].filter(Boolean).join(' - ')}</div>`
        : '';

    return `
        <div class="papeleta-header">
            <div class="papeleta-brand">🏨 LÍNEA HOTELERA</div>
            <div class="papeleta-badge">${emojiBadge}</div>
        </div>
        <div class="papeleta-estado-titulo">${titulo}</div>
        ${guiaLinea}
        <div class="papeleta-fecha">${formatearFecha(envio.ultimaConsulta)}</div>
        ${!esError ? renderBarraPasos(pasoActual) : ''}
        ${envio.detalleEstado ? `
            <div class="papeleta-mensaje">
                <div class="papeleta-mensaje-texto">${envio.detalleEstado}</div>
            </div>
        ` : ''}
        <div class="papeleta-divider"></div>
        ${envio.destino ? `
            <div class="papeleta-row-label">📍 Destino</div>
            <div class="papeleta-row-value">${envio.destino}</div>
        ` : ''}
        ${envio.cliente ? `
            <div class="papeleta-row-label">👤 Destinatario</div>
            <div class="papeleta-row-value">${envio.cliente}</div>
        ` : ''}
        ${envio.numeroOrdenCompra ? `<div class="papeleta-oc-chip">🔗 ${envio.numeroOrdenCompra}</div>` : ''}
        <div class="papeleta-footer">Seguimiento generado por Línea Hotelera · afiliado oficial de Shalom</div>
    `;
}

export function abrirPapeleta(objectId) {
    const envio = state.shalomEnviosCache.find(e => e.objectId === objectId);
    if (!envio) {
        mostrarNotificacion('❌ No se encontró ese envío', 'warning');
        return;
    }
    if (envio.tipo === 'lima') {
        mostrarNotificacion('ℹ️ La papeleta solo aplica a envíos Shalom', 'info');
        return;
    }

    envioActual = envio;
    document.getElementById('papeletaPreviewCard').innerHTML = armarHtmlPapeleta(envio);
    document.getElementById('papeletaModal').classList.add('active');
}

export function cerrarPapeleta() {
    document.getElementById('papeletaModal').classList.remove('active');
}

// Dibuja la tarjeta ya renderizada en #papeletaPreviewCard y devuelve
// el PNG resultante como Blob (mismo patrón que generarImagenCotizacionBlob
// en cotizador/export.js).
async function generarPapeletaBlob() {
    const element = document.getElementById('papeletaPreviewCard');
    const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: element.offsetWidth,
        height: element.offsetHeight
    });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function descargarPapeleta() {
    showLoading(true);
    try {
        const blob = await generarPapeletaBlob();
        await descargarOCompartirBlob(blob, `Papeleta_Envio_${Date.now()}.png`, 'image/png');
        showLoading(false);
        mostrarNotificacion('✅ Papeleta generada y descargada', 'success');
    } catch (error) {
        console.error('Error al generar la papeleta:', error);
        showLoading(false);
        mostrarNotificacion('❌ Error al generar la papeleta', 'error');
    }
}

export async function copiarPapeleta() {
    showLoading(true);
    try {
        const blob = await generarPapeletaBlob();
        const copiada = await copiarImagenAlPortapapeles(blob);
        showLoading(false);
        mostrarNotificacion(
            copiada ? '✅ Papeleta copiada al portapapeles' : '⚠️ Tu navegador no permite copiar automáticamente — usa el botón "Descargar / Compartir"',
            copiada ? 'success' : 'warning'
        );
    } catch (error) {
        console.error('Error al generar la papeleta:', error);
        showLoading(false);
        mostrarNotificacion('❌ Error al generar la papeleta', 'error');
    }
}

export function initPapeleta() {
    document.getElementById('btnCerrarPapeletaModal').addEventListener('click', cerrarPapeleta);
    document.getElementById('btnDescargarPapeleta').addEventListener('click', descargarPapeleta);
    document.getElementById('btnCopiarPapeleta').addEventListener('click', copiarPapeleta);
    document.getElementById('papeletaModal').addEventListener('click', function (e) {
        if (e.target === this) cerrarPapeleta();
    });

    // El botón "🎫 Ver papeleta" se genera dinámicamente vía innerHTML
    // en envios/shalom.js (mismo patrón que window.eliminarEnvioShalom).
    window.abrirPapeleta = abrirPapeleta;
}
