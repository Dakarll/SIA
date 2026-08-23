// SEGUIMIENTO SHALOM (QR + Back4App + robot de fondo): escaneo de guías,
// registro manual, listado/estado, y notificaciones de entrega.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion } from '../core/ui-helpers.js';
import { parseFetch, SHALOM_CLASE, aclSoloUsuario } from '../core/parseClient.js';
import { mostrarSkeletonCards, pintarHistorialDesdeCache } from '../historial/historial.js';
import { renderEnvios } from './lima.js';

let shalomCameraStream = null;
let shalomScanLoopActive = false;

// ---------- Escaneo de QR ----------

function contextoSeguroParaCamara() {
    return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function mostrarErrorCamara(msg) {
    const el = document.getElementById('shalomCameraError');
    el.textContent = msg;
    el.style.display = 'block';
}
function ocultarErrorCamara() {
    document.getElementById('shalomCameraError').style.display = 'none';
}

export async function iniciarCamaraQR() {
    ocultarErrorCamara();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        mostrarErrorCamara('Este navegador no soporta acceso a cámara desde aquí.');
        return;
    }
    if (!contextoSeguroParaCamara()) {
        mostrarErrorCamara('⚠️ La cámara solo funciona si abres este archivo por HTTPS (o localhost) — abrirlo directo desde tu carpeta de archivos no funciona en la mayoría de navegadores. Usa "Subir foto" mientras tanto.');
        return;
    }

    detenerCamaraQR(); // por si había una cámara abierta de un intento anterior

    const video = document.getElementById('shalomVideo');
    const wrapper = document.getElementById('shalomCameraWrapper');

    try {
        shalomCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        video.srcObject = shalomCameraStream;
        wrapper.style.display = 'block';
        document.getElementById('btnIniciarCamara').style.display = 'none';
        document.getElementById('btnDetenerCamara').style.display = 'inline-block';

        await new Promise(resolve => {
            if (video.readyState >= video.HAVE_METADATA) return resolve();
            video.addEventListener('loadedmetadata', resolve, { once: true });
        });
        await video.play().catch(() => {});

        shalomScanLoopActive = true;
        requestAnimationFrame(shalomScanLoop);
    } catch (err) {
        console.error(err);
        if (err.name === 'NotAllowedError') {
            mostrarErrorCamara('Bloqueaste el permiso de cámara. Habilítalo en el ícono de candado/cámara de la barra de direcciones y vuelve a intentar.');
        } else if (err.name === 'NotFoundError') {
            mostrarErrorCamara('No se encontró ninguna cámara en este dispositivo.');
        } else {
            mostrarErrorCamara('No se pudo acceder a la cámara (' + err.message + '). Usa "Subir foto" en su lugar.');
        }
        detenerCamaraQR();
    }
}

export function detenerCamaraQR() {
    shalomScanLoopActive = false;
    if (shalomCameraStream) {
        shalomCameraStream.getTracks().forEach(t => t.stop());
        shalomCameraStream = null;
    }
    const wrapper = document.getElementById('shalomCameraWrapper');
    if (wrapper) wrapper.style.display = 'none';
    const btnIniciar = document.getElementById('btnIniciarCamara');
    const btnDetener = document.getElementById('btnDetenerCamara');
    if (btnIniciar) btnIniciar.style.display = 'inline-block';
    if (btnDetener) btnDetener.style.display = 'none';
}

function shalomScanLoop() {
    if (!shalomScanLoopActive) return;
    const video = document.getElementById('shalomVideo');
    const canvas = document.getElementById('shalomCanvas');

    if (video && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (codigo && codigo.data) {
            mostrarQRDetectado(codigo.data);
            detenerCamaraQR();
            return;
        }
    }
    requestAnimationFrame(shalomScanLoop);
}

