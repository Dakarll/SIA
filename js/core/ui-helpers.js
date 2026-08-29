// Notificaciones, modal genérico de confirmación/prompt, accesibilidad
// genérica de modales, dark mode y utilidades varias de UI.
import { state } from './state.js';

export function debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Cargar preferencias guardadas
export function cargarPreferencias() {
    // Cargar IGV
    const savedIGV = localStorage.getItem('mostrar_igv');
    if (savedIGV !== null) {
        state.mostrarConIGV = savedIGV === 'true';
        document.getElementById('toggleIGV').checked = state.mostrarConIGV;
        document.getElementById('igvStatusText').textContent = state.mostrarConIGV ? 'Precios CON IGV' : 'Precios SIN IGV';
        document.getElementById('igvStatusText').style.color = state.mostrarConIGV ? '#48bb78' : 'inherit';
    }

    // Cargar tema (dark mode)
    const savedTheme = localStorage.getItem('tema_lh');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggleBtn').textContent = '☀️ Claro';
    }

    // Cargar estado de la sidebar de desktop (contraída / desplegada)
    if (localStorage.getItem('sidebar_colapsada_lh') === '1') {
        document.body.classList.add('sidebar-collapsed');
    }
    actualizarBotonSidebar();
}

// ============================================
// SIDEBAR DE DESKTOP — contraer / desplegar
// ============================================
function actualizarBotonSidebar() {
    const btn = document.getElementById('sidebarToggle');
    if (!btn) return;
    const colapsada = document.body.classList.contains('sidebar-collapsed');
    btn.textContent = colapsada ? '›' : '‹';
    btn.title = colapsada ? 'Desplegar menú' : 'Contraer menú';
    btn.setAttribute('aria-label', btn.title);
}

export function toggleSidebarColapsado() {
    const colapsada = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebar_colapsada_lh', colapsada ? '1' : '0');
    actualizarBotonSidebar();
}

// ============================================
// MODO OSCURO
// ============================================
export function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('tema_lh', isDark ? 'dark' : 'light');
    document.getElementById('themeToggleBtn').textContent = isDark ? '☀️ Claro' : '🌙 Oscuro';
}

// El CSS (prefers-reduced-motion, ver css/base.css) ya cubre las
// animaciones/transiciones de la página, pero los gráficos del
// Dashboard los dibuja Chart.js con su propia animación interna
// (no controlable por CSS) — se apaga a mano aquí.
export function prefiereMovimientoReducido() {
    return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('active', show);
}

export function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `notification ${tipo}`;
    div.textContent = mensaje;
    document.body.appendChild(div);

    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// ============================================
// MODAL DE CONFIRMACIÓN / PROMPT
// Reemplaza a confirm()/prompt() nativos del navegador por un
// único modal reutilizable con la identidad visual de la app.
//
// Uso:
//   mostrarConfirmacion('¿Seguro?', () => { ...si acepta... });
//   mostrarPrompt('Nombre:', '', (valor) => { ...si acepta... });
//
// OJO: a diferencia de confirm()/prompt() nativos (que BLOQUEAN
// la ejecución y devuelven un valor de inmediato), este modal es
// asíncrono — no bloquea nada. Por eso el código que antes iba
// después de "if (confirm(...))" ahora va DENTRO del callback.
// ============================================
export let mostrarConfirmacion = () => {};
export let mostrarPrompt = () => {};

