// Tabla de la cotización en curso: autocompletar/agregar producto,
// cantidad, quitar, totales, forma de pago, limpiar, plantillas y
// persistencia local de la cotización en curso.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion, mostrarPrompt, debounce } from '../core/ui-helpers.js';
import { obtenerTiersProducto, obtenerPrecio, obtenerEtiquetaNivel, calcularPrecioConIGV, calcularIGV } from './precios.js';
import { actualizarResumenCliente } from './cliente.js';
import { renderSucursales, mostrarSucursalSeleccionada, updateSucursalStats, renderSucursalList } from '../catalogo/sucursales-crud.js';
import { renderProductList } from '../catalogo/productos-crud.js';
import { renderHistorial } from '../historial/historial.js';
import { renderEnvios } from '../envios/lima.js';
import { cargarEnviosShalom } from '../envios/shalom.js';
import { cargarDashboard } from '../dashboard/dashboard.js';
import { detenerCamaraQR } from '../envios/shalom.js';

// ============================================
// PERSISTENCIA (localStorage) de la cotización en curso
// ============================================

export function guardarEstado() {
    const estado = {
        productos: state.productosEnTabla,
        sucursal: state.sucursalSeleccionada,
        sucursalesDB: state.sucursalesDB,
        fecha: new Date().toISOString()
    };
    try {
        localStorage.setItem('cotizacion_linea_hotelera', JSON.stringify(estado));
    } catch (e) {
        console.error('Error al guardar estado:', e);
    }
}

export function cargarEstado() {
    try {
        const stored = localStorage.getItem('cotizacion_linea_hotelera');
        if (stored) {
            const estado = JSON.parse(stored);
            const fecha = new Date(estado.fecha);
            const ahora = new Date();
            const diferencia = (ahora - fecha) / (1000 * 60 * 60);

            if (diferencia < 24) {
                state.productosEnTabla = estado.productos || [];
                state.sucursalSeleccionada = estado.sucursal || null;
                if (estado.sucursalesDB) {
                    state.sucursalesDB = estado.sucursalesDB;
                }
                renderTable();
                renderProductList();
                renderSucursalList();
                if (state.sucursalSeleccionada) {
                    mostrarSucursalSeleccionada();
                }
                if (state.productosEnTabla.length > 0 || state.sucursalSeleccionada) {
                    mostrarNotificacion('Se recuperó tu cotización anterior', 'success');
                }
            }
        }
    } catch (e) {
        console.error('Error al cargar estado:', e);
    }
}

// ============================================
// SISTEMA DE TABS
// ============================================

export function switchTab(tab, e) {
    state.tabActual = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    e.target.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'sucursales') {
        renderSucursales();
        updateSucursalStats();
    } else if (tab === 'productos') {
        renderProductList();
    } else if (tab === 'gestionsucursales') {
        renderSucursalList();
    } else if (tab === 'historial') {
        renderHistorial();
    } else if (tab === 'envios') {
        renderEnvios();
    } else if (tab === 'shalom') {
        cargarEnviosShalom();
    } else if (tab === 'dashboard') {
        cargarDashboard();
    } else if (tab === 'cotizar') {
        renderAccesosRapidos();
    }

    if (tab !== 'shalom' && typeof detenerCamaraQR === 'function') {
        detenerCamaraQR();
    }
}

// Variante que activa una pestaña por id sin depender de un evento de
// click (se usa desde otros flujos: cargar plantilla, cargar desde
// historial, atajo "Registrar guía" desde Envíos). El original ubicaba
// el botón de la pestaña buscando `'${tab}'` dentro de su atributo
// onclick — como esos onclick ya no existen (se convirtieron a
// addEventListener + data-tab), ahora empareja por `data-tab`.
export function switchTabById(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        if (t.dataset.tab === tab) {
            t.classList.add('active');
        }
    });
    const tabEl = document.getElementById(`tab-${tab}`);
    if (tabEl) tabEl.classList.add('active');
}

// ============================================
// AUTOCOMPLETADO DE PRODUCTOS
// ============================================

