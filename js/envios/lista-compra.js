// LISTA DE COMPRA — para revendedores que necesitan, cada cierto
// tiempo, saber qué productos/colores/cantidades comprarle a su
// proveedor antes de armar el próximo envío a provincias.
//
// Agrupa producto + color + cantidad de TODAS las órdenes de
// compra (OC) que todavía no se despachan: las que no tienen
// ninguna guía Shalom registrada, o que sí tienen guía pero
// todavía está en "pendiente" (no salió de camino) o en "error".
// Una vez que una guía pasa a "en_transito" o "entregado", esa
// orden ya se compró y se dejó de contar aquí.
//
// Es 100% de solo lectura: solo LEE state.historialCache y
// state.shalomEnviosCache (ya cargados por otras partes de la app) y
// no modifica ningún dato ni toca la lógica de precios,
// cotizaciones o envíos existente.
import { state } from '../core/state.js';
import { mostrarNotificacion } from '../core/ui-helpers.js';
import { buscarEnvioPorOC } from './shalom.js';

function ordenPendienteDeDespacho(entry) {
    const envio = buscarEnvioPorOC(entry.numeroOrdenCompra);
    if (!envio) return { pendiente: true, envio: null };
    const yaDespachado = envio.estado === 'en_transito' || envio.estado === 'entregado';
    return { pendiente: !yaDespachado, envio };
}

export function calcularListaCompraPendiente() {
    const ordenes = state.historialCache.filter(e => e.estado === 'orden_compra');
    const itemsPorClave = {}; // clave = código|color (o nombre|color si no hay código)
    const ordenesIncluidas = [];

    ordenes.forEach(registro => {
        const { pendiente, envio } = ordenPendienteDeDespacho(registro);
        if (!pendiente) return;

        let datos;
        try { datos = JSON.parse(registro.datos); }
        catch (e) { return; } // registro sin datos legibles — se omite, no rompe el cálculo

        if (!datos || !Array.isArray(datos.productos) || datos.productos.length === 0) return;

        ordenesIncluidas.push({ registro, envio });

        datos.productos.forEach(p => {
            const clave = `${p.codigo || p.nombre}|${p.color || ''}`;
            if (!itemsPorClave[clave]) {
                itemsPorClave[clave] = {
                    nombre: p.nombre,
                    color: p.color || '',
                    codigo: p.codigo || '',
                    cantidad: 0,
                    ordenes: [] // { numeroOC, cliente, cantidad }
                };
            }
            itemsPorClave[clave].cantidad += Number(p.cantidad) || 0;
            itemsPorClave[clave].ordenes.push({
                numeroOC: registro.numeroOrdenCompra || '(sin número)',
                cliente: registro.cliente,
                cantidad: Number(p.cantidad) || 0
            });
        });
    });

    const items = Object.values(itemsPorClave).sort((a, b) => b.cantidad - a.cantidad);
    return { items, ordenesIncluidas };
}

// Resumen corto, siempre visible en la pestaña Envíos, sin
// necesidad de abrir el modal.
export function pintarResumenListaCompra() {
    const wrap = document.getElementById('listaCompraResumenTexto');
    if (!wrap) return;
    const { items, ordenesIncluidas } = calcularListaCompraPendiente();
    if (ordenesIncluidas.length === 0) {
        wrap.textContent = 'No hay órdenes pendientes de despacho por ahora. 🎉';
    } else {
        const totalUnidades = items.reduce((a, it) => a + it.cantidad, 0);
        wrap.textContent = `${items.length} producto${items.length !== 1 ? 's' : ''} distinto${items.length !== 1 ? 's' : ''} · ${totalUnidades} unidad${totalUnidades !== 1 ? 'es' : ''} · de ${ordenesIncluidas.length} orden${ordenesIncluidas.length !== 1 ? 'es' : ''} sin despachar`;
    }
}

