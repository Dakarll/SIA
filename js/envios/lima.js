// TAB: ENVÍOS — vista de órdenes de compra + su estado de envío, con el
// mismo lenguaje visual (tarjetas) que el Historial. No pide datos
// nuevos al servidor: reutiliza state.historialCache (cotizaciones) y
// state.shalomEnviosCache (guías Shalom), ambos ya cargados por
// inicializarAppPostLogin(). También incluye los envíos locales Lima
// (entregas que no pasan por Shalom: moto propia, delivery, recojo en
// tienda) — reutilizan la misma tabla y los mismos badges/filtros que
// Shalom para no duplicar lógica, distinguiéndose solo por el campo "tipo".
import { state } from '../core/state.js';
import { mostrarNotificacion } from '../core/ui-helpers.js';
import { parseFetch, SHALOM_CLASE } from '../core/parseClient.js';
import { buscarEnvioPorOC, badgeEnvioHtml, crearRegistroShalom, cargarEnviosShalom } from './shalom.js';
import { pintarResumenListaCompra } from './lista-compra.js';
import { switchTabById } from '../cotizador/productos-tabla.js';

export function renderEnvios() {
    const listEl = document.getElementById('enviosList');
    const countEl = document.getElementById('enviosCount');
    if (!listEl) return;

    pintarResumenListaCompra();

    const ordenes = state.historialCache.filter(e => e.estado === 'orden_compra');

    const filtroTextoEl = document.getElementById('enviosFiltroTexto');
    const filtroEstadoEl = document.getElementById('enviosFiltroEstado');
    const filtroTexto = filtroTextoEl ? filtroTextoEl.value.trim().toLowerCase() : '';
    const filtroEstado = filtroEstadoEl ? filtroEstadoEl.value : '';

    const filas = ordenes.map(entry => {
        const envio = buscarEnvioPorOC(entry.numeroOrdenCompra);
        return { entry, envio };
    }).filter(({ entry, envio }) => {
        if (filtroTexto) {
            const texto = `${entry.cliente || ''} ${entry.empresa || ''} ${envio ? envio.guia || '' : ''}`.toLowerCase();
            if (!texto.includes(filtroTexto)) return false;
        }
        if (filtroEstado) {
            if (filtroEstado === 'sin_envio') { if (envio) return false; }
            else if (!envio || envio.estado !== filtroEstado) return false;
        }
        return true;
    });

    if (countEl) countEl.textContent = filas.length;

    if (ordenes.length === 0) {
        listEl.innerHTML = `<div class="historial-empty">Aún no tienes órdenes de compra confirmadas.<br><br>Marca una cotización como <strong>"✅ Marcar venta"</strong> en el Historial para que aparezca aquí.</div>`;
        return;
    }
    if (filas.length === 0) {
        listEl.innerHTML = `<div class="historial-empty">No se encontraron órdenes con esos filtros.</div>`;
        return;
    }

    listEl.innerHTML = `<div class="historial-list">${filas.map(({ entry, envio }) => {
        const fecha = new Date(entry.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const badgeEnvio = envio
            ? badgeEnvioHtml(envio)
            : `<span style="display:inline-block; padding:2px 9px; border-radius:12px; font-size:0.72em; font-weight:700; background:#fff5f5; color:#c53030;">🚫 Sin envío registrado</span>`;
        const guiaLinea = envio
            ? `<span>📮 Guía ${envio.guia}${envio.destino ? ' · ' + envio.destino : ''}</span>`
            : '';
        return `
            <div class="historial-card">
                <div class="historial-card-left">
                    <div class="historial-card-title">${entry.numeroOrdenCompra ? `<span style="color:var(--secondary); font-weight:800;">${entry.numeroOrdenCompra}</span> · ` : ''}👤 ${entry.cliente}${entry.empresa ? ' — ' + entry.empresa : ''}</div>
                    <div class="historial-card-meta">
                        <span>📅 ${fecha}</span>
                        <span>📦 ${entry.numProductos || 0} producto${entry.numProductos !== 1 ? 's' : ''}</span>
                        ${guiaLinea}
                    </div>
                    <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${badgeEnvio}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <div class="historial-card-total">S/ ${(entry.total || 0).toFixed(2)}</div>
                    <div class="historial-card-actions">
                        <button class="btn-historial-load" style="background:var(--secondary);" onclick="verCotizacionDetalle('${entry.objectId}')">👁️ Ver</button>
                        ${envio
                            ? `<button class="btn-historial-load" style="background:var(--chip-neutral-bg); color:var(--text-muted);" onclick="switchTabById('shalom'); cargarEnviosShalom();">🚚 Ver en Shalom</button>`
                            : `<button class="btn-historial-load" style="background:#e8f9ee; color:#38a169;" onclick="irARegistrarGuia('${entry.numeroOrdenCompra || ''}', '${(entry.cliente || '').replace(/'/g, "\\'")}')">➕ Registrar guía</button>`
                        }
                    </div>
                </div>
            </div>`;
    }).join('')}</div>`;
}

