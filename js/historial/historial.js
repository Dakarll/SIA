// Historial de cotizaciones (Back4App, atado al usuario): guardar,
// listar/filtrar, ver detalle, cargar, eliminar y cambiar de estado.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion } from '../core/ui-helpers.js';
import { parseFetch, COTIZACION_CLASE, aclSoloUsuario } from '../core/parseClient.js';
import { getClienteData, actualizarResumenCliente } from '../cotizador/cliente.js';
import { obtenerPrecio, calcularPrecioConIGV } from '../cotizador/precios.js';
import { renderTable, guardarEstado } from '../cotizador/productos-tabla.js';
import { renderSucursales, mostrarSucursalSeleccionada } from '../catalogo/sucursales-crud.js';
import { siguienteCorrelativo } from './correlativos.js';
import { buscarEnvioPorOC, badgeEnvioHtml, poblarListaOrdenesCompra } from '../envios/shalom.js';
import { switchTabById } from '../cotizador/productos-tabla.js';

// opts.silencioso: omite la notificación (se usa cuando el guardado
// es automático, p.ej. justo antes de generar la imagen, para
// asegurar el correlativo real sin interrumpir con un aviso extra).
// Devuelve el N° de correlativo (COT-/OC-) ya asignado a esta
// cotización, o null si el guardado falló.
export async function guardarEnHistorial(opts = {}) {
    const silencioso = !!opts.silencioso;
    if (state.productosEnTabla.length === 0) { mostrarNotificacion('Agrega productos primero', 'warning'); return null; }
    const cliente = getClienteData();
    let subtotal = 0;
    let gananciaEstimada = 0;
    let hayCosto = false;
    state.productosEnTabla.forEach(p => {
        const precio = p.precioOverride !== undefined ? p.precioOverride : obtenerPrecio(p, p.cantidad);
        subtotal += p.cantidad * precio;
        if (p.costo !== undefined && p.costo !== null && !isNaN(p.costo)) {
            hayCosto = true;
            gananciaEstimada += p.cantidad * (precio - p.costo);
        }
    });
    const totalFinal = state.mostrarConIGV ? calcularPrecioConIGV(subtotal) : subtotal;

    const entrada = {
        fecha: new Date().toISOString(),
        cliente: cliente.nombre || 'Sin nombre',
        empresa: cliente.empresa || '',
        ruc: cliente.ruc || '',
        telefono: cliente.telefono || '',
        email: cliente.email || '',
        direccion: cliente.direccion || '',
        notas: cliente.notas || '',
        productos: JSON.parse(JSON.stringify(state.productosEnTabla)),
        sucursal: state.sucursalSeleccionada ? { ...state.sucursalSeleccionada } : null,
        total: totalFinal,
        mostrarConIGV: state.mostrarConIGV,
        forzarPorMayor: state.forzarPorMayor
    };

    let numeroAsignado = null;
    try {
        if (state.cotizacionActualId) {
            // Ya existe un registro para esta cotización en curso
            // (se guardó/generó antes en esta misma sesión de
            // edición) — se actualiza EL MISMO, sin tocar su
            // correlativo ni crear uno nuevo.
            await parseFetch(COTIZACION_CLASE, 'PUT', state.cotizacionActualId, {
                cliente: entrada.cliente,
                empresa: entrada.empresa,
                total: entrada.total,
                numProductos: entrada.productos.length,
                provincia: state.sucursalSeleccionada ? (state.sucursalSeleccionada.provincia || null) : null,
                ganancia: hayCosto ? gananciaEstimada : null,
                datos: JSON.stringify(entrada)
            });
            const registro = state.historialCache.find(e => e.objectId === state.cotizacionActualId);
            numeroAsignado = registro ? (registro.estado === 'orden_compra' ? registro.numeroOrdenCompra : registro.numeroCotizacion) : null;
            if (!silencioso) mostrarNotificacion('✅ Cotización actualizada (mismo correlativo)', 'success');
        } else {
            const numero = await siguienteCorrelativo('cotizacion');
            const creado = await parseFetch(COTIZACION_CLASE, 'POST', null, {
                cliente: entrada.cliente,
                empresa: entrada.empresa,
                total: entrada.total,
                numProductos: entrada.productos.length,
                provincia: state.sucursalSeleccionada ? (state.sucursalSeleccionada.provincia || null) : null,
                ganancia: hayCosto ? gananciaEstimada : null,
                estado: 'cotizada',
                numeroCotizacion: numero,
                datos: JSON.stringify(entrada),
                creadoPorUsername: state.sesionUsuario.username,
                ACL: aclSoloUsuario()
            });
            state.cotizacionActualId = creado.objectId;
            numeroAsignado = numero;
            if (!silencioso) mostrarNotificacion(`✅ Cotización ${numero} guardada en historial`, 'success');
        }
        await renderHistorial();
        return numeroAsignado;
    } catch (err) {
        mostrarNotificacion('❌ Error al guardar en la nube: ' + err.message, 'warning');
        console.error(err);
        return null;
    }
}