export function abrirListaCompra() {
    const { items, ordenesIncluidas } = calcularListaCompraPendiente();
    const contenido = document.getElementById('listaCompraContenido');

    if (ordenesIncluidas.length === 0) {
        contenido.innerHTML = `<div class="historial-empty">🎉 No tienes órdenes de compra pendientes de despacho — nada por comprar por ahora.</div>`;
        document.getElementById('listaCompraModal').classList.add('active');
        return;
    }

    const totalUnidades = items.reduce((a, it) => a + it.cantidad, 0);

    const filasHtml = items.map(it => {
        const ocsTexto = it.ordenes.map(o => `${o.numeroOC} (${o.cantidad})`).join(', ');
        return `
            <tr>
                <td>${it.nombre}${it.codigo ? ` <span style="color:var(--text-faint); font-size:0.85em;">· ${it.codigo}</span>` : ''}</td>
                <td>${it.color || '—'}</td>
                <td style="text-align:center; font-weight:800; color:var(--primary);">${it.cantidad}</td>
                <td style="font-size:0.78em; color:var(--text-muted);">${ocsTexto}</td>
            </tr>`;
    }).join('');

    contenido.innerHTML = `
        <p style="font-size:0.85em; color:var(--text-muted); margin-bottom:14px;">
            Suma de productos, colores y cantidades de las <strong>${ordenesIncluidas.length}</strong> orden${ordenesIncluidas.length !== 1 ? 'es' : ''} de compra que aún no se despachan (sin guía registrada, o con guía que todavía no sale de camino). Es una vista de solo lectura — no cambia nada de tus órdenes, precios ni catálogo.
        </p>
        <div class="products-table-container">
            <table class="products-table" style="width:100%;">
                <thead><tr><th>Producto</th><th>Color</th><th style="text-align:center;">Cant. a comprar</th><th>Órdenes que lo incluyen</th></tr></thead>
                <tbody>${filasHtml}</tbody>
            </table>
        </div>
        <div style="text-align:right; margin-top:14px; font-size:1.05em; font-weight:700; color:var(--primary);">
            Total: ${items.length} producto${items.length !== 1 ? 's' : ''} · ${totalUnidades} unidad${totalUnidades !== 1 ? 'es' : ''}
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:16px;">
            <button type="button" class="btn btn-success" onclick="exportarListaCompraExcel()">📊 Exportar a Excel</button>
            <button type="button" class="btn btn-primary" onclick="copiarListaCompraTexto()">📋 Copiar como texto</button>
        </div>
    `;

    document.getElementById('listaCompraModal').classList.add('active');
}

export function exportarListaCompraExcel() {
    const { items, ordenesIncluidas } = calcularListaCompraPendiente();
    if (items.length === 0) {
        mostrarNotificacion('No hay productos pendientes de compra', 'info');
        return;
    }
    const filas = items.map(it => ({
        'Producto': it.nombre,
        'Código': it.codigo,
        'Color': it.color,
        'Cantidad a comprar': it.cantidad,
        'Órdenes que lo incluyen': it.ordenes.map(o => `${o.numeroOC} (${o.cantidad})`).join(', ')
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de compra');
    XLSX.writeFile(wb, `Lista_de_compra_${new Date().toISOString().slice(0, 10)}.xlsx`);
    mostrarNotificacion('✅ Excel de lista de compra generado', 'success');
}

export function copiarListaCompraTexto() {
    const { items, ordenesIncluidas } = calcularListaCompraPendiente();
    if (items.length === 0) {
        mostrarNotificacion('No hay productos pendientes de compra', 'info');
        return;
    }
    const totalUnidades = items.reduce((a, it) => a + it.cantidad, 0);
    let texto = `🛒 LISTA DE COMPRA — ${new Date().toLocaleDateString('es-PE')}\n`;
    texto += `(${ordenesIncluidas.length} órdenes sin despachar, ${totalUnidades} unidades en total)\n\n`;
    items.forEach(it => {
        texto += `• ${it.nombre}${it.color ? ' (' + it.color + ')' : ''}: ${it.cantidad}\n`;
    });

    const finalizar = () => mostrarNotificacion('📋 Lista de compra copiada al portapapeles', 'success');
    const fallar = () => mostrarNotificacion('❌ No se pudo copiar automáticamente. Usa "📊 Exportar a Excel" en su lugar.', 'warning');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(finalizar).catch(fallar);
    } else {
        fallar();
    }
}

export function initListaCompra() {
    document.getElementById('btnAbrirListaCompra').addEventListener('click', abrirListaCompra);
    document.getElementById('btnCerrarListaCompraModal').addEventListener('click', () => {
        document.getElementById('listaCompraModal').classList.remove('active');
    });

    window.exportarListaCompraExcel = exportarListaCompraExcel;
    window.copiarListaCompraTexto = copiarListaCompraTexto;
}
