// Pantalla de acceso (config inicial + login/registro) y panel de cuenta.
import { state } from './state.js';
import { PARSE_URL } from './parseClient.js';
import { mostrarNotificacion, mostrarConfirmacion } from './ui-helpers.js';
import { cargarProductosDesdeNube } from '../catalogo/productos-crud.js';
import { cargarEnviosShalom, verificarNotificacionesShalomGlobal } from '../envios/shalom.js';
import { renderHistorial } from '../historial/historial.js';
import { cargarCorrelativoHeaderInfo, cargarCorrelativosUI } from '../historial/correlativos.js';

export function cargarConfigGlobalDesdeStorage() {
    try {
        const c = JSON.parse(localStorage.getItem('lh_cloud_config') || 'null');
        if (c && c.appId && c.jsKey) state.cloudConfig = c;
    } catch (e) { /* ignore */ }
    try {
        const s = JSON.parse(localStorage.getItem('lh_sesion') || 'null');
        if (s) state.sesionUsuario = s;
    } catch (e) { /* ignore */ }
}

export function mostrarVista(idVista) {
    ['vistaConfigInicial', 'vistaLogin', 'vistaRegistro'].forEach(id => {
        document.getElementById(id).style.display = (id === idVista) ? 'block' : 'none';
    });
}
export function mostrarVistaLogin() { mostrarVista('vistaLogin'); }
export function mostrarVistaRegistro() { mostrarVista('vistaRegistro'); }
export function mostrarVistaConfigDesdeGear() {
    document.getElementById('accesoAppId').value = state.cloudConfig.appId || '';
    document.getElementById('accesoJsKey').value = state.cloudConfig.jsKey || '';
    mostrarVista('vistaConfigInicial');
}

export function guardarConfigInicial() {
    const appId = document.getElementById('accesoAppId').value.trim();
    const jsKey = document.getElementById('accesoJsKey').value.trim();
    const errEl = document.getElementById('accesoConfigError');
    if (!appId || !jsKey) {
        errEl.textContent = 'Completa ambos campos.';
        return;
    }
    errEl.textContent = '';
    state.cloudConfig = { appId, jsKey };
    localStorage.setItem('lh_cloud_config', JSON.stringify(state.cloudConfig));
    mostrarVistaLogin();
}