export function limpiarFiltrosHistorial() {
    document.getElementById('historialFiltroTexto').value = '';
    document.getElementById('historialFiltroDesde').value = '';
    document.getElementById('historialFiltroHasta').value = '';
    pintarHistorialDesdeCache();
}

// Muestra tarjetas "esqueleto" animadas mientras se espera la
// respuesta de la nube, en vez de dejar la lista vacía o con el
// contenido anterior (se siente más rápido y más pulido).
export function mostrarSkeletonCards(contenedorId, cantidad = 3, alto = 70) {
    const el = document.getElementById(contenedorId);
    if (!el) return;
    el.innerHTML = Array.from({ length: cantidad }).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-block" style="width:60%; height:16px;"></div>
            <div class="skeleton-block" style="width:40%; height:12px;"></div>
            <div class="skeleton-block" style="width:90%; height:${alto}px;"></div>
        </div>
    `).join('');
}

export async function renderHistorial() {
    if (!state.sesionUsuario) return;
    const listEl = document.getElementById('historialList');
    if (!listEl) return;

    mostrarSkeletonCards('historialList', 3, 40);

    try {
        const resultado = await parseFetch(COTIZACION_CLASE, 'GET', null, null, { order: '-createdAt', limit: 100 });
        state.historialCache = resultado.results || [];
    } catch (err) {
        listEl.innerHTML = `<div class="historial-empty">❌ Error al conectar con Back4App: ${err.message}</div>`;
        console.error(err);
        return;
    }

    pintarHistorialDesdeCache();
}

// Repinta el Historial usando lo que ya está en state.historialCache, sin
// volver a pedir las cotizaciones al servidor. Se usa al aplicar
// filtros y al refrescar las etiquetas de envío cuando llega data
// nueva de Shalom.
export function pintarHistorialDesdeCache() {
    const listEl = document.getElementById('historialList');
    const countEl = document.getElementById('historialCount');
    if (!listEl) return;

    if (countEl) countEl.textContent = state.historialCache.length;
    poblarListaOrdenesCompra();

    const filtroTextoEl = document.getElementById('historialFiltroTexto');
    const filtroDesdeEl = document.getElementById('historialFiltroDesde');
    const filtroHastaEl = document.getElementById('historialFiltroHasta');
    const filtroTexto = filtroTextoEl ? filtroTextoEl.value.trim().toLowerCase() : '';
    const filtroDesde = filtroDesdeEl && filtroDesdeEl.value ? new Date(filtroDesdeEl.value + 'T00:00:00') : null;
    const filtroHasta = filtroHastaEl && filtroHastaEl.value ? new Date(filtroHastaEl.value + 'T23:59:59') : null;

    const historial = state.historialCache.filter(entry => {
        if (filtroTexto) {
            const texto = `${entry.cliente || ''} ${entry.empresa || ''}`.toLowerCase();
            if (!texto.includes(filtroTexto)) return false;
        }
        const fechaEntry = new Date(entry.createdAt);
        if (filtroDesde && fechaEntry < filtroDesde) return false;
        if (filtroHasta && fechaEntry > filtroHasta) return false;
        return true;
    });

    if (state.historialCache.length === 0) {
        listEl.innerHTML = `<div class="historial-empty">No hay cotizaciones guardadas aún.<br><br>Arma una cotización y haz clic en <strong>"💾 Guardar"</strong>.</div>`;
        return;
    }
    if (historial.length === 0) {
        listEl.innerHTML = `<div class="historial-empty">No se encontraron cotizaciones con esos filtros.</div>`;
        return;
    }

    listEl.innerHTML = `<div class="historial-list">${historial.map(entry => {
        const fecha = new Date(entry.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const esOrden = entry.estado === 'orden_compra';
        const numeroMostrado = esOrden && entry.numeroOrdenCompra ? entry.numeroOrdenCompra : (entry.numeroCotizacion || '');
        const badgeEstado = esOrden
            ? `<span style="display:inline-block; padding:2px 9px; border-radius:12px; font-size:0.72em; font-weight:700; background:#e8f9ee; color:#38a169;">✅ Orden de compra</span>`
            : `<span style="display:inline-block; padding:2px 9px; border-radius:12px; font-size:0.72em; font-weight:700; background:var(--chip-neutral-bg); color:var(--text-muted);">📝 Cotización</span>`;
        const envioInfo = esOrden ? buscarEnvioPorOC(numeroMostrado) : null;
        const badgeEnvio = envioInfo ? badgeEnvioHtml(envioInfo) : '';
        return `
            <div class="historial-card">
                <div class="historial-card-left">
                    <div class="historial-card-title">${numeroMostrado ? `<span style="color:var(--secondary); font-weight:800;">${numeroMostrado}</span> · ` : ''}👤 ${entry.cliente}${entry.empresa ? ' — ' + entry.empresa : ''}</div>
                    <div class="historial-card-meta">
                        <span>📅 ${fecha}</span>
                        <span>📦 ${entry.numProductos || 0} producto${entry.numProductos !== 1 ? 's' : ''}</span>
                        ${(entry.creadoPorUsername && entry.creadoPorUsername !== state.sesionUsuario.username) ? `<span>👤 ${entry.creadoPorUsername}</span>` : ''}
                    </div>
                    <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${badgeEstado}${badgeEnvio}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <div class="historial-card-total">S/ ${(entry.total || 0).toFixed(2)}</div>
                    <div class="historial-card-actions">
                        <button class="btn-historial-load" style="background:var(--secondary);" onclick="verCotizacionDetalle('${entry.objectId}')">👁️ Ver</button>
                        <button class="btn-historial-load" onclick="cargarDesdeHistorial('${entry.objectId}')">📂 Cargar</button>
                        ${esOrden
                            ? `<button class="btn-historial-load" style="background:var(--chip-neutral-bg); color:var(--text-muted);" onclick="cambiarEstadoCotizacion('${entry.objectId}', 'cotizada')">↩ Desmarcar</button>`
                            : `<button class="btn-historial-load" style="background:#e8f9ee; color:#38a169;" onclick="cambiarEstadoCotizacion('${entry.objectId}', 'orden_compra')">✅ Marcar venta</button>`
                        }
                        <button class="btn-historial-del" aria-label="Eliminar cotización del historial" onclick="eliminarDeHistorial('${entry.objectId}')">🗑️</button>
                    </div>
                </div>
            </div>`;
    }).join('')}</div>`;
}

// Vista rápida de solo lectura — no toca state.productosEnTabla ni nada
// de la cotización que estés armando ahora mismo. Ideal para
// solo mirar rápido sin usar "Cargar" (que sí reemplaza tu
// trabajo actual).
export function verCotizacionDetalle(objectId) {
    const registro = state.historialCache.find(e => e.objectId === objectId);
    if (!registro) return;
    let entry;
    try { entry = JSON.parse(registro.datos); }
    catch (e) { mostrarNotificacion('❌ No se pudo leer esta cotización guardada.', 'warning'); return; }

    const esOrden = registro.estado === 'orden_compra';
    const numero = esOrden ? registro.numeroOrdenCompra : registro.numeroCotizacion;
    const envio = esOrden ? buscarEnvioPorOC(registro.numeroOrdenCompra) : null;

    document.getElementById('verCotTitulo').textContent = entry.cliente;

    const filasProductos = entry.productos.map(p => {
        const precio = p.precioOverride !== undefined ? p.precioOverride : obtenerPrecio(p, p.cantidad);
        const totalLinea = p.cantidad * precio;
        return `
            <tr>
                <td>${p.nombre}${p.color ? ' (' + p.color + ')' : ''}</td>
                <td style="text-align:center;">${p.cantidad}</td>
                <td style="text-align:right;">S/ ${precio.toFixed(2)}</td>
                <td style="text-align:right; font-weight:600;">S/ ${totalLinea.toFixed(2)}</td>
            </tr>`;
    }).join('');

    // Todos los datos del cliente que se guardaron con esta
    // cotización (no solo nombre/empresa/teléfono).
    const detallesCliente = [
        entry.ruc ? `📄 RUC: ${entry.ruc}` : null,
        entry.telefono ? `📞 ${entry.telefono}` : null,
        entry.email ? `✉️ ${entry.email}` : null,
        entry.direccion ? `📍 ${entry.direccion}` : null
    ].filter(Boolean);

    document.getElementById('verCotContenido').innerHTML = `
        ${numero ? `<div style="text-align:center; padding:10px; margin-bottom:14px; border-radius:10px; background:${esOrden ? 'var(--tint-ok-bg)' : 'var(--tint-info-bg)'};">
            <div style="font-size:0.75em; color:var(--text-muted); font-weight:600; letter-spacing:0.04em;">N° DE ${esOrden ? 'ORDEN DE COMPRA' : 'COTIZACIÓN'}</div>
            <div style="font-size:1.6em; font-weight:800; color:${esOrden ? '#38a169' : 'var(--secondary)'}; letter-spacing:0.02em; word-break:break-word;">${numero}</div>
        </div>` : ''}
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
            <span style="padding:3px 10px; border-radius:12px; font-size:0.78em; font-weight:700; background:${esOrden ? '#e8f9ee' : 'var(--chip-neutral-bg)'}; color:${esOrden ? '#38a169' : 'var(--text-muted)'};">${esOrden ? '✅ Orden de compra' : '📝 Cotización'}</span>
            ${entry.sucursal ? `<span style="padding:3px 10px; border-radius:12px; font-size:0.78em; background:#ebf8ff; color:#3182ce;">📍 ${entry.sucursal.nombre}</span>` : ''}
            ${envio ? badgeEnvioHtml(envio) : ''}
        </div>
        <div style="margin-bottom:14px; word-break:break-word;">
            ${entry.empresa ? `<div style="font-size:0.9em; color:var(--primary); font-weight:600;">${entry.empresa}</div>` : ''}
            ${detallesCliente.length ? `<div style="font-size:0.85em; color:var(--text-muted); margin-top:5px; line-height:1.7;">${detallesCliente.join('<br>')}</div>` : ''}
            <div style="font-size:0.8em; color:var(--text-faint); margin-top:5px;">${new Date(registro.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            ${entry.notas ? `<div style="font-size:0.8em; color:#92400e; background:#fef3c7; padding:6px 9px; border-radius:6px; margin-top:6px;">📝 ${entry.notas}</div>` : ''}
        </div>
        <div class="products-table-container" style="margin-top:0;">
            <table class="products-table" style="width:100%;">
                <thead><tr><th>Producto</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Total</th></tr></thead>
                <tbody>${filasProductos}</tbody>
            </table>
        </div>
        <div style="text-align:right; margin-top:14px; font-size:1.3em; font-weight:800; color:var(--primary);">
            Total: S/ ${(registro.total || 0).toFixed(2)}
        </div>
    `;

    document.getElementById('verCotizacionModal').classList.add('active');
}

export function cargarDesdeHistorial(objectId) {
    const registro = state.historialCache.find(e => e.objectId === objectId);
    if (!registro) return;
    let entry;
    try { entry = JSON.parse(registro.datos); }
    catch (e) { mostrarNotificacion('❌ No se pudo leer esta cotización guardada.', 'warning'); return; }

    mostrarConfirmacion(`¿Cargar cotización de "${entry.cliente}"? Se reemplazará la cotización actual.`, () => {
        state.productosEnTabla = JSON.parse(JSON.stringify(entry.productos));
        state.sucursalSeleccionada = entry.sucursal || null;
        state.cotizacionActualId = objectId; // seguir editando ESTE registro, mismo correlativo
        document.getElementById('clienteNombre').value = entry.cliente === 'Sin nombre' ? '' : entry.cliente;
        document.getElementById('clienteEmpresa').value = entry.empresa || '';
        document.getElementById('clienteRUC').value = entry.ruc || '';
        document.getElementById('clienteTelefono').value = entry.telefono || '';
        document.getElementById('clienteEmail').value = entry.email || '';
        document.getElementById('clienteDireccion').value = entry.direccion || '';
        document.getElementById('clienteNotas').value = entry.notas || '';
        actualizarResumenCliente();
        renderTable();
        guardarEstado();
        if (state.sucursalSeleccionada) mostrarSucursalSeleccionada();
        renderSucursales();
        switchTabById('cotizar');
        mostrarNotificacion('📂 Cotización cargada', 'success');
    }, { textoAceptar: 'Sí, cargar' });
}

export async function eliminarDeHistorial(objectId) {
    try {
        await parseFetch(COTIZACION_CLASE, 'DELETE', objectId);
        renderHistorial();
    } catch (err) {
        mostrarNotificacion('❌ Error al eliminar: ' + err.message, 'warning');
    }
}

// Al marcar una cotización como "orden_compra" se considera una
// venta real y confirmada — el Dashboard mide ganancia/ingresos
// solo sobre estas, no sobre cotizaciones que quedaron en propuesta.
export async function cambiarEstadoCotizacion(objectId, nuevoEstado) {
    try {
        const cambios = { estado: nuevoEstado };

        // Solo se asigna número de orden de compra la PRIMERA vez
        // que se confirma — si ya tenía uno, se conserva (no se
        // vuelve a numerar al desmarcar y volver a marcar).
        if (nuevoEstado === 'orden_compra') {
            const registro = state.historialCache.find(e => e.objectId === objectId);
            if (!registro || !registro.numeroOrdenCompra) {
                cambios.numeroOrdenCompra = await siguienteCorrelativo('orden_compra');
            }
        }

        await parseFetch(COTIZACION_CLASE, 'PUT', objectId, cambios);
        renderHistorial();
        mostrarNotificacion(
            nuevoEstado === 'orden_compra' ? '✅ Marcada como venta confirmada' : '↩ Vuelta a cotización',
            'success'
        );
    } catch (err) {
        mostrarNotificacion('❌ Error al actualizar: ' + err.message, 'warning');
    }
}

export function limpiarHistorial() {
    mostrarConfirmacion('¿Eliminar todo el historial de cotizaciones? Esta acción no se puede deshacer.', async () => {
        try {
            for (const entry of state.historialCache) {
                await parseFetch(COTIZACION_CLASE, 'DELETE', entry.objectId);
            }
            renderHistorial();
            mostrarNotificacion('Historial eliminado', 'info');
        } catch (err) {
            mostrarNotificacion('❌ Error al eliminar el historial: ' + err.message, 'warning');
        }
    });
}

export function initHistorial() {
    document.getElementById('historialFiltroTexto').addEventListener('input', pintarHistorialDesdeCache);
    document.getElementById('historialFiltroDesde').addEventListener('change', pintarHistorialDesdeCache);
    document.getElementById('historialFiltroHasta').addEventListener('change', pintarHistorialDesdeCache);
    document.getElementById('btnLimpiarFiltrosHistorial').addEventListener('click', limpiarFiltrosHistorial);
    document.getElementById('btnGuardarHistorial').addEventListener('click', () => guardarEnHistorial());
    document.getElementById('btnLimpiarHistorial').addEventListener('click', limpiarHistorial);
    document.getElementById('btnCerrarVerCotizacionModal').addEventListener('click', () => {
        document.getElementById('verCotizacionModal').classList.remove('active');
    });

    window.verCotizacionDetalle = verCotizacionDetalle;
    window.cargarDesdeHistorial = cargarDesdeHistorial;
    window.cambiarEstadoCotizacion = cambiarEstadoCotizacion;
    window.eliminarDeHistorial = eliminarDeHistorial;
}
