// Punto de entrada: importa todos los módulos, registra los listeners
// globales (atajos de teclado, sincronización entre pestañas, cierre de
// modales al hacer click fuera) y arranca la app en window.onload —
// igual que el <script> original al final de index.html.
import { state } from './core/state.js';
import { initAuth, validarAccesoAlCargar, inicializarAppPostLogin, mostrarVista } from './core/auth.js';
import { initUiHelpers, cargarPreferencias, toggleDarkMode } from './core/ui-helpers.js';
import { initPrecios } from './cotizador/precios.js';
import { initProductosTabla, cargarEstado, switchTab } from './cotizador/productos-tabla.js';
import { initCliente } from './cotizador/cliente.js';
import { initExport } from './cotizador/export.js';
import { initProductosCrud, renderProductList, closeEditProductoModal } from './catalogo/productos-crud.js';
import { initSucursalesCrud, renderSucursales, poblarListaProvincias, renderSucursalList, closeEditSucursalModal } from './catalogo/sucursales-crud.js';
import { initHistorial, guardarEnHistorial } from './historial/historial.js';
import { initCorrelativos } from './historial/correlativos.js';
import { initShalom } from './envios/shalom.js';
import { initLima } from './envios/lima.js';
import { initPapeleta } from './envios/papeleta.js';
import { initListaCompra } from './envios/lista-compra.js';
import { initDashboard } from './dashboard/dashboard.js';
import { initFichas } from './fichas-tecnicas/fichas.js';

// Re-exportado para los módulos que necesitan cambiar de pestaña desde
// código (cargar plantilla, cargar desde historial, atajo "Registrar
// guía"): viven en cotizador/productos-tabla.js (junto a switchTab, con
// el que comparte lógica), main.js solo lo vuelve a exponer aquí para
// quien importe la app desde este archivo.
export { switchTabById } from './cotizador/productos-tabla.js';

// ============================================
// SISTEMA DE TABS — listeners de los 9 botones
// ============================================
function initTabs() {
    document.querySelectorAll('.tab[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(btn.dataset.tab, e));
    });
}

// ============================================
// ATAJOS DE TECLADO
// Ctrl/Cmd+S: guardar cotización en historial
// Ctrl/Cmd+K: enfocar buscador de productos
// Ctrl/Cmd+D: alternar tema oscuro
// Esc: cerrar modales abiertos
// ============================================
function initAtajosTeclado() {
    document.addEventListener('keydown', function (e) {
        const ctrlOrCmd = e.ctrlKey || e.metaKey;

        if (ctrlOrCmd && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (typeof guardarEnHistorial === 'function') {
                guardarEnHistorial();
            }
        } else if (ctrlOrCmd && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const el = document.getElementById('searchInput');
            if (el) el.focus();
        } else if (ctrlOrCmd && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            toggleDarkMode();
        } else if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        }
    });
}

// ============================================
// SINCRONIZACIÓN ENTRE PESTAÑAS
// Detecta cambios de historial/clientes/productos
// hechos en otra pestaña y avisa al usuario.
// ============================================
function initSyncEntrePestanas() {
    window.addEventListener('storage', function (e) {
        const clavesRelevantes = ['clientes_lh_db', 'sucursales_lh_db', 'productos_lh_db'];
        if (clavesRelevantes.includes(e.key)) {
            const indicator = document.getElementById('syncIndicator');
            if (indicator) indicator.classList.add('show');
        }
    });
    document.getElementById('syncIndicator').addEventListener('click', () => location.reload());
}

function initCerrarModalesAlClickFuera() {
    document.getElementById('editProductoModal').addEventListener('click', function (e) {
        if (e.target === this) closeEditProductoModal();
    });

    document.getElementById('editSucursalModal').addEventListener('click', function (e) {
        if (e.target === this) closeEditSucursalModal();
    });
}

function initTodosLosModulos() {
    initAuth();
    initUiHelpers();
    initPrecios();
    initProductosTabla();
    initCliente();
    initExport();
    initProductosCrud();
    initSucursalesCrud();
    initHistorial();
    initCorrelativos();
    initShalom();
    initLima();
    initPapeleta();
    initListaCompra();
    initDashboard();
    initFichas();
    initTabs();
    initAtajosTeclado();
    initSyncEntrePestanas();
    initCerrarModalesAlClickFuera();
}

initTodosLosModulos();

window.onload = async function () {
    // La pantalla de acceso (login/registro) se resuelve PRIMERO y
    // aislada en su propio try/catch — así, si algo más abajo falla,
    // el usuario igual puede ver los campos de usuario/contraseña
    // en vez de una pantalla en blanco.
    let accesoValido = false;
    try {
        accesoValido = await validarAccesoAlCargar();
    } catch (err) {
        console.error('Error validando acceso:', err);
        mostrarVista('vistaLogin');
    }

    // Sucursales y preferencias locales no dependen de la nube.
    // El catálogo de productos SÍ depende de la nube (se carga en
    // inicializarAppPostLogin) — aquí solo dejamos la lista en 0
    // hasta que el login se resuelva.
    try {
        cargarEstado();
        cargarPreferencias(); // Cargar preferencias de IGV, Forzar Por Mayor y tema
        renderSucursales();
        poblarListaProvincias();
        renderProductList();
        renderSucursalList();
        renderPlantillas();
        console.log('✅ Cotizador cargado correctamente');
        console.log(`🚚 ${state.sucursalesDB.length} sucursales disponibles`);
    } catch (err) {
        console.error('Error inicializando el catálogo local:', err);
    }

    // Historial de cotizaciones y Shalom sí dependen de estar logueado.
    if (accesoValido) {
        try {
            inicializarAppPostLogin();
        } catch (err) {
            console.error('Error inicializando datos de la nube:', err);
        }
    }
};