export async function iniciarSesion() {
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    const usuario = document.getElementById('loginUsuario').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!usuario || !password) { errEl.textContent = 'Completa usuario y contraseña.'; return; }

    try {
        const params = new URLSearchParams({ username: usuario, password });
        const res = await fetch(`${PARSE_URL}/login?${params.toString()}`, {
            method: 'GET',
            headers: {
                'X-Parse-Application-Id': state.cloudConfig.appId,
                'X-Parse-JavaScript-Key': state.cloudConfig.jsKey
            }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Usuario o contraseña incorrectos.');

        state.sesionUsuario = { sessionToken: data.sessionToken, userId: data.objectId, username: data.username };
        localStorage.setItem('lh_sesion', JSON.stringify(state.sesionUsuario));
        document.getElementById('pantallaAcceso').style.display = 'none';
        inicializarAppPostLogin();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

export async function registrarUsuario() {
    const errEl = document.getElementById('registroError');
    errEl.textContent = '';
    const usuario = document.getElementById('registroUsuario').value.trim();
    const email = document.getElementById('registroEmail').value.trim();
    const password = document.getElementById('registroPassword').value;
    if (!usuario || !password) { errEl.textContent = 'Usuario y contraseña son obligatorios.'; return; }
    if (password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    try {
        const res = await fetch(`${PARSE_URL}/users`, {
            method: 'POST',
            headers: {
                'X-Parse-Application-Id': state.cloudConfig.appId,
                'X-Parse-JavaScript-Key': state.cloudConfig.jsKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: usuario, password, email: email || undefined })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta (¿usuario ya existe?).');

        state.sesionUsuario = { sessionToken: data.sessionToken, userId: data.objectId, username: usuario };
        localStorage.setItem('lh_sesion', JSON.stringify(state.sesionUsuario));
        document.getElementById('pantallaAcceso').style.display = 'none';
        inicializarAppPostLogin();
    } catch (err) {
        errEl.textContent = err.message;
    }
}

export function cerrarSesion() {
    mostrarConfirmacion('¿Cerrar sesión en este dispositivo?', async () => {
        try {
            if (state.sesionUsuario) {
                await fetch(`${PARSE_URL}/logout`, {
                    method: 'POST',
                    headers: {
                        'X-Parse-Application-Id': state.cloudConfig.appId,
                        'X-Parse-JavaScript-Key': state.cloudConfig.jsKey,
                        'X-Parse-Session-Token': state.sesionUsuario.sessionToken
                    }
                });
            }
        } catch (err) { /* seguimos igual, ya limpiamos localmente */ }
        localStorage.removeItem('lh_sesion');
        location.reload();
    }, { textoAceptar: 'Sí, cerrar sesión' });
}

// Verifica al cargar la página si la sesión guardada sigue siendo válida.
export async function validarAccesoAlCargar() {
    cargarConfigGlobalDesdeStorage();

    if (!state.cloudConfig.appId || !state.cloudConfig.jsKey) {
        mostrarVista('vistaConfigInicial');
        return false;
    }

    if (!state.sesionUsuario || !state.sesionUsuario.sessionToken) {
        mostrarVista('vistaLogin');
        return false;
    }

    try {
        const res = await fetch(`${PARSE_URL}/users/me`, {
            headers: {
                'X-Parse-Application-Id': state.cloudConfig.appId,
                'X-Parse-JavaScript-Key': state.cloudConfig.jsKey,
                'X-Parse-Session-Token': state.sesionUsuario.sessionToken
            }
        });
        if (!res.ok) throw new Error('sesión inválida');
        document.getElementById('pantallaAcceso').style.display = 'none';
        return true;
    } catch (err) {
        state.sesionUsuario = null;
        localStorage.removeItem('lh_sesion');
        mostrarVista('vistaLogin');
        return false;
    }
}

// ---------- Panel de cuenta (⚙️) ----------

export function abrirPanelCuenta() {
    document.getElementById('panelCuentaUsuario').textContent = state.sesionUsuario ? state.sesionUsuario.username : '—';
    document.getElementById('panelAppId').value = state.cloudConfig.appId || '';
    document.getElementById('panelJsKey').value = state.cloudConfig.jsKey || '';
    document.getElementById('panelCuentaModal').classList.add('active');
    cargarCorrelativosUI();
}
export function cerrarPanelCuenta() {
    document.getElementById('panelCuentaModal').classList.remove('active');
}
export function guardarConfigDesdeGear() {
    const appId = document.getElementById('panelAppId').value.trim();
    const jsKey = document.getElementById('panelJsKey').value.trim();
    if (!appId || !jsKey) { mostrarNotificacion('⚠️ Completa ambos campos', 'warning'); return; }
    state.cloudConfig = { appId, jsKey };
    localStorage.setItem('lh_cloud_config', JSON.stringify(state.cloudConfig));
    mostrarNotificacion('✅ Configuración actualizada', 'success');
}

// Todo lo que dependía de la nube (Shalom + historial) se inicializa
// recién aquí, una vez que sabemos que hay sesión válida.
export function inicializarAppPostLogin() {
    cargarProductosDesdeNube();
    cargarEnviosShalom();
    renderHistorial();
    verificarNotificacionesShalomGlobal();
    cargarCorrelativoHeaderInfo();
}

export function initAuth() {
    document.getElementById('btnGuardarConfigInicial').addEventListener('click', guardarConfigInicial);
    document.getElementById('btnIniciarSesion').addEventListener('click', iniciarSesion);
    document.getElementById('linkMostrarRegistro').addEventListener('click', (e) => { e.preventDefault(); mostrarVistaRegistro(); });
    document.getElementById('linkConfigDesdeGear').addEventListener('click', (e) => { e.preventDefault(); mostrarVistaConfigDesdeGear(); });
    document.getElementById('btnRegistrarUsuario').addEventListener('click', registrarUsuario);
    document.getElementById('linkMostrarLogin').addEventListener('click', (e) => { e.preventDefault(); mostrarVistaLogin(); });
    document.getElementById('btnCerrarPanelCuenta').addEventListener('click', cerrarPanelCuenta);
    document.getElementById('btnGuardarConfigDesdeGear').addEventListener('click', guardarConfigDesdeGear);
    document.getElementById('btnCerrarSesion').addEventListener('click', cerrarSesion);
    document.getElementById('btnAbrirPanelCuenta').addEventListener('click', abrirPanelCuenta);
}