// Atajo desde la pestaña Envíos: salta a Seguimiento Shalom con el
// formulario de "Registrar nueva guía" pre-rellenado con el
// cliente y la orden de compra, para no tener que volver a
// escribirlos.
export function irARegistrarGuia(numeroOC, cliente) {
    switchTabById('shalom');
    const ocInput = document.getElementById('shalomOcManual');
    const clienteInput = document.getElementById('shalomClienteManual');
    if (ocInput) ocInput.value = numeroOC || '';
    if (clienteInput && !clienteInput.value) clienteInput.value = cliente || '';
    const guiaInput = document.getElementById('shalomGuiaManual');
    if (guiaInput) guiaInput.focus();
}

export async function registrarEnvioLima() {
    const cliente = document.getElementById('limaClienteManual').value.trim();
    const direccion = document.getElementById('limaDireccionManual').value.trim();
    const repartidor = document.getElementById('limaRepartidorManual').value.trim();
    const estadoInicial = document.getElementById('limaEstadoManual').value || 'pendiente';
    const ocTexto = document.getElementById('limaOcManual').value.trim();
    const numeroOrdenCompra = ocTexto.includes(' — ') ? ocTexto.split(' — ')[0].trim() : (ocTexto || null);
    const destino = [direccion, repartidor ? `Repartidor: ${repartidor}` : ''].filter(Boolean).join(' · ');

    await crearRegistroShalom(null, null, cliente, destino, numeroOrdenCompra, 'lima', estadoInicial);

    document.getElementById('limaClienteManual').value = '';
    document.getElementById('limaDireccionManual').value = '';
    document.getElementById('limaRepartidorManual').value = '';
    document.getElementById('limaOcManual').value = '';
    document.getElementById('limaEstadoManual').value = 'pendiente';
}

// Los envíos Lima no tienen robot que los actualice (no pasan por
// la API de Shalom), así que el estado se cambia a mano con este
// botón. Nunca toca envíos tipo "shalom".
export async function cambiarEstadoLima(objectId, nuevoEstado) {
    try {
        await parseFetch(SHALOM_CLASE, 'PUT', objectId, { estado: nuevoEstado, notificado: nuevoEstado !== 'entregado' ? true : false });
        cargarEnviosShalom();
    } catch (err) {
        mostrarNotificacion('❌ Error al actualizar: ' + err.message, 'warning');
    }
}

export function initLima() {
    document.getElementById('enviosFiltroTexto').addEventListener('input', renderEnvios);
    document.getElementById('enviosFiltroEstado').addEventListener('change', renderEnvios);
    document.getElementById('btnLimpiarFiltrosEnvios').addEventListener('click', () => {
        document.getElementById('enviosFiltroTexto').value = '';
        document.getElementById('enviosFiltroEstado').value = '';
        renderEnvios();
    });
    document.getElementById('btnRegistrarEnvioLima').addEventListener('click', registrarEnvioLima);
    document.getElementById('btnActualizarEnvios').addEventListener('click', () => { cargarEnviosShalom(); renderEnvios(); });

    window.irARegistrarGuia = irARegistrarGuia;
    window.cambiarEstadoLima = cambiarEstadoLima;
}