function initAutocompleteYAgregar() {
    const searchInput = document.getElementById('searchInput');
    const autocompleteDropdown = document.getElementById('autocompleteDropdown');
    const btnAdd = document.getElementById('btnAdd');

    searchInput.addEventListener('input', debounce(function () {
        const query = this.value.trim().toLowerCase();

        if (query.length < 2) {
            autocompleteDropdown.style.display = 'none';
            state.productoSeleccionado = null;
            btnAdd.disabled = true;
            document.getElementById('addExtrasRow').classList.remove('visible');
            return;
        }

        const resultados = state.productosDB.filter(producto =>
            producto.nombre.toLowerCase().includes(query) ||
            producto.codigo.toLowerCase().includes(query)
        );

        if (resultados.length > 0) {
            autocompleteDropdown.innerHTML = resultados.map(producto => {
                const tiers = obtenerTiersProducto(producto);
                const tiersHtml = tiers.map(t => {
                    const precioMostrado = state.mostrarConIGV ? calcularPrecioConIGV(t.precio) : t.precio;
                    return `<span class="price-tag price-menor">${t.etiqueta}: S/ ${precioMostrado.toFixed(2)}</span>`;
                }).join('');
                return `
                <div class="autocomplete-item" data-codigo="${producto.codigo}">
                    <div class="product-name">${producto.nombre}</div>
                    <div class="product-prices">
                        ${tiersHtml}
                        <span style="margin-left: 10px; color:var(--text-faint);">${producto.codigo}</span>
                    </div>
                </div>`;
            }).join('');
            autocompleteDropdown.style.display = 'block';

            document.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', function () {
                    const codigo = this.dataset.codigo;
                    state.productoSeleccionado = state.productosDB.find(p => p.codigo === codigo);
                    searchInput.value = state.productoSeleccionado.nombre;
                    autocompleteDropdown.style.display = 'none';
                    btnAdd.disabled = false;
                    // Mostrar fila de extras
                    document.getElementById('addExtrasRow').classList.add('visible');
                    document.getElementById('inputColor').focus();
                });
            });
        } else {
            autocompleteDropdown.innerHTML = '<div style="padding: 15px; text-align: center; color:var(--text-muted);">No se encontraron productos</div>';
            autocompleteDropdown.style.display = 'block';
        }
    }, 200));

    document.addEventListener('click', function (e) {
        if (!searchInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
            autocompleteDropdown.style.display = 'none';
        }
    });

    // ============================================
    // AGREGAR PRODUCTO A COTIZACIÓN
    // ============================================

    btnAdd.addEventListener('click', function () {
        if (!state.productoSeleccionado) return;

        const colorIngresado = document.getElementById('inputColor').value.trim();
        const cantidadInicial = parseInt(document.getElementById('inputCantidadInicial').value) || 1;

        const agregado = agregarProductoATabla(state.productoSeleccionado, { cantidad: cantidadInicial, color: colorIngresado });
        if (!agregado) return;

        searchInput.value = '';
        document.getElementById('inputColor').value = '';
        document.getElementById('inputCantidadInicial').value = '1';
        document.getElementById('addExtrasRow').classList.remove('visible');
        state.productoSeleccionado = null;
        btnAdd.disabled = true;
    });
}

// Agrega un producto a la cotización en curso. Lo usan tanto el botón
// "Agregar a la Cotización" como los accesos rápidos (Fase 4c). Mantiene
// la regla original: se permite el mismo producto si cambia el color.
// Devuelve true si se agregó, false si ya estaba (mismo código+color).
export function agregarProductoATabla(producto, { cantidad = 1, color = '' } = {}) {
    if (!producto) return false;
    const colorNorm = (color || '').trim();
    const existe = state.productosEnTabla.find(p =>
        p.codigo === producto.codigo && (p.color || '') === colorNorm
    );
    if (existe) {
        mostrarNotificacion('Este producto con el mismo color ya está en la cotización', 'warning');
        return false;
    }
    state.productosEnTabla.push({
        ...producto,
        cantidad: Math.max(1, parseInt(cantidad) || 1),
        color: colorNorm
    });
    renderTable();
    guardarEstado();
    return true;
}

// ============================================
// ACCESOS RÁPIDOS A PRODUCTOS (Fase 4c)
// ============================================

