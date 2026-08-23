// Exportación de la cotización: imagen, Excel, WhatsApp, y el armado del
// bloque imprimible (#cotizacionPrint) que consumen imagen/PDF.
import { state } from '../core/state.js';
import { mostrarNotificacion, showLoading } from '../core/ui-helpers.js';
import { getClienteData } from './cliente.js';
import { obtenerPrecio, calcularPrecioConIGV, calcularIGV } from './precios.js';
import { guardarEnHistorial } from '../historial/historial.js';

// ============================================
// Descargar/compartir un archivo (Blob) de forma que funcione igual
// en PC y en celular. El truco de <a download> con data URL NO
// funciona en muchos navegadores móviles (sobre todo iPhone: Safari
// simplemente abre el archivo en vez de descargarlo, o no hace
// nada). La solución real es usar la Web Share API cuando está
// disponible — abre el panel nativo de "Compartir/Guardar" del
// celular — y si no está disponible, caer al método clásico.
// Sirve tanto para imágenes (PNG) como para PDFs.
// ============================================
export async function descargarOCompartirBlob(blob, nombreArchivo, tipoMime) {
    if (!blob) throw new Error('No se pudo generar el archivo');

    const archivo = new File([blob], nombreArchivo, { type: tipoMime });

    // Camino 1 (ideal en celular): panel nativo de compartir/guardar.
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
            await navigator.share({ files: [archivo], title: nombreArchivo });
            return 'compartido';
        } catch (err) {
            // Si el usuario cancela el panel de compartir, no es un
            // error real — seguimos al siguiente método solo si fue
            // otro tipo de fallo.
            if (err.name === 'AbortError') return 'cancelado';
        }
    }

    // Camino 2 (funciona en PC y en varios navegadores Android):
    // enlace de descarga clásico con URL de blob.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = nombreArchivo;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    return 'descargado';
}

export async function descargarOCompartirCanvas(canvas, nombreArchivo) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return descargarOCompartirBlob(blob, nombreArchivo, 'image/png');
}

export async function descargarOCompartirPDF(pdf, nombreArchivo) {
    const blob = pdf.output('blob');
    return descargarOCompartirBlob(blob, nombreArchivo, 'application/pdf');
}