(function () {
    const modal = document.getElementById('modalConfirmacion');
    const tituloEl = document.getElementById('modalConfirmacionTitulo');
    const mensajeEl = document.getElementById('modalConfirmacionMensaje');
    const promptWrap = document.getElementById('modalConfirmacionPromptWrap');
    const inputEl = document.getElementById('modalConfirmacionInput');
    const btnAceptar = document.getElementById('modalConfirmacionAceptar');
    const btnCancelar = document.getElementById('modalConfirmacionCancelar');
    const btnCerrarX = document.getElementById('modalConfirmacionCerrarX');

    if (!modal) return; // por si el HTML del modal no está presente

    let disparador = null;   // elemento con foco antes de abrir el modal
    let esPrompt = false;
    let callbackAceptar = null;

    function elementosFocables() {
        return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled && el.offsetParent !== null);
    }

    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            cerrar(false);
            return;
        }
        if (e.key === 'Tab') {
            // Trap de foco: Tab no debe salir del modal mientras esté abierto.
            const focables = elementosFocables();
            if (focables.length === 0) return;
            const primero = focables[0];
            const ultimo = focables[focables.length - 1];
            if (e.shiftKey && document.activeElement === primero) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero.focus();
            }
        }
    }

    function onClickFuera(e) {
        if (e.target === modal) cerrar(false);
    }

    function cerrar(confirmado) {
        modal.classList.remove('active');
        document.removeEventListener('keydown', onKeydown);
        modal.removeEventListener('click', onClickFuera);

        const callback = callbackAceptar;
        const valor = esPrompt ? inputEl.value : undefined;
        const elementoAEnfocar = disparador;
        callbackAceptar = null;
        disparador = null;

        if (confirmado && callback) {
            esPrompt ? callback(valor) : callback();
        }

        // Devuelve el foco a quien abrió el modal. Muchas de estas
        // acciones re-renderizan listas (renderTable, renderHistorial,
        // etc.), así que el elemento original puede ya no existir —
        // en ese caso simplemente no se restaura el foco.
        if (elementoAEnfocar && document.contains(elementoAEnfocar) && typeof elementoAEnfocar.focus === 'function') {
            elementoAEnfocar.focus();
        }
    }

    function abrir(opts) {
        const { titulo, mensaje, prompt, valorInicial, textoAceptar, textoCancelar, callback } = opts;
        disparador = document.activeElement;
        esPrompt = !!prompt;
        callbackAceptar = callback;

        tituloEl.textContent = titulo || (esPrompt ? 'Completar dato' : 'Confirmar');
        mensajeEl.textContent = mensaje || '';
        btnAceptar.textContent = textoAceptar || 'Aceptar';
        btnCancelar.textContent = textoCancelar || 'Cancelar';
        // Colores fijos: Cancelar siempre rojo, Aceptar siempre
        // neutro (sin color de botón) — ver estilo en el HTML del
        // modal (#modalConfirmacionAceptar / #modalConfirmacionCancelar).

        if (esPrompt) {
            promptWrap.style.display = 'block';
            inputEl.value = valorInicial || '';
        } else {
            promptWrap.style.display = 'none';
        }

        modal.classList.add('active');
        document.addEventListener('keydown', onKeydown);
        modal.addEventListener('click', onClickFuera);

        // Foco inicial: el input si es prompt, si no el botón principal.
        setTimeout(() => {
            if (esPrompt) {
                inputEl.focus();
                inputEl.select();
            } else {
                btnAceptar.focus();
            }
        }, 0);
    }

    btnAceptar.addEventListener('click', () => cerrar(true));
    btnCancelar.addEventListener('click', () => cerrar(false));
    btnCerrarX.addEventListener('click', () => cerrar(false));
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
    });

    // mostrarConfirmacion(mensaje, onConfirmar, opts?)
    // opts: { titulo, textoAceptar, textoCancelar }
    // Por defecto el botón de confirmar dice "Sí, eliminar" (la
    // mayoría de los usos son de borrado) — pásale textoAceptar
    // para acciones que no son un borrado (ej. "Sí, cargar").
    mostrarConfirmacion = function (mensaje, onConfirmar, opts) {
        opts = opts || {};
        abrir({
            mensaje,
            callback: onConfirmar,
            prompt: false,
            titulo: opts.titulo,
            textoAceptar: opts.textoAceptar || 'Sí, eliminar',
            textoCancelar: opts.textoCancelar || 'Cancelar'
        });
    };

    // mostrarPrompt(mensaje, valorInicial, onAceptar, opts?)
    mostrarPrompt = function (mensaje, valorInicial, onAceptar, opts) {
        opts = opts || {};
        abrir({
            mensaje,
            callback: onAceptar,
            prompt: true,
            valorInicial,
            titulo: opts.titulo,
            textoAceptar: opts.textoAceptar || 'Aceptar',
            textoCancelar: opts.textoCancelar
        });
    };

    window.mostrarConfirmacion = mostrarConfirmacion;
    window.mostrarPrompt = mostrarPrompt;
})();