// Top-N productos por unidades vendidas en el historial. No existe un
// concepto de "favorito" en el catálogo, así que el criterio es la
// frecuencia histórica (suma de cantidades por código). Si no hay
// historial utilizable todavía, cae a los primeros N del catálogo.
function computarProductosFrecuentes(limite = 6) {
    const unidadesPorCodigo = {};
    for (const entry of state.historialCache) {
        if (!entry || !entry.datos) continue;
        let datos;
        try { datos = JSON.parse(entry.datos); } catch (e) { continue; }
        if (!datos || !Array.isArray(datos.productos)) continue;
        for (const p of datos.productos) {
            if (!p || !p.codigo) continue;
            unidadesPorCodigo[p.codigo] = (unidadesPorCodigo[p.codigo] || 0) + (Number(p.cantidad) || 0);
        }
    }
    const catalogoPorCodigo = new Map(state.productosDB.map(p => [p.codigo, p]));
    const ordenados = Object.entries(unidadesPorCodigo)
        .filter(([codigo]) => catalogoPorCodigo.has(codigo))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limite)
        .map(([codigo]) => catalogoPorCodigo.get(codigo));
    if (ordenados.length > 0) return ordenados;
    return state.productosDB.slice(0, limite);
}

export function renderAccesosRapidos() {
    const section = document.getElementById('accesosRapidosSection');
    const grid = document.getElementById('accesosRapidosGrid');
    if (!section || !grid) return;

    const productos = computarProductosFrecuentes(6);
    if (productos.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    grid.innerHTML = productos.map(p => {
        let precio = 0;
        try { precio = obtenerPrecio(p, 1); } catch (e) { precio = 0; }
        return `<button type="button" class="acceso-rapido-item" data-codigo="${encodeURIComponent(p.codigo)}">
            <span class="ar-nombre">${p.nombre}</span>
            <span class="ar-precio">S/ ${Number(precio).toFixed(2)}</span>
        </button>`;
    }).join('');
}

// ============================================
// RENDERIZAR TABLA COTIZACIÓN
// ============================================

export function actualizarIndicadorCorrelativo() {
    const el = document.getElementById('correlativoEnCursoInfo');
    if (!el) return;
    if (!state.cotizacionActualId) {
        el.textContent = '🆕 Cotización nueva (aún sin guardar)';
        el.style.color = 'rgba(255,255,255,0.75)';
        return;
    }
    const registro = state.historialCache.find(e => e.objectId === state.cotizacionActualId);
    const numero = registro ? (registro.estado === 'orden_compra' ? registro.numeroOrdenCompra : registro.numeroCotizacion) : null;
    el.textContent = numero ? `✏️ Editando ${numero}` : '✏️ Editando cotización guardada';
    el.style.color = 'white';
}

export function renderTable() {
    actualizarIndicadorCorrelativo();
    const tableBody = document.getElementById('tableBody');

    if (state.productosEnTabla.length === 0) {
        tableBody.innerHTML = '<tr class="empty-state"><td colspan="6">📋 No hay productos agregados</td></tr>';
        document.getElementById('btnGenerateImage').disabled = true;
        document.getElementById('btnCopyImage').disabled = true;
        document.getElementById('btnGuardarHistorial').disabled = true;
        document.getElementById('btnGenerateExcel').disabled = true;
        document.getElementById('btnGuardarPlantilla').disabled = true;
    } else {
        tableBody.innerHTML = state.productosEnTabla.map((producto, index) => {
            const cantidad = producto.cantidad;
            const precioBase = obtenerPrecio(producto, cantidad);
            const precioUnitario = producto.precioOverride !== undefined ? producto.precioOverride : precioBase;
            const total = cantidad * precioUnitario;
            const hasOverride = producto.precioOverride !== undefined;
            let tipoPrecio = hasOverride ? 'Personalizado' : obtenerEtiquetaNivel(producto, cantidad);

            const colorTag = producto.color ? `<div><span class="color-tag">🎨 ${producto.color}</span></div>` : '';

            const precioDisplay = state.mostrarConIGV ? `
                <div>
                    <span class="precio-con-igv">S/ ${calcularPrecioConIGV(precioUnitario).toFixed(2)}</span>
                    ${hasOverride ? '<span class="precio-override-badge">✏️</span>' : ''}
                </div>
            ` : `<div>
                    S/ ${precioUnitario.toFixed(2)}
                    ${hasOverride ? '<span class="precio-override-badge">✏️</span>' : ''}
                </div>`;

            const totalDisplay = state.mostrarConIGV ?
                `S/ ${calcularPrecioConIGV(total).toFixed(2)}` :
                `S/ ${total.toFixed(2)}`;

            return `
                <tr>
                    <td class="codigo-cell">${producto.codigo}</td>
                    <td class="producto-cell">
                        ${producto.nombre}
                        ${colorTag}
                    </td>
                    <td>
                        <input type="number" class="cantidad-input" value="${cantidad}" min="1"
                            onchange="updateCantidad(${index}, this.value)">
                    </td>
                    <td class="precio-cell">
                        <div style="display:flex;align-items:center;gap:4px;">
                            ${precioDisplay}
                            <button class="precio-edit-btn" title="Editar precio" aria-label="Editar precio" onclick="togglePrecioEdit(${index})">✏️</button>
                        </div>
                        <span class="precio-aplicado">${tipoPrecio}</span>
                        <div class="precio-inline-edit" id="precioEdit_${index}">
                            <span style="font-size:0.85em;color:var(--text-muted);">S/</span>
                            <input class="precio-inline-input" type="number" step="0.01" min="0"
                                id="precioInput_${index}" value="${precioUnitario.toFixed(2)}">
                            <button class="precio-inline-save" aria-label="Guardar precio" onclick="guardarPrecioOverride(${index})">✔</button>
                            <button class="precio-inline-cancel" aria-label="Cancelar edición de precio" onclick="cancelarPrecioEdit(${index})">✕</button>
                            ${hasOverride ? `<button class="precio-inline-cancel" title="Restaurar" aria-label="Restaurar precio original" onclick="restaurarPrecio(${index})" style="color:#e53e3e;">↩</button>` : ''}
                        </div>
                    </td>
                    <td class="total-cell">${totalDisplay}</td>
                    <td>
                        <button class="btn-remove" aria-label="Eliminar producto de la cotización" onclick="removeProduct(${index})">✕</button>
                    </td>
                </tr>
            `;
        }).join('');
        document.getElementById('btnGenerateImage').disabled = false;
        document.getElementById('btnCopyImage').disabled = false;
        document.getElementById('btnGuardarHistorial').disabled = false;
        document.getElementById('btnGenerateExcel').disabled = false;
        document.getElementById('btnGuardarPlantilla').disabled = false;
    }

    updateTotal();
}

export function updateCantidad(index, nuevaCantidad) {
    let cantidad = parseInt(nuevaCantidad);
    if (isNaN(cantidad) || cantidad < 1) {
        mostrarNotificacion('⚠️ La cantidad debe ser un número mayor a 0', 'warning');
        cantidad = 1;
    } else if (cantidad > 100000) {
        mostrarNotificacion('⚠️ Cantidad máxima permitida: 100,000', 'warning');
        cantidad = 100000;
    }
    state.productosEnTabla[index].cantidad = cantidad;
    renderTable();
    guardarEstado();
}

export function removeProduct(index) {
    mostrarConfirmacion('¿Eliminar este producto de la cotización?', () => {
        state.productosEnTabla.splice(index, 1);
        renderTable();
        guardarEstado();
    });
}

export function updateTotal() {
    let totalBruto = 0;
    let totalUnidades = 0;
    let itemsMayor = 0;
    let itemsMenor = 0;
    let costoTotal = 0;
    let productosConCosto = 0;

    state.productosEnTabla.forEach(producto => {
        const cantidad = producto.cantidad;
        const precioBase = obtenerPrecio(producto, cantidad);
        const precioUnitario = producto.precioOverride !== undefined ? producto.precioOverride : precioBase;
        totalBruto += cantidad * precioUnitario;
        totalUnidades += cantidad;
        if (state.forzarPorMayor || cantidad >= 6) itemsMayor++;
        else itemsMenor++;
        if (producto.costo !== undefined && producto.costo !== null) {
            costoTotal += cantidad * producto.costo;
            productosConCosto++;
        }
    });

    const totalFinal = totalBruto;

    const totalElement = document.getElementById('totalAmount');
    if (state.mostrarConIGV) {
        const totalConIGV = calcularPrecioConIGV(totalFinal);
        const soloIGV = calcularIGV(totalFinal);
        totalElement.innerHTML = `
            <div style="text-align: right;">
                <div style="font-size: 0.6em; color: rgba(255,255,255,0.7);">Sin IGV: S/ ${totalFinal.toFixed(2)}</div>
                <div>S/ ${totalConIGV.toFixed(2)} <span class="igv-indicator">+IGV</span></div>
                <div style="font-size: 0.5em; color: rgba(255,255,255,0.7); margin-top: 5px;">IGV (18%): S/ ${soloIGV.toFixed(2)}</div>
            </div>
        `;
    } else {
        totalElement.textContent = `S/ ${totalFinal.toFixed(2)}`;
    }

    document.getElementById('totalInfo').textContent =
        `${state.productosEnTabla.length} producto${state.productosEnTabla.length !== 1 ? 's' : ''} (${totalUnidades} unidades)`;

    let breakdown = '';
    if (state.forzarPorMayor) {
        breakdown = `${state.productosEnTabla.length} forzados a por mayor`;
    } else {
        if (itemsMayor > 0) breakdown += `${itemsMayor} al por mayor`;
        if (itemsMayor > 0 && itemsMenor > 0) breakdown += ' • ';
        if (itemsMenor > 0) breakdown += `${itemsMenor} al por menor`;
    }
    document.getElementById('itemsBreakdown').textContent = breakdown;

    // Margen de ganancia (solo si al menos un producto tiene costo definido)
    const margenEl = document.getElementById('margenInfo');
    if (productosConCosto > 0) {
        const gananciaEstimada = totalFinal - costoTotal;
        const margenPct = totalFinal > 0 ? (gananciaEstimada / totalFinal) * 100 : 0;
        const cobertura = productosConCosto === state.productosEnTabla.length ? '' : ` (${productosConCosto}/${state.productosEnTabla.length} con costo)`;
        margenEl.innerHTML = `📈 Margen estimado: S/ ${gananciaEstimada.toFixed(2)} (${margenPct.toFixed(1)}%)${cobertura}`;
        margenEl.style.display = 'block';
    } else {
        margenEl.innerHTML = '';
        margenEl.style.display = 'none';
    }

    if (state.sucursalSeleccionada) {
        document.getElementById('envioInfo').innerHTML =
            `<span class="badge badge-success">📦 Envío a: ${state.sucursalSeleccionada.nombre} - ${state.sucursalSeleccionada.ciudad}</span>`;
    } else {
        document.getElementById('envioInfo').innerHTML = '';
    }
}

// ============================================
// FORMA DE PAGO / ADELANTO
// ============================================

export function actualizarPago() {
    const adelanto = parseFloat(document.getElementById('montoAdelanto').value) || 0;
    const saldoEl = document.getElementById('saldoPendienteLabel');
    const resumenEl = document.getElementById('pagoResumen');

    if (adelanto <= 0) {
        saldoEl.textContent = '';
        resumenEl.textContent = '';
        return;
    }

    let totalBruto = 0;
    state.productosEnTabla.forEach(p => {
        const precio = p.precioOverride !== undefined ? p.precioOverride : obtenerPrecio(p, p.cantidad);
        totalBruto += p.cantidad * precio;
    });
    const totalFinal = state.mostrarConIGV ? calcularPrecioConIGV(totalBruto) : totalBruto;

    const saldo = Math.max(0, totalFinal - adelanto);
    saldoEl.innerHTML = `&nbsp;·&nbsp; <span style="color:#fbbf24;font-weight:700;">Saldo: S/ ${saldo.toFixed(2)}</span>`;
    resumenEl.textContent = `Adelanto S/ ${adelanto.toFixed(2)} sobre total S/ ${totalFinal.toFixed(2)}`;
}

export function clearAll() {
    if (state.productosEnTabla.length === 0 && !state.sucursalSeleccionada) return;
    mostrarConfirmacion('¿Limpiar todo? Se borran los productos y los datos del cliente — la próxima que guardes será una cotización nueva con su propio correlativo.', () => {
        state.productosEnTabla = [];
        state.sucursalSeleccionada = null;
        state.cotizacionActualId = null;
        document.getElementById('montoAdelanto').value = '';
        document.getElementById('saldoPendienteLabel').textContent = '';
        document.getElementById('pagoResumen').textContent = '';
        document.getElementById('clienteNombre').value = '';
        document.getElementById('clienteEmpresa').value = '';
        document.getElementById('clienteRUC').value = '';
        document.getElementById('clienteTelefono').value = '';
        document.getElementById('clienteEmail').value = '';
        document.getElementById('clienteDireccion').value = '';
        document.getElementById('clienteNotas').value = '';
        actualizarResumenCliente();
        renderTable();
        const sucSel = document.getElementById('sucursalSeleccionada');
        if (sucSel) sucSel.style.display = 'none';
        guardarEstado();
        renderSucursales();
    }, { textoAceptar: 'Sí, limpiar' });
}

// ============================================
// PLANTILLAS DE COTIZACIÓN REUTILIZABLES
// (guarda solo productos/config, sin datos del cliente)
// ============================================

export function getPlantillasDB() {
    try { return JSON.parse(localStorage.getItem('plantillas_lh') || '[]'); }
    catch (e) { return []; }
}

export function guardarComoPlantilla() {
    if (state.productosEnTabla.length === 0) {
        mostrarNotificacion('Agrega productos primero', 'warning');
        return;
    }
    mostrarPrompt('Nombre de la plantilla (ej: "Paquete Habitación Estándar"):', '', (nombre) => {
        if (!nombre || !nombre.trim()) return;

        const plantillas = getPlantillasDB();
        const plantilla = {
            id: Date.now(),
            nombre: nombre.trim(),
            fecha: new Date().toISOString(),
            productos: JSON.parse(JSON.stringify(state.productosEnTabla))
        };
        plantillas.unshift(plantilla);
        if (plantillas.length > 50) plantillas.pop();
        localStorage.setItem('plantillas_lh', JSON.stringify(plantillas));
        mostrarNotificacion(`✅ Plantilla "${plantilla.nombre}" guardada`, 'success');
        if (typeof renderPlantillas === 'function') renderPlantillas();
    });
}

export function cargarPlantilla(id) {
    const plantillas = getPlantillasDB();
    const plantilla = plantillas.find(p => p.id === id);
    if (!plantilla) return;

    const aplicarPlantilla = () => {
        state.productosEnTabla = JSON.parse(JSON.stringify(plantilla.productos));
        renderTable();
        guardarEstado();
        switchTabById('cotizar');
        mostrarNotificacion(`📋 Plantilla "${plantilla.nombre}" cargada`, 'success');
    };

    if (state.productosEnTabla.length > 0) {
        mostrarConfirmacion(`¿Cargar plantilla "${plantilla.nombre}"? Se reemplazarán los productos actuales.`, aplicarPlantilla, { textoAceptar: 'Sí, cargar' });
    } else {
        aplicarPlantilla();
    }
}

export function eliminarPlantilla(id) {
    mostrarConfirmacion('¿Eliminar esta plantilla?', () => {
        const plantillas = getPlantillasDB().filter(p => p.id !== id);
        localStorage.setItem('plantillas_lh', JSON.stringify(plantillas));
        if (typeof renderPlantillas === 'function') renderPlantillas();
    });
}

// ============================================
// COLOR CHIPS
// ============================================

export function setColor(color) {
    document.getElementById('inputColor').value = color;
}

export function initProductosTabla() {
    initAutocompleteYAgregar();
    document.getElementById('montoAdelanto').addEventListener('input', actualizarPago);
    document.querySelectorAll('.color-chip').forEach(chip => {
        chip.addEventListener('click', () => setColor(chip.dataset.color));
    });
    document.getElementById('btnGuardarPlantilla').addEventListener('click', guardarComoPlantilla);
    document.getElementById('btnClearAll').addEventListener('click', clearAll);

    // Accesos rápidos (Fase 4c): un toque agrega el producto a la cotización.
    const arGrid = document.getElementById('accesosRapidosGrid');
    if (arGrid) {
        arGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.acceso-rapido-item');
            if (!btn) return;
            const codigo = decodeURIComponent(btn.dataset.codigo);
            const prod = state.productosDB.find(p => p.codigo === codigo);
            if (prod) agregarProductoATabla(prod, { cantidad: 1 });
        });
    }
    renderAccesosRapidos();

    window.updateCantidad = updateCantidad;
    window.removeProduct = removeProduct;
    window.cargarPlantilla = cargarPlantilla;
    window.eliminarPlantilla = eliminarPlantilla;
    window.switchTabById = switchTabById;
}