// Copia una imagen (Blob PNG) al portapapeles del sistema, si el
// navegador lo permite (requiere contexto seguro/HTTPS). Devuelve
// true si se copió, false si no fue posible (no bloquea el flujo).
export async function copiarImagenAlPortapapeles(blob) {
    try {
        if (!blob || !navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
            return false;
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return true;
    } catch (err) {
        console.error('No se pudo copiar la imagen al portapapeles:', err);
        return false;
    }
}

// ============================================
// PREPARAR COTIZACIÓN PARA IMPRESIÓN
// ============================================

export async function prepararCotizacion() {
    const fecha = new Date();
    const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
    const fechaStr = fecha.toLocaleDateString('es-PE', opciones);

    // N° de documento: el correlativo REAL asignado al guardar
    // (COT-000123 / OC-000045), nunca un número inventado. Si por
    // algún motivo aún no hay uno asignado (p.ej. falló el guardado
    // en la nube), se muestra como pendiente en vez de un número al
    // azar que confundiría al cliente.
    const registroActual = state.cotizacionActualId ? state.historialCache.find(e => e.objectId === state.cotizacionActualId) : null;
    const numeroCorrelativo = registroActual
        ? (registroActual.estado === 'orden_compra' ? registroActual.numeroOrdenCompra : registroActual.numeroCotizacion)
        : null;
    const numDoc = numeroCorrelativo ? `N° ${numeroCorrelativo}` : 'N° pendiente';

    // TIPO DE DOCUMENTO
    const tipodoc = document.getElementById('tipoDocumento').value;
    const tituloDoc = tipodoc === 'ORDEN DE COMPRA' ? 'ORDEN DE COMPRA' : 'COTIZACIÓN';
    document.getElementById('printTipoDoc').textContent = tituloDoc;
    document.getElementById('printDate').textContent = `Fecha: ${fechaStr}`;
    document.getElementById('printNumeroCot').textContent = numDoc;
    // "Válido 7 días" solo en cotización
    const validezEl = document.getElementById('printValidezBadge');
    if (validezEl) validezEl.style.display = tipodoc === 'ORDEN DE COMPRA' ? 'none' : 'inline-block';

    // CLIENTE en bloque compacto
    const cliente = getClienteData();
    const clientePrintEl = document.getElementById('clientePrintBox');
    const bloqueCompacto = document.getElementById('infoBloqueCompacto');
    const gridInner = bloqueCompacto ? bloqueCompacto.querySelector('div') : null;
    let hayCliente = false, hayEnvio = false;

    if (cliente.nombre || cliente.empresa) {
        hayCliente = true;
        let html = `<div style="font-size:0.75em;font-weight:700;color:#5568d3;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px;">👤 Cliente</div>`;
        if (cliente.nombre) html += `<div style="font-weight:700;font-size:0.88em;color:var(--primary);">${cliente.nombre}</div>`;
        if (cliente.empresa) html += `<div style="font-size:0.8em;color:var(--text-muted);">${cliente.empresa}</div>`;
        const detalles = [
            cliente.ruc ? `📄 ${cliente.ruc}` : null,
            cliente.telefono ? `📞 ${cliente.telefono}` : null,
            cliente.email ? `✉️ ${cliente.email}` : null,
            cliente.direccion ? `📍 ${cliente.direccion}` : null
        ].filter(Boolean);
        if (detalles.length) html += `<div style="font-size:0.78em;color:var(--text-muted);margin-top:5px;line-height:1.7;">${detalles.join('<br>')}</div>`;
        if (cliente.notas) html += `<div style="font-size:0.75em;color:#92400e;background:#fef3c7;padding:4px 7px;border-radius:4px;margin-top:5px;">📝 ${cliente.notas}</div>`;
        clientePrintEl.innerHTML = html;
        clientePrintEl.style.display = 'block';
    } else {
        clientePrintEl.style.display = 'none';
    }

    // ENVÍO en bloque compacto
    const envioPrintEl = document.getElementById('envioInfoPrint');
    if (state.sucursalSeleccionada) {
        hayEnvio = true;
        envioPrintEl.innerHTML = `
            <div style="font-size:0.75em;font-weight:700;color:#234e52;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px;">📦 Envío Shalom</div>
            <div style="font-weight:700;font-size:0.88em;color:var(--primary);">${state.sucursalSeleccionada.nombre}</div>
            <div style="font-size:0.78em;color:var(--text-muted);line-height:1.7;margin-top:5px;">
                📍 ${state.sucursalSeleccionada.direccion}<br>
                🏙️ ${state.sucursalSeleccionada.ciudad}, ${state.sucursalSeleccionada.provincia}<br>
                🏢 Tipo: ${state.sucursalSeleccionada.tipo}
            </div>`;
        envioPrintEl.style.display = 'block';
    } else {
        envioPrintEl.style.display = 'none';
    }

    // Bloque compacto: solo si hay datos de cliente O envío
    if (bloqueCompacto) {
        if (hayCliente || hayEnvio) {
            bloqueCompacto.style.display = 'block';
            // Si solo hay uno de los dos, el existente ocupa ancho completo
            if (gridInner) {
                if (hayCliente && hayEnvio) {
                    gridInner.style.gridTemplateColumns = '1fr 1fr';
                } else {
                    gridInner.style.gridTemplateColumns = '1fr';
                }
            }
        } else {
            // Sin cliente ni envío: ocultar bloque compacto completamente
            bloqueCompacto.style.display = 'none';
        }
    }

    // TABLA DE PRODUCTOS
    const printTableBody = document.getElementById('printTableBody');
    let totalSinIGV = 0;

    printTableBody.innerHTML = state.productosEnTabla.map(producto => {
        const cantidad = producto.cantidad;
        const precioBase = obtenerPrecio(producto, cantidad);
        const precioUnitario = producto.precioOverride !== undefined ? producto.precioOverride : precioBase;
        const subtotal = cantidad * precioUnitario;
        totalSinIGV += subtotal;
        let tipoPrecio = producto.precioOverride !== undefined ? 'Personalizado' : (state.forzarPorMayor ? 'Mayor' : (cantidad >= 6 ? 'Mayor' : 'Menor'));

        const precioMostrar = state.mostrarConIGV ? calcularPrecioConIGV(precioUnitario) : precioUnitario;
        const subtotalMostrar = state.mostrarConIGV ? calcularPrecioConIGV(subtotal) : subtotal;
        const colorInfo = producto.color ? ` <span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:8px;font-size:0.75em;font-weight:600;margin-left:3px;">🎨 ${producto.color}</span>` : '';

        return `
            <tr>
                <td style="font-size:0.82em;color:var(--text-muted);font-family:monospace;">${producto.codigo}</td>
                <td style="font-size:0.88em;">${producto.nombre}${colorInfo}</td>
                <td style="text-align:center;font-size:0.88em;">${cantidad}</td>
                <td style="text-align:right;font-size:0.85em;">S/ ${precioMostrar.toFixed(2)}<br><span style="font-size:0.8em;color:var(--text-faint);">${tipoPrecio}</span></td>
                <td style="text-align:right;font-weight:700;font-size:0.9em;">S/ ${subtotalMostrar.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    // TOTALES
    const totalMostrar = state.mostrarConIGV ? calcularPrecioConIGV(totalSinIGV) : totalSinIGV;
    document.getElementById('printTotal').textContent = `S/ ${totalMostrar.toFixed(2)}`;

    // Detalle de totales
    let detalleHTML = '';
    if (state.mostrarConIGV) {
        const soloIGV = calcularIGV(totalSinIGV);
        detalleHTML += `<div style="display:flex;justify-content:space-between;"><span>Base imponible:</span><span>S/ ${totalSinIGV.toFixed(2)}</span></div>`;
        detalleHTML += `<div style="display:flex;justify-content:space-between;"><span>IGV (18%):</span><span>S/ ${soloIGV.toFixed(2)}</span></div>`;
    }
    document.getElementById('printTotalesDetalle').innerHTML = detalleHTML;

    let infoText = `${state.productosEnTabla.length} producto${state.productosEnTabla.length !== 1 ? 's' : ''}`;
    if (state.forzarPorMayor) infoText += ` · Precio por mayor`;
    document.getElementById('printTotalInfo').textContent = infoText;

    // ADELANTO / PAGO
    const adelanto = parseFloat(document.getElementById('montoAdelanto').value) || 0;
    const pagoPrint = document.getElementById('printPagoSection');
    if (adelanto > 0) {
        const saldo = Math.max(0, totalMostrar - adelanto);
        pagoPrint.style.display = 'block';
        document.getElementById('printAdelanto').textContent = `S/ ${adelanto.toFixed(2)}`;
        document.getElementById('printSaldo').textContent = `S/ ${saldo.toFixed(2)}`;
    } else {
        pagoPrint.style.display = 'none';
    }
}

// Dibuja la cotización y devuelve el PNG resultante como Blob, sin
// decidir todavía qué hacer con él (descargar o copiar) — eso lo
// decide cada botón por separado. Comparte el guardado del
// correlativo real y el renderizado de html2canvas entre ambos.
async function generarImagenCotizacionBlob() {
    // Se guarda/asigna el correlativo ANTES de dibujar la
    // cotización, para que el N° que aparece en la imagen sea el
    // correlativo real (COT-/OC-), no un número inventado.
    await guardarEnHistorial({ silencioso: true });

    await prepararCotizacion();
    await new Promise(resolve => setTimeout(resolve, 800));

    const element = document.getElementById('cotizacionPrint');

    const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: 900,
        height: element.scrollHeight
    });

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// Botón "🖼️ Imagen": genera y DESCARGA (o abre el panel de
// compartir/guardar en celular). No toca el portapapeles.
export async function generarImagen() {
    if (state.productosEnTabla.length === 0) {
        mostrarNotificacion('Agrega productos primero', 'warning');
        return;
    }

    showLoading(true);

    try {
        const blob = await generarImagenCotizacionBlob();
        const nombreArchivo = `Cotizacion_LineaHotelera_${Date.now()}.png`;
        await descargarOCompartirBlob(blob, nombreArchivo, 'image/png');

        showLoading(false);
        mostrarNotificacion('✅ Imagen generada y descargada', 'success');
    } catch (error) {
        console.error('Error al generar imagen:', error);
        showLoading(false);
        mostrarNotificacion('❌ Error al generar imagen', 'error');
    }
}

// Botón "📋 Copiar imagen": genera y COPIA al portapapeles. No
// descarga ni abre ningún panel de compartir.
export async function generarImagenYCopiar() {
    if (state.productosEnTabla.length === 0) {
        mostrarNotificacion('Agrega productos primero', 'warning');
        return;
    }

    showLoading(true);

    try {
        const blob = await generarImagenCotizacionBlob();
        const copiada = await copiarImagenAlPortapapeles(blob);

        showLoading(false);
        mostrarNotificacion(
            copiada ? '✅ Imagen copiada al portapapeles' : '⚠️ Tu navegador no permite copiar automáticamente — usa el botón "Imagen" para descargarla',
            copiada ? 'success' : 'warning'
        );
    } catch (error) {
        console.error('Error al generar imagen:', error);
        showLoading(false);
        mostrarNotificacion('❌ Error al generar imagen', 'error');
    }
}

// ============================================
// EXPORTACIÓN A EXCEL
// ============================================

export function exportarExcel() {
    if (state.productosEnTabla.length === 0) {
        mostrarNotificacion('Agrega productos primero', 'warning');
        return;
    }

    const cliente = getClienteData();

    const filas = state.productosEnTabla.map(p => {
        const precioBase = obtenerPrecio(p, p.cantidad);
        const precioUnitario = p.precioOverride !== undefined ? p.precioOverride : precioBase;
        const totalLinea = p.cantidad * precioUnitario;
        const tipoPrecio = p.precioOverride !== undefined ? 'Personalizado' : (state.forzarPorMayor ? 'Por Mayor (Forzado)' : (p.cantidad >= 6 ? 'Por Mayor' : 'Por Menor'));
        return {
            'Código': p.codigo,
            'Producto': p.nombre,
            'Color/Variante': p.color || '',
            'Cantidad': p.cantidad,
            'Tipo Precio': tipoPrecio,
            'Precio Unit. (S/)': Number(precioUnitario.toFixed(2)),
            'Total Línea (S/)': Number((state.mostrarConIGV ? calcularPrecioConIGV(totalLinea) : totalLinea).toFixed(2))
        };
    });

    let subtotal = filas.reduce((a, f) => a + f['Total Línea (S/)'], 0);

    filas.push({});
    filas.push({ 'Código': '', 'Producto': `TOTAL ${state.mostrarConIGV ? '(IGV incl.)' : '(sin IGV)'}`, 'Total Línea (S/)': Number(subtotal.toFixed(2)) });

    const wb = XLSX.utils.book_new();
    const wsData = XLSX.utils.json_to_sheet(filas);
    wsData['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsData, 'Cotización');

    const wsCliente = XLSX.utils.json_to_sheet([{
        'Cliente': cliente.nombre || '',
        'Empresa': cliente.empresa || '',
        'RUC': cliente.ruc || '',
        'Teléfono': cliente.telefono || '',
        'Email': cliente.email || '',
        'Sucursal envío': state.sucursalSeleccionada ? state.sucursalSeleccionada.nombre : '',
        'Fecha': new Date().toLocaleDateString('es-PE')
    }]);
    XLSX.utils.book_append_sheet(wb, wsCliente, 'Datos Cliente');

    XLSX.writeFile(wb, `Cotizacion_LineaHotelera_${Date.now()}.xlsx`);
    mostrarNotificacion('✅ Excel generado exitosamente', 'success');
}

// ============================================
// WHATSAPP
// ============================================

export function enviarWhatsApp() {
    if (state.productosEnTabla.length === 0) { mostrarNotificacion('Agrega productos primero', 'warning'); return; }

    const cliente = getClienteData();
    const fecha = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

    let msg = `🏨 *LÍNEA HOTELERA*\n`;
    msg += `📋 *COTIZACIÓN — ${fecha}*\n`;
    if (cliente.nombre) msg += `👤 Cliente: *${cliente.nombre}*\n`;
    if (cliente.empresa) msg += `🏢 ${cliente.empresa}\n`;
    msg += `\n`;

    let subtotal = 0;
    state.productosEnTabla.forEach((p, i) => {
        const precioBase = obtenerPrecio(p, p.cantidad);
        const precioFinal = p.precioOverride !== undefined ? p.precioOverride : precioBase;
        const total = p.cantidad * precioFinal;
        subtotal += total;
        const colorStr = p.color ? ` (${p.color})` : '';
        msg += `• ${p.nombre}${colorStr}\n`;
        msg += `  ${p.cantidad} unid. × S/ ${precioFinal.toFixed(2)} = *S/ ${total.toFixed(2)}*\n`;
    });

    msg += `\n`;

    const totalFinal = state.mostrarConIGV ? calcularPrecioConIGV(subtotal) : subtotal;
    const igvLabel = state.mostrarConIGV ? ' (incl. IGV 18%)' : '';
    msg += `✅ *TOTAL: S/ ${totalFinal.toFixed(2)}*${igvLabel}\n`;

    if (state.sucursalSeleccionada) {
        msg += `\n📦 Envío: ${state.sucursalSeleccionada.nombre} - ${state.sucursalSeleccionada.ciudad}\n`;
    }

    msg += `\n_Válido por 7 días · Línea Hotelera_`;

    const tel = cliente.telefono ? cliente.telefono.replace(/\D/g, '') : '';
    const url = `https://wa.me/${tel ? '51' + tel : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

export function initExport() {
    document.getElementById('btnGenerateImage').addEventListener('click', generarImagen);
    document.getElementById('btnCopyImage').addEventListener('click', generarImagenYCopiar);
    document.getElementById('btnGenerateExcel').addEventListener('click', exportarExcel);
    // enviarWhatsApp() no tiene ningún botón que lo dispare en el HTML
    // actual (ya estaba así antes de esta migración — código huérfano,
    // igual que .btn-whatsapp en el CSS). Se deja exportada por si se
    // vuelve a enganchar más adelante, pero no se registra ningún listener.
}