// ============================================
// ACCESIBILIDAD GENÉRICA DE MODALES (.modal)
// Se aplica automáticamente a todo elemento .modal existente al
// cargar la página (editProductoModal, verCotizacionModal,
// listaCompraModal, panelCuentaModal, editSucursalModal), sin
// tener que tocar cada uno de los sitios donde se abren/cierran
// (siguen usando su propio classList.add/remove('active') igual
// que antes). Un MutationObserver por modal vigila el cambio de
// la clase "active" y, mientras está activo:
//   - Atrapa el foco (Tab no sale del modal).
//   - Cierra con Esc (simulando un click en su botón "×").
//   - Al abrir, mueve el foco al primer campo interactivo (sin
//     contar el botón "×" de cerrar).
//   - Al cerrar, devuelve el foco a quien abrió el modal.
// #modalConfirmacion NO se incluye aquí: ya tiene su propio
// manejo (ver sección "MODAL DE CONFIRMACIÓN / PROMPT" arriba),
// hecho a medida para su flujo de confirmar/cancelar/prompt.
// ============================================
(function () {
    const SELECTOR_FOCABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    const estadoPorModal = new WeakMap(); // modal -> { disparador, onKeydown }

    function esVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function elementosFocables(modal) {
        return Array.from(modal.querySelectorAll(SELECTOR_FOCABLES)).filter(esVisible);
    }

    function cerrarModal(modal) {
        // Usa el botón "×" propio del modal (si existe) para que
        // corra también su lógica de limpieza (closeEditProductoModal,
        // cerrarPanelCuenta, etc.), en vez de solo quitar la clase.
        const btnCerrar = modal.querySelector('.modal-close');
        if (btnCerrar) { btnCerrar.click(); return; }
        modal.classList.remove('active');
    }

    function onKeydownModal(e) {
        const modal = e.currentTarget;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cerrarModal(modal);
            return;
        }
        if (e.key === 'Tab') {
            const focables = elementosFocables(modal);
            if (focables.length === 0) return;
            const primero = focables[0];
            const ultimo = focables[focables.length - 1];
            if (e.shiftKey && document.activeElement === primero) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero.focus();
            }
        }
    }

    function activarModal(modal) {
        if (estadoPorModal.has(modal)) return;
        const disparador = document.activeElement;
        modal.addEventListener('keydown', onKeydownModal);
        estadoPorModal.set(modal, { disparador });

        setTimeout(() => {
            const focables = elementosFocables(modal);
            // Foco inicial en el primer campo real, no en el "×".
            const primero = focables.find(el => !el.classList.contains('modal-close')) || focables[0];
            if (primero) primero.focus();
        }, 0);
    }

    function desactivarModal(modal) {
        const estado = estadoPorModal.get(modal);
        if (!estado) return;
        modal.removeEventListener('keydown', onKeydownModal);
        estadoPorModal.delete(modal);
        if (estado.disparador && document.contains(estado.disparador) && typeof estado.disparador.focus === 'function') {
            estado.disparador.focus();
        }
    }

    document.querySelectorAll('.modal').forEach((modal) => {
        if (modal.id === 'modalConfirmacion') return; // manejo propio, ver arriba
        if (modal.classList.contains('active')) activarModal(modal);
        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName !== 'class') return;
                if (modal.classList.contains('active')) activarModal(modal);
                else desactivarModal(modal);
            });
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
})();

export function initUiHelpers() {
    document.getElementById('themeToggleBtn').addEventListener('click', toggleDarkMode);
    const sbToggle = document.getElementById('sidebarToggle');
    if (sbToggle) sbToggle.addEventListener('click', toggleSidebarColapsado);
}