export function leerQRDesdeArchivo(input) {
    const file = input.files[0];
    if (!file) return;
    ocultarErrorCamara();
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.getElementById('shalomCanvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const codigo = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
            if (codigo && codigo.data) {
                mostrarQRDetectado(codigo.data);
            } else {
                mostrarNotificacion('⚠️ No se detectó ningún QR en la imagen. Intenta con mejor luz/enfoque o usa el ingreso manual.', 'warning');
            }
        };
        img.onerror = function () {
            mostrarNotificacion('⚠️ No se pudo leer esa imagen.', 'warning');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// El QR de Shalom NO contiene el N° de Orden público ni el código
// de seguridad — contiene un ID interno propio de Shalom ("oseId",
// ej. "89636411/document/1/"). Con este ID, el robot de fondo puede
// intentar resolver el envío automáticamente (ver Opción A), pero
// no es 100% garantizado — por eso también se ofrece la opción
// manual de siempre como respaldo confiable.
function mostrarQRDetectado(textoQR) {
    document.getElementById('shalomQrTexto').textContent = textoQR;
    document.getElementById('shalomQrResultado').style.display = 'block';
}

// ---------- Registro y listado ----------

export async function registrarGuiaManual() {
    const guia = document.getElementById('shalomGuiaManual').value.trim();
    const codigo = document.getElementById('shalomCodigoManual').value.trim();
    const cliente = document.getElementById('shalomClienteManual').value.trim();
    const destino = document.getElementById('shalomDestinoManual').value.trim();
    const ocTexto = document.getElementById('shalomOcManual').value.trim();
    const numeroOrdenCompra = ocTexto.includes(' — ') ? ocTexto.split(' — ')[0].trim() : (ocTexto || null);
    await crearRegistroShalom(guia, codigo, cliente, destino, numeroOrdenCompra);
    document.getElementById('shalomGuiaManual').value = '';
    document.getElementById('shalomCodigoManual').value = '';
    document.getElementById('shalomClienteManual').value = '';
    document.getElementById('shalomDestinoManual').value = '';
    document.getElementById('shalomOcManual').value = '';
}

export async function crearRegistroShalom(guia, codigo, cliente, destino, numeroOrdenCompra, tipo = 'shalom', estadoInicial = 'pendiente') {
    if (tipo === 'shalom') {
        if (!guia || !codigo) {
            mostrarNotificacion('⚠️ Shalom necesita el N° de Orden Y el Código de Orden (4 dígitos) para poder rastrear', 'warning');
            return;
        }
    } else {
        // Envío Lima: no pasa por Shalom, así que no necesita guía
        // ni código — pero sí algo que lo identifique.
        if (!cliente && !numeroOrdenCompra) {
            mostrarNotificacion('⚠️ Ingresa al menos el cliente o la orden de compra para registrar el envío Lima', 'warning');
            return;
        }
        if (!guia) guia = `LIMA-${Date.now().toString().slice(-8)}`;
    }
    try {
        if (guia) {
            const existentes = await parseFetch(SHALOM_CLASE, 'GET', null, null, { where: { guia }, limit: 1 });
            if (existentes.results && existentes.results.length > 0) {
                mostrarNotificacion(`ℹ️ Ya había un envío registrado con esa referencia (${guia})`, 'info');
                return;
            }
        }

        await parseFetch(SHALOM_CLASE, 'POST', null, {
            guia,
            codigo: codigo || null,
            cliente: cliente || null,
            destino: destino || (tipo === 'lima' ? 'Lima' : null),
            numeroOrdenCompra: numeroOrdenCompra || null,
            estado: estadoInicial,
            tipo,
            notificado: false,
            creadoPorUsername: state.sesionUsuario.username,
            ACL: aclSoloUsuario()
        });
        mostrarNotificacion(tipo === 'lima' ? '✅ Envío Lima registrado' : `✅ Guía ${guia} registrada para seguimiento`, 'success');
        document.getElementById('shalomQrResultado').style.display = 'none';
        cargarEnviosShalom();
    } catch (err) {
        mostrarNotificacion('❌ Error al registrar: ' + err.message, 'warning');
        console.error(err);
    }
}

export function eliminarEnvioShalom(objectId) {
    mostrarConfirmacion('¿Eliminar este envío del seguimiento?', async () => {
        try {
            await parseFetch(SHALOM_CLASE, 'DELETE', objectId);
            cargarEnviosShalom();
        } catch (err) {
            mostrarNotificacion('❌ Error al eliminar: ' + err.message, 'warning');
        }
    });
}

export async function marcarNotificadoShalom(objectId) {
    try {
        await parseFetch(SHALOM_CLASE, 'PUT', objectId, { notificado: true });
    } catch (err) { console.error(err); }
}

export const ETIQUETAS_ESTADO_SHALOM = {
    pendiente: { texto: '⏳ Pendiente', color: 'var(--text-muted)', bg: 'var(--chip-neutral-bg)' },
    en_transito: { texto: '🚚 En tránsito', color: '#3182ce', bg: '#ebf8ff' },
    entregado: { texto: '✅ Entregado', color: '#38a169', bg: '#f0fff4' },
    error: { texto: '⚠️ Error', color: '#e53e3e', bg: '#fff5f5' }
};

export async function cargarEnviosShalom() {
    if (!state.sesionUsuario) return;
    const listEl = document.getElementById('shalomList');
    const bannerEl = document.getElementById('shalomNotifBanner');

    mostrarSkeletonCards('shalomList', 3, 30);

    try {
        const resultado = await parseFetch(SHALOM_CLASE, 'GET', null, null, { order: '-createdAt' });
        state.shalomEnviosCache = resultado.results || [];

        const nuevos = state.shalomEnviosCache.filter(e => e.estado === 'entregado' && !e.notificado);
        if (nuevos.length > 0) {
            bannerEl.style.display = 'block';
            bannerEl.innerHTML = nuevos.map(e => `
                <div class="ios-banner ios-banner--success">
                    <div class="ios-banner-icon">📦</div>
                    <div class="ios-banner-body">
                        <div class="ios-banner-title">${e.guia ? 'Guía ' + e.guia : (e.cliente || 'Envío')} entregado</div>
                        <div class="ios-banner-text">${e.cliente && e.guia ? e.cliente + ' — ' : ''}ya llegó a destino.</div>
                    </div>
                    <button class="ios-banner-dismiss" onclick="marcarNotificadoShalom('${e.objectId}'); this.closest('.ios-banner').remove();">Visto</button>
                </div>
            `).join('');
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                nuevos.forEach(e => new Notification('📦 Envío entregado', { body: `${e.guia || e.cliente || 'Tu envío'} ya llegó a destino.` }));
            } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        } else {
            bannerEl.style.display = 'none';
        }

        renderListaShalom();

        // El Historial y la pestaña Envíos muestran una etiqueta con
        // el estado del envío vinculado — si ya estaban pintados
        // antes de que llegara esta data, los refrescamos ahora sin
        // volver a pedir las cotizaciones al servidor.
        if (document.getElementById('historialList') && document.getElementById('historialList').innerHTML.trim() !== '') {
            pintarHistorialDesdeCache();
        }
        if (document.getElementById('tab-envios') && document.getElementById('tab-envios').classList.contains('active')) {
            renderEnvios();
        }
    } catch (err) {
        listEl.innerHTML = `<div class="historial-empty">❌ Error al conectar con Back4App: ${err.message}</div>`;
        console.error(err);
    }
}

// Filtra state.shalomEnviosCache por el texto del buscador y pinta las tarjetas.
// No vuelve a pedir datos al servidor — solo filtra lo ya cargado.
export function renderListaShalom() {
    const listEl = document.getElementById('shalomList');
    const countEl = document.getElementById('shalomCount');
    const buscadorEl = document.getElementById('shalomBuscador');
    const texto = buscadorEl ? buscadorEl.value.trim().toLowerCase() : '';

    countEl.textContent = state.shalomEnviosCache.length;

    const filtrados = !texto ? state.shalomEnviosCache : state.shalomEnviosCache.filter(e => {
        const info = ETIQUETAS_ESTADO_SHALOM[e.estado] || ETIQUETAS_ESTADO_SHALOM.pendiente;
        const campo = [e.guia, e.codigo, e.oseId, e.cliente, e.destino, e.detalleEstado, e.numeroOrdenCompra, info.texto]
            .filter(Boolean).join(' ').toLowerCase();
        return campo.includes(texto);
    });

    if (state.shalomEnviosCache.length === 0) {
        listEl.innerHTML = '<div class="historial-empty">No hay envíos en seguimiento. Escanea el QR de una guía para empezar.</div>';
        return;
    }
    if (filtrados.length === 0) {
        listEl.innerHTML = '<div class="historial-empty">No se encontró ningún envío con ese criterio de búsqueda.</div>';
        return;
    }

    listEl.innerHTML = filtrados.map(e => {
        const info = ETIQUETAS_ESTADO_SHALOM[e.estado] || ETIQUETAS_ESTADO_SHALOM.pendiente;
        const esLima = e.tipo === 'lima';
        const ultima = esLima
            ? 'Actualización manual'
            : (e.ultimaConsulta ? new Date(e.ultimaConsulta).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Aún no consultado');
        const nombreMostrado = e.cliente || (e.guia ? `Guía ${e.guia}` : '🤖 QR sin resolver aún');
        const subinfo = esLima
            ? '🏙️ Envío Lima (entrega local)'
            : (e.guia ? `Guía ${e.guia}${e.codigo ? ' · Código ' + e.codigo : ''}` : `Registrado por QR — el robot intentará resolverlo`);
        return `
            <div class="shalom-card">
                <div class="shalom-card-top">
                    <div style="min-width:0;">
                        <h3 class="shalom-card-nombre">${nombreMostrado}</h3>
                        <div class="shalom-card-subinfo">${subinfo}</div>
                    </div>
                    <button class="shalom-card-del-btn" onclick="eliminarEnvioShalom('${e.objectId}')" title="Eliminar" aria-label="Eliminar envío del seguimiento">✕</button>
                </div>
                ${e.destino ? `<div class="shalom-card-destino">📍 ${e.destino}</div>` : ''}
                ${e.numeroOrdenCompra ? `<div style="font-size:0.78em; font-weight:700; color:var(--secondary);">🔗 ${e.numeroOrdenCompra}</div>` : ''}
                <span class="shalom-card-estado-badge" style="color:${info.color}; background:${info.bg};">${info.texto}</span>
                ${e.detalleEstado ? `<div class="shalom-card-detalle">${e.detalleEstado}</div>` : ''}
                <div class="shalom-card-fecha">${ultima}${(e.creadoPorUsername && e.creadoPorUsername !== state.sesionUsuario.username) ? ' · por ' + e.creadoPorUsername : ''}</div>
                ${esLima ? `<div style="margin-top:8px;">
                    ${e.estado === 'entregado'
                        ? `<button type="button" class="btn btn-small" style="background:var(--chip-neutral-bg); color:var(--text-muted); width:100%;" onclick="cambiarEstadoLima('${e.objectId}', 'pendiente')">↩ Marcar pendiente</button>`
                        : `<button type="button" class="btn btn-small" style="background:#38a169; color:white; width:100%;" onclick="cambiarEstadoLima('${e.objectId}', 'entregado')">✅ Marcar entregado</button>`
                    }
                </div>` : ''}
            </div>`;
    }).join('');
}

export async function verificarNotificacionesShalomGlobal() {
    if (!state.sesionUsuario) return;
    try {
        const resultado = await parseFetch(SHALOM_CLASE, 'GET', null, null, {
            where: { estado: 'entregado', notificado: false }
        });
        (resultado.results || []).forEach(e => {
            mostrarNotificacion(`🎉 Guía Shalom ${e.guia} ya llegó a destino`, 'success');
        });
    } catch (err) {
        console.error('No se pudo verificar notificaciones Shalom:', err.message);
    }
}

// Busca, dentro de los envíos Shalom ya cargados en memoria, uno
// vinculado al N° de orden de compra dado. Se usa tanto para la
// etiqueta "ya fue enviado" en el Historial como para armar la
// pestaña de Envíos.
export function buscarEnvioPorOC(numeroOC) {
    if (!numeroOC || !Array.isArray(state.shalomEnviosCache)) return null;
    return state.shalomEnviosCache.find(e => e.numeroOrdenCompra === numeroOC) || null;
}

// Etiqueta visual reutilizable para el estado de envío de una
// orden (usada en Historial y en la pestaña Envíos).
export function badgeEnvioHtml(envio) {
    const info = (typeof ETIQUETAS_ESTADO_SHALOM !== 'undefined' && ETIQUETAS_ESTADO_SHALOM[envio.estado])
        ? ETIQUETAS_ESTADO_SHALOM[envio.estado]
        : { texto: '🚚 Enviado', color: '#3182ce', bg: '#ebf8ff' };
    return `<span style="display:inline-block; padding:2px 9px; border-radius:12px; font-size:0.72em; font-weight:700; background:${info.bg}; color:${info.color};">🚚 Envío: ${info.texto}</span>`;
}

// Llena el buscador de "vincular a orden de compra" en Shalom, a
// partir de las órdenes de compra confirmadas que ya están en
// state.historialCache (se actualiza cada vez que se abre Historial).
export function poblarListaOrdenesCompra() {
    const datalist = document.getElementById('listaOrdenesCompra');
    if (!datalist) return;
    const ordenes = state.historialCache.filter(e => e.estado === 'orden_compra' && e.numeroOrdenCompra);
    datalist.innerHTML = ordenes.map(o =>
        `<option value="${o.numeroOrdenCompra} — ${o.cliente}"></option>`
    ).join('');
}

export function initShalom() {
    document.getElementById('btnIniciarCamara').addEventListener('click', iniciarCamaraQR);
    document.getElementById('btnDetenerCamara').addEventListener('click', detenerCamaraQR);
    document.getElementById('shalomInputArchivo').addEventListener('change', function () { leerQRDesdeArchivo(this); });
    document.getElementById('btnRegistrarGuiaManual').addEventListener('click', registrarGuiaManual);
    document.getElementById('shalomBuscador').addEventListener('input', renderListaShalom);
    document.getElementById('btnActualizarShalom').addEventListener('click', cargarEnviosShalom);

    window.marcarNotificadoShalom = marcarNotificadoShalom;
    window.eliminarEnvioShalom = eliminarEnvioShalom;
    window.cargarEnviosShalom = cargarEnviosShalom;
}
