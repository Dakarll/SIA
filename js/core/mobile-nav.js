// FASE 4a — Navegación móvil tipo "pila" (stack) al estilo iOS Settings.
// En móvil (<1024px) la barra de tabs horizontal y la sidebar quedan
// ocultas: se navega desde una pantalla raíz "Inicio" (lista agrupada)
// hacia cada sección, con botón "‹ Inicio" para volver y transición de
// slide direccional (push/pop). En desktop este módulo no hace nada:
// manda la sidebar (Fase 3).
//
// No reimplementa el motor de vistas: cada sección sigue siendo su
// <div class="tab-content" id="tab-...">, con sus mismos ids y handlers.
// mobileNav solo activa la vista con switchTabById + renderTabContent
// (extraídos de switchTab) y añade la capa de animación/historial.
import { state } from './state.js';
import { switchTabById, renderTabContent } from '../cotizador/productos-tabla.js';

const MOBILE_MQ = '(max-width: 1023px)';

const TITULOS = {
    inicio: 'Inicio',
    cotizar: 'Cotizar',
    historial: 'Historial',
    envios: 'Envíos',
    productos: 'Productos',
    sucursales: 'Sucursales',
    fichas: 'Fichas Técnicas',
    dashboard: 'Dashboard',
    shalom: 'Seguimiento Shalom'
};

const byId = id => document.getElementById(id);

export const mobileNav = {
    stack: ['inicio'],
    _animating: false,
    _cleanupTimer: null,
    _wasMobile: null,

    isMobile() {
        return window.matchMedia(MOBILE_MQ).matches;
    },

    // Navega hacia una sección (push). En desktop delega en switchTabById.
    go(id) {
        if (!TITULOS[id]) return;
        if (!this.isMobile()) {
            switchTabById(id);
            renderTabContent(id);
            state.tabActual = id;
            return;
        }
        const from = this.stack[this.stack.length - 1];
        if (from === id) return;
        this.stack.push(id);
        this._transition(from, id, 'forward');
    },

    // Vuelve una pantalla atrás (pop).
    back() {
        if (!this.isMobile() || this.stack.length <= 1) return;
        const from = this.stack.pop();
        const to = this.stack[this.stack.length - 1];
        this._transition(from, to, 'back');
    },

    // Vuelve directo a la raíz (Inicio) sin animar toda la pila.
    goHome() {
        if (!this.isMobile()) return;
        const from = this.stack[this.stack.length - 1];
        this.stack = ['inicio'];
        if (from !== 'inicio') this._transition(from, 'inicio', 'back');
    },

    // Limpia cualquier resto de animación de una transición previa: quita
    // .mn-leaving de todas las vistas y borra los estilos inline que pone
    // _transition. Garantiza que ninguna vista quede "atascada" desplazada.
    _clearAnim() {
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('mn-leaving');
            el.style.removeProperty('transition');
            el.style.removeProperty('transform');
            el.style.removeProperty('opacity');
        });
        if (this._cleanupTimer) { clearTimeout(this._cleanupTimer); this._cleanupTimer = null; }
        this._animating = false;
    },

    _transition(fromId, toId, dir) {
        this._clearAnim();

        const fromEl = byId('tab-' + fromId);
        const toEl = byId('tab-' + toId);

        // La saliente se mantiene visible como capa mientras dura el slide.
        if (fromEl && toEl && fromEl !== toEl) fromEl.classList.add('mn-leaving');

        switchTabById(toId);
        renderTabContent(toId);
        state.tabActual = toId;
        this._syncChrome(toId);
        window.scrollTo(0, 0);

        if (!fromEl || !toEl || fromEl === toEl || !this.isMobile()) {
            if (fromEl) fromEl.classList.remove('mn-leaving');
            return;
        }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            fromEl.classList.remove('mn-leaving');
            return;
        }

        // 1) Estado inicial SIN transición.
        fromEl.style.transition = 'none';
        toEl.style.transition = 'none';
        fromEl.style.transform = 'translateX(0)';
        fromEl.style.opacity = '1';
        toEl.style.transform = dir === 'forward' ? 'translateX(100%)' : 'translateX(-25%)';
        toEl.style.opacity = dir === 'forward' ? '1' : '0.4';

        // 2) Doble rAF -> ahora sí, con transición, hacia el estado final.
        this._animating = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            fromEl.style.removeProperty('transition');
            toEl.style.removeProperty('transition');
            toEl.style.transform = 'translateX(0)';
            toEl.style.opacity = '1';
            fromEl.style.transform = dir === 'forward' ? 'translateX(-25%)' : 'translateX(100%)';
            fromEl.style.opacity = dir === 'forward' ? '0.4' : '1';
        }));

        this._cleanupTimer = setTimeout(() => this._clearAnim(), 420);
    },

    _syncChrome(id) {
        const bar = byId('mobileTopBar');
        const title = byId('mobileScreenTitle');
        const mob = this.isMobile();
        if (title) title.textContent = TITULOS[id] || '';
        if (bar) bar.classList.toggle('mn-hidden', id === 'inicio' || !mob);
        document.body.classList.toggle('mn-deep', mob && id !== 'inicio');
        // El footer .total-section (barra de la cotización) solo tiene
        // sentido en la pantalla "Cotizar" cuando navegamos por pila.
        document.body.classList.toggle('mn-on-cotizar', mob && id === 'cotizar');
    },

    _applyModeInicial() {
        const mob = this.isMobile();
        this._wasMobile = mob;
        if (mob) {
            this.stack = ['inicio'];
            switchTabById('inicio');
            this._syncChrome('inicio');
        } else {
            this._syncChrome(state.tabActual || 'cotizar');
        }
    },

    _onResize() {
        const mob = this.isMobile();
        if (mob === this._wasMobile) return;
        this._wasMobile = mob;
        if (mob) {
            // Desktop -> móvil: arrancar en Inicio.
            this.stack = ['inicio'];
            switchTabById('inicio');
            this._syncChrome('inicio');
        } else {
            // Móvil -> desktop: si estábamos en "Inicio" (que no existe en
            // la sidebar) caer a Cotizar; limpiar restos de animación.
            document.querySelectorAll('.tab-content').forEach(el =>
                el.classList.remove('mn-leaving', 'mn-to-left', 'mn-to-right', 'mn-from-right', 'mn-from-left'));
            const cur = state.tabActual || 'cotizar';
            const destino = (cur === 'inicio') ? 'cotizar' : cur;
            switchTabById(destino);
            renderTabContent(destino);
            state.tabActual = destino;
            this._syncChrome(destino);
        }
    }
};

export function initMobileNav() {
    // Filas de la lista "Inicio".
    const inicio = byId('tab-inicio');
    if (inicio) {
        inicio.addEventListener('click', (e) => {
            const row = e.target.closest('[data-go]');
            if (row) mobileNav.go(row.dataset.go);
        });
    }
    // Botón "‹ Inicio" del top bar móvil (pop de la pila).
    const back = byId('mobileBackBtn');
    if (back) back.addEventListener('click', () => mobileNav.back());

    let t;
    window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => mobileNav._onResize(), 150);
    });

    mobileNav._applyModeInicial();
    window.mobileNav = mobileNav; // por si algún onclick generado lo necesita
}
