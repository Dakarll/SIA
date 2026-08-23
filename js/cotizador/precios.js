// IGV, niveles de precio (tiers) y overrides de precio manuales.
import { state } from '../core/state.js';
import { mostrarNotificacion } from '../core/ui-helpers.js';
import { renderTable, guardarEstado } from './productos-tabla.js';
import { renderProductList } from '../catalogo/productos-crud.js';

const IGV_RATE = 0.18; // 18% IGV en Perú

// Calcular precio con IGV
export function calcularPrecioConIGV(precioBase) {
    return precioBase * (1 + IGV_RATE);
}

// Calcular solo el IGV
export function calcularIGV(precioBase) {
    return precioBase * IGV_RATE;
}

// Obtener precio correcto según configuración
// Devuelve los niveles de precio de un producto. Si el producto no
// tiene "tiers" (catálogo antiguo o recién creado sin niveles),
// se arma uno equivalente a partir de menor/mayor, para que todo
// lo demás del sistema (tabla, PDF, Excel, margen) siga funcionando
// igual sin importar si el producto usa el sistema viejo o nuevo.
export function obtenerTiersProducto(producto) {
    if (producto.tiers && producto.tiers.length > 0) {
        return [...producto.tiers].sort((a, b) => a.cantidadMinima - b.cantidadMinima);
    }
    return [
        { etiqueta: 'Por menor', cantidadMinima: 1, precio: producto.menor || 0 },
        { etiqueta: 'Por mayor', cantidadMinima: 6, precio: producto.mayor || producto.menor || 0 }
    ];
}

export function obtenerPrecio(producto, cantidad) {
    const tiers = obtenerTiersProducto(producto);

    if (state.forzarPorMayor) {
        return tiers[tiers.length - 1].precio; // el nivel más alto disponible
    }

    let elegido = tiers[0];
    for (const t of tiers) {
        if (cantidad >= t.cantidadMinima) elegido = t;
    }
    return elegido.precio;
}

// Nombre del nivel de precio aplicado (para mostrar en la tabla,
// ej. "Docena" en vez de solo el número).
export function obtenerEtiquetaNivel(producto, cantidad) {
    const tiers = obtenerTiersProducto(producto);
    if (state.forzarPorMayor) return tiers[tiers.length - 1].etiqueta;
    let elegido = tiers[0];
    for (const t of tiers) {
        if (cantidad >= t.cantidadMinima) elegido = t;
    }
    return elegido.etiqueta;
}

// Toggle de IGV
export function toggleIGVPrecios() {
    const checkbox = document.getElementById('toggleIGV');
    state.mostrarConIGV = checkbox.checked;

    // Actualizar texto del estado
    const statusText = document.getElementById('igvStatusText');
    statusText.textContent = state.mostrarConIGV ? 'Precios CON IGV' : 'Precios SIN IGV';
    statusText.style.color = state.mostrarConIGV ? '#48bb78' : 'inherit';

    // Guardar preferencia
    localStorage.setItem('mostrar_igv', state.mostrarConIGV);

    // Re-renderizar todas las vistas
    renderTable();
    renderProductList();

    mostrarNotificacion(
        state.mostrarConIGV ? '✅ Mostrando precios CON IGV (18%)' : 'ℹ️ Mostrando precios SIN IGV',
        state.mostrarConIGV ? 'success' : 'info'
    );
}

export function togglePrecioEdit(index) {
    const editDiv = document.getElementById(`precioEdit_${index}`);
    editDiv.classList.toggle('visible');
    if (editDiv.classList.contains('visible')) {
        document.getElementById(`precioInput_${index}`).focus();
        document.getElementById(`precioInput_${index}`).select();
    }
}

export function guardarPrecioOverride(index) {
    const val = parseFloat(document.getElementById(`precioInput_${index}`).value);
    if (isNaN(val) || val < 0) {
        mostrarNotificacion('Ingresa un precio válido', 'warning');
        return;
    }
    state.productosEnTabla[index].precioOverride = val;
    guardarEstado();
    renderTable();
    mostrarNotificacion(`✅ Precio actualizado a S/ ${val.toFixed(2)}`, 'success');
}

export function cancelarPrecioEdit(index) {
    const editDiv = document.getElementById(`precioEdit_${index}`);
    if (editDiv) editDiv.classList.remove('visible');
}

export function restaurarPrecio(index) {
    delete state.productosEnTabla[index].precioOverride;
    guardarEstado();
    renderTable();
    mostrarNotificacion('↩ Precio restaurado al original', 'info');
}

export function initPrecios() {
    document.getElementById('toggleIGV').addEventListener('change', toggleIGVPrecios);
    window.togglePrecioEdit = togglePrecioEdit;
    window.guardarPrecioOverride = guardarPrecioOverride;
    window.cancelarPrecioEdit = cancelarPrecioEdit;
    window.restaurarPrecio = restaurarPrecio;
}
