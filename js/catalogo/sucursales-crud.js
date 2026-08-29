// Gestión de sucursales (alta/edición/baja) + filtro y mapa por provincia
// para la pestaña de Sucursales dentro de la cotización.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion, showLoading, debounce } from '../core/ui-helpers.js';
import { guardarEstado, updateTotal } from '../cotizador/productos-tabla.js';
import { descargarOCompartirCanvas } from '../cotizador/export.js';

export function agregarNuevaSucursal(event) {
    event.preventDefault();

    const nombre = document.getElementById('newSucursalNombre').value.trim();
    const direccion = document.getElementById('newSucursalDireccion').value.trim();
    const ciudad = document.getElementById('newSucursalCiudad').value.trim();
    const provincia = document.getElementById('newSucursalProvincia').value.trim();
    const tipo = document.getElementById('newSucursalTipo').value;

    const existe = state.sucursalesDB.find(s => s.nombre === nombre);
    if (existe) {
        mostrarNotificacion('⚠️ Ya existe una sucursal con ese nombre', 'warning');
        return;
    }

    state.sucursalesDB.push({ nombre, direccion, ciudad, provincia, tipo });
    guardarEstado();
    renderSucursalList();
    renderSucursales();        // Fase 4b: refrescar la lista unificada
    poblarListaProvincias();

    document.getElementById('newSucursalForm').reset();
    const det = document.querySelector('.suc-add-details');
    if (det) det.open = false;
    mostrarNotificacion('✅ Sucursal agregada correctamente', 'success');
}

export function renderSucursalList() {
    const tbody = document.getElementById('sucursalListBody');
    const searchValue = document.getElementById('searchSucursalGestion').value.toLowerCase();

    document.getElementById('sucursalCount').textContent = state.sucursalesDB.length;

    let filtered = state.sucursalesDB;
    if (searchValue.length >= 2) {
        filtered = state.sucursalesDB.filter(s =>
            s.nombre.toLowerCase().includes(searchValue) ||
            s.ciudad.toLowerCase().includes(searchValue) ||
            s.provincia.toLowerCase().includes(searchValue)
        );
    }

    tbody.innerHTML = filtered.map((sucursal, index) => {
        const realIndex = state.sucursalesDB.findIndex(s => s.nombre === sucursal.nombre);
        return `
            <tr>
                <td class="producto-cell">${sucursal.nombre}</td>
                <td>${sucursal.direccion}</td>
                <td>${sucursal.ciudad}</td>
                <td>${sucursal.provincia}</td>
                <td><span class="sucursal-tipo">${sucursal.tipo}</span></td>
                <td>
                    <button class="btn-edit" aria-label="Editar sucursal" onclick="editarSucursal(${realIndex})">✏️</button>
                    <button class="btn-remove" aria-label="Eliminar sucursal" onclick="eliminarSucursal(${realIndex})">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

export function editarSucursal(index) {
    state.sucursalEditandoIndex = index;
    const sucursal = state.sucursalesDB[index];

    document.getElementById('editSucursalNombre').value = sucursal.nombre;
    document.getElementById('editSucursalDireccion').value = sucursal.direccion;
    document.getElementById('editSucursalCiudad').value = sucursal.ciudad;
    document.getElementById('editSucursalProvincia').value = sucursal.provincia;
    document.getElementById('editSucursalTipo').value = sucursal.tipo;

    document.getElementById('editSucursalModal').classList.add('active');
}

export function closeEditSucursalModal() {
    document.getElementById('editSucursalModal').classList.remove('active');
    state.sucursalEditandoIndex = -1;
}

function onSubmitEditSucursal(e) {
    e.preventDefault();

    if (state.sucursalEditandoIndex === -1) return;

    const nuevoNombre = document.getElementById('editSucursalNombre').value.trim();
    const nuevaDireccion = document.getElementById('editSucursalDireccion').value.trim();
    const nuevaCiudad = document.getElementById('editSucursalCiudad').value.trim();
    const nuevaProvincia = document.getElementById('editSucursalProvincia').value.trim();
    const nuevoTipo = document.getElementById('editSucursalTipo').value;

    const anterior = state.sucursalesDB[state.sucursalEditandoIndex];
    const eraActiva = state.sucursalSeleccionada && anterior && state.sucursalSeleccionada.nombre === anterior.nombre;

    state.sucursalesDB[state.sucursalEditandoIndex] = {
        nombre: nuevoNombre,
        direccion: nuevaDireccion,
        ciudad: nuevaCiudad,
        provincia: nuevaProvincia,
        tipo: nuevoTipo
    };

    // Si se editó la sucursal actualmente seleccionada para el envío,
    // reflejar los cambios en state.sucursalSeleccionada (que las demás
    // partes del flujo leen tal cual).
    if (eraActiva) state.sucursalSeleccionada = { ...state.sucursalesDB[state.sucursalEditandoIndex] };

    renderSucursalList();
    renderSucursales();              // Fase 4b
    mostrarSucursalSeleccionada();   // -> actualizarPanelEnvioCotizar()
    closeEditSucursalModal();
    guardarEstado();
    mostrarNotificacion('✅ Sucursal actualizada', 'success');
}

export function eliminarSucursal(index) {
    mostrarConfirmacion('¿Eliminar esta sucursal permanentemente?', () => {
        const eliminada = state.sucursalesDB[index];
        state.sucursalesDB.splice(index, 1);
        // Si se eliminó la sucursal elegida para el envío de la cotización
        // en curso, dejar de referenciarla (si no, quedaría un destino
        // "fantasma" en el guardado / la imagen).
        if (eliminada && state.sucursalSeleccionada && state.sucursalSeleccionada.nombre === eliminada.nombre) {
            state.sucursalSeleccionada = null;
            const sel = document.getElementById('sucursalSeleccionada');
            if (sel) sel.style.display = 'none';
        }
        guardarEstado();
        renderSucursalList();
        renderSucursales();             // Fase 4b
        actualizarPanelEnvioCotizar();
        mostrarNotificacion('🗑️ Sucursal eliminada', 'success');
    });
}

// ============================================
// SISTEMA DE SUCURSALES PARA COTIZACIÓN
// ============================================

// Llena el buscador de provincias (datalist) con las provincias
// únicas que ya existen en state.sucursalesDB, ordenadas alfabéticamente.
export function poblarListaProvincias() {
    const datalist = document.getElementById('listaProvincias');
    if (!datalist) return;
    const provincias = [...new Set(state.sucursalesDB.map(s => s.provincia).filter(Boolean))].sort();
    datalist.innerHTML = provincias.map(p => `<option value="${p}"></option>`).join('');
}

export async function generarImagenSucursalesPorProvincia() {
    const input = document.getElementById('provinciaImagenInput');
    const statusEl = document.getElementById('provinciaImagenStatus');
    const textoIngresado = input.value.trim();

    if (!textoIngresado) {
        mostrarNotificacion('⚠️ Escribe o elige una provincia', 'warning');
        return;
    }

    // Coincidencia exacta (sin distinguir mayúsculas/acentos simples)
    // contra las provincias reales, para evitar generar una imagen
    // vacía por un error de tipeo.
    const provinciasDisponibles = [...new Set(state.sucursalesDB.map(s => s.provincia).filter(Boolean))];
    const provinciaReal = provinciasDisponibles.find(p => p.toLowerCase() === textoIngresado.toLowerCase());

    if (!provinciaReal) {
        statusEl.innerHTML = `<span style="color:var(--danger);">No se encontró la provincia "${textoIngresado}". Elige una de la lista.</span>`;
        return;
    }

    const sucursalesFiltradas = state.sucursalesDB.filter(s => s.provincia === provinciaReal);
    if (sucursalesFiltradas.length === 0) {
        statusEl.innerHTML = `<span style="color:var(--danger);">No hay sucursales registradas en "${provinciaReal}".</span>`;
        return;
    }

    statusEl.innerHTML = '<span style="color:var(--text-muted);">Generando imagen…</span>';
    showLoading(true);

    try {
        document.getElementById('spImgProvinciaNombre').textContent = provinciaReal;
        document.getElementById('spImgCantidad').textContent = sucursalesFiltradas.length;
        document.getElementById('spImgFecha').textContent = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

        const iconosPorTipo = {
            'Grande / Co': '🏢', 'Mediana': '🏪', 'Pequeña': '🏠',
            'Terminal': '🚌', 'Micro': '📦', 'Mini-micro': '📦'
        };

        document.getElementById('spImgLista').innerHTML = sucursalesFiltradas
            .sort((a, b) => a.ciudad.localeCompare(b.ciudad) || a.nombre.localeCompare(b.nombre))
            .map(s => `
                <div style="display:flex; gap:14px; align-items:flex-start; padding:14px 16px; background:#f7fafc; border-radius:10px; border:1px solid #e2e8f0;">
                    <div style="font-size:1.5em; line-height:1;">${iconosPorTipo[s.tipo] || '📍'}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; color:var(--primary); font-size:1.05em;">${s.nombre}</div>
                        <div style="color:var(--text-muted); font-size:0.9em; margin-top:2px;">${s.direccion}</div>
                        <div style="color:var(--text-faint); font-size:0.82em; margin-top:2px;">${s.ciudad} · ${s.tipo}</div>
                    </div>
                </div>
            `).join('');

        await new Promise(resolve => setTimeout(resolve, 300));

        const elemento = document.getElementById('sucursalesProvinciaPrint');
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: 1300,
            height: elemento.scrollHeight
        });

        const nombreArchivo = `Sucursales_${provinciaReal.replace(/\s+/g, '_')}_${Date.now()}.png`;
        await descargarOCompartirCanvas(canvas, nombreArchivo);

        statusEl.innerHTML = `<span style="color:var(--success);">✅ Imagen generada: ${sucursalesFiltradas.length} sucursales en ${provinciaReal}</span>`;
        mostrarNotificacion('✅ Imagen de sucursales generada', 'success');
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = `<span style="color:var(--danger);">❌ Error al generar la imagen: ${err.message}</span>`;
        mostrarNotificacion('❌ Error al generar la imagen', 'warning');
    } finally {
        showLoading(false);
    }
}

export function filterByTipo(tipo, e) {
    state.tipoFiltro = tipo;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    renderSucursales();
}

export function renderSucursales() {
    const searchSucursal = document.getElementById('searchSucursal');
    const query = searchSucursal.value.trim().toLowerCase();

    let sucursales = state.sucursalesDB;

    if (state.tipoFiltro !== 'all') {
        sucursales = sucursales.filter(s => s.tipo === state.tipoFiltro);
    }

    if (query.length >= 2) {
        sucursales = sucursales.filter(sucursal =>
            sucursal.nombre.toLowerCase().includes(query) ||
            sucursal.ciudad.toLowerCase().includes(query) ||
            sucursal.provincia.toLowerCase().includes(query) ||
            sucursal.tipo.toLowerCase().includes(query) ||
            sucursal.direccion.toLowerCase().includes(query)
        );
    }

    const grid = document.getElementById('sucursalGrid');

    if (sucursales.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color:var(--text-muted);">No se encontraron sucursales</div>';
        return;
    }

    grid.innerHTML = sucursales.map(sucursal => {
        const selected = state.sucursalSeleccionada && state.sucursalSeleccionada.nombre === sucursal.nombre ? 'selected' : '';
        const realIndex = state.sucursalesDB.findIndex(s => s.nombre === sucursal.nombre);
        return `
            <div class="sucursal-card ${selected}" onclick='seleccionarSucursal(${JSON.stringify(sucursal).replace(/'/g, "&apos;")})'>
                <div class="sucursal-nombre">${sucursal.nombre}</div>
                <div class="sucursal-direccion">📍 ${sucursal.direccion}</div>
                <div class="sucursal-direccion">🏙️ ${sucursal.ciudad}, ${sucursal.provincia}</div>
                <div class="sucursal-card-footer">
                    <span class="sucursal-tipo">${sucursal.tipo}</span>
                    <span class="sucursal-card-actions">
                        <button type="button" class="btn-edit" aria-label="Editar sucursal" onclick="event.stopPropagation(); editarSucursal(${realIndex})">✏️</button>
                        <button type="button" class="btn-remove" aria-label="Eliminar sucursal" onclick="event.stopPropagation(); eliminarSucursal(${realIndex})">🗑️</button>
                    </span>
                </div>
            </div>
        `;
    }).join('');

    updateSucursalStats();
}

export function seleccionarSucursal(sucursal) {
    if (state.sucursalSeleccionada && state.sucursalSeleccionada.nombre === sucursal.nombre) {
        state.sucursalSeleccionada = null;
        document.getElementById('sucursalSeleccionada').style.display = 'none';
        mostrarNotificacion('Sucursal deseleccionada', 'info');
    } else {
        state.sucursalSeleccionada = sucursal;
        mostrarSucursalSeleccionada();
        mostrarNotificacion(`Sucursal seleccionada: ${sucursal.nombre}`, 'success');
    }

    renderSucursales();
    actualizarPanelEnvioCotizar(); // Fase 4d: mantener sincronizada la fila de "Sucursal de envío" en Cotizar
    updateTotal();
    guardarEstado();
}

export function mostrarSucursalSeleccionada() {
    if (state.sucursalSeleccionada) {
        document.getElementById('sucursalSeleccionada').style.display = 'block';
        document.getElementById('sucursalInfo').innerHTML = `
            <strong>${state.sucursalSeleccionada.nombre}</strong> (${state.sucursalSeleccionada.tipo})<br>
            📍 ${state.sucursalSeleccionada.direccion}<br>
            🏙️ ${state.sucursalSeleccionada.ciudad}, ${state.sucursalSeleccionada.provincia}
        `;
    }
    actualizarPanelEnvioCotizar();
}

// ============================================
// FASE 4d — SELECTOR DE SUCURSAL DE ENVÍO EN LA PANTALLA "COTIZAR"
// Fila colapsable (mismo estilo que "Datos del Cliente"). Escribe en
// state.sucursalSeleccionada reutilizando seleccionarSucursal(), así que
// el valor queda disponible para guardado / imagen / Excel igual que si
// se hubiera elegido desde la pestaña Sucursales.
// ============================================

function ocultarSugerenciasEnvio() {
    const dd = document.getElementById('envioSucursalDropdown');
    if (dd) dd.style.display = 'none';
}

function toggleEnvioPanelCotizar() {
    const body = document.getElementById('envioPanelBody');
    const icon = document.getElementById('envioPanelToggleIcon');
    const panel = document.getElementById('envioPanel');
    if (!body) return;
    const abriendo = !body.classList.contains('open');
    body.classList.toggle('open');
    if (icon) icon.classList.toggle('open');
    // El dropdown de sugerencias es position:absolute; el panel tiene
    // overflow:hidden (para las esquinas al colapsar), así que se abre el
    // overflow solo mientras la fila está desplegada.
    if (panel) panel.classList.toggle('envio-panel-open', abriendo);
    if (abriendo) {
        const searchEl = document.getElementById('envioSucursalSearch');
        if (searchEl && state.sucursalSeleccionada && !searchEl.value) {
            searchEl.value = state.sucursalSeleccionada.nombre;
        }
    } else {
        ocultarSugerenciasEnvio();
    }
}

// Sincroniza el encabezado (resumen + badge), la pista y el valor del
// campo cuando cambia state.sucursalSeleccionada (elegida aquí o en la
// pestaña Sucursales).
export function actualizarPanelEnvioCotizar() {
    const resumen = document.getElementById('envioPanelResumen');
    const badge = document.getElementById('envioPanelBadge');
    const hint = document.getElementById('envioSucursalHint');
    const searchEl = document.getElementById('envioSucursalSearch');
    const s = state.sucursalSeleccionada;

    if (resumen && badge) {
        if (s) {
            resumen.innerHTML = `<span>📦 ${s.nombre}</span><span>🏙️ ${s.ciudad}, ${s.provincia}</span>`;
            badge.style.display = 'inline-block';
        } else {
            resumen.innerHTML = '';
            badge.style.display = 'none';
        }
    }
    if (hint) {
        hint.innerHTML = s
            ? `✅ Envío a: <strong>${s.nombre}</strong> — ${s.ciudad}, ${s.provincia}`
            : 'Sin sucursal de envío seleccionada.';
    }
    // Reflejar el nombre elegido en el campo, salvo que el usuario esté
    // escribiendo en él en ese momento.
    if (searchEl && document.activeElement !== searchEl) {
        searchEl.value = s ? s.nombre : '';
    }
}

// Sugerencias en vivo: dropdown flotante (mismo patrón que el buscador de
// productos) filtrado por lo que se va escribiendo. Igual en web y móvil.
export function renderSugerenciasSucursalEnvio() {
    const searchEl = document.getElementById('envioSucursalSearch');
    const dd = document.getElementById('envioSucursalDropdown');
    if (!searchEl || !dd) return;
    const q = searchEl.value.trim().toLowerCase();

    if (q.length < 2) { dd.style.display = 'none'; return; }

    const matches = state.sucursalesDB.filter(s =>
        s.nombre.toLowerCase().includes(q) ||
        (s.ciudad || '').toLowerCase().includes(q) ||
        (s.provincia || '').toLowerCase().includes(q) ||
        (s.direccion || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (matches.length === 0) {
        dd.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted);">${state.sucursalesDB.length === 0 ? 'No hay sucursales registradas todavía.' : 'No se encontraron sucursales'}</div>`;
        dd.style.display = 'block';
        return;
    }

    const activa = state.sucursalSeleccionada ? state.sucursalSeleccionada.nombre : null;
    dd.innerHTML = matches.map(s => {
        const sel = s.nombre === activa;
        return `<div class="autocomplete-item" data-nombre="${encodeURIComponent(s.nombre)}">
            <div class="product-name">${sel ? '✅ ' : ''}${s.nombre}</div>
            <div class="product-prices">📍 ${s.direccion ? s.direccion + ' · ' : ''}${s.ciudad}, ${s.provincia}<span style="margin-left:8px; color:var(--text-faint);">${s.tipo || ''}</span></div>
        </div>`;
    }).join('');
    dd.style.display = 'block';
}

export function initEnvioPanelCotizar() {
    const header = document.getElementById('envioPanelHeader');
    const searchEl = document.getElementById('envioSucursalSearch');
    const dd = document.getElementById('envioSucursalDropdown');
    const container = searchEl ? searchEl.closest('.search-container') : null;
    if (!header) return;

    header.addEventListener('click', toggleEnvioPanelCotizar);

    if (searchEl) {
        searchEl.addEventListener('input', debounce(renderSugerenciasSucursalEnvio, 120));
        searchEl.addEventListener('focus', renderSugerenciasSucursalEnvio);
        searchEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const first = dd && dd.querySelector('.autocomplete-item[data-nombre]');
                if (first) first.click();
            } else if (e.key === 'Escape') {
                ocultarSugerenciasEnvio();
            }
        });
    }
    if (dd) {
        dd.addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item[data-nombre]');
            if (!item) return;
            const nombre = decodeURIComponent(item.dataset.nombre);
            const sucursal = state.sucursalesDB.find(s => s.nombre === nombre);
            ocultarSugerenciasEnvio();
            if (sucursal) seleccionarSucursal(sucursal); // -> actualizarPanelEnvioCotizar()
        });
    }
    // Cerrar el dropdown al hacer click fuera del campo/sugerencias.
    document.addEventListener('click', (e) => {
        if (container && !container.contains(e.target)) ocultarSugerenciasEnvio();
    });

    actualizarPanelEnvioCotizar();
}

export function updateSucursalStats() {
    const stats = document.getElementById('sucursalStats');
    if (stats) {
        const total = state.sucursalesDB.length;
        const filtradas = document.querySelectorAll('.sucursal-card').length;
        stats.innerHTML = `Mostrando ${filtradas} de ${total} sucursales`;
    }
}

export function initSucursalesCrud() {
    document.getElementById('newSucursalForm').addEventListener('submit', agregarNuevaSucursal);
    document.getElementById('searchSucursalGestion').addEventListener('input', renderSucursalList);
    document.getElementById('editSucursalForm').addEventListener('submit', onSubmitEditSucursal);
    document.getElementById('btnCloseEditSucursalModal').addEventListener('click', closeEditSucursalModal);
    document.getElementById('btnCancelarEditSucursal').addEventListener('click', closeEditSucursalModal);
    document.getElementById('searchSucursal').addEventListener('input', renderSucursales);
    document.getElementById('btnGenerarImagenSucursalesProvincia').addEventListener('click', generarImagenSucursalesPorProvincia);
    document.querySelectorAll('.filter-btn[data-tipo]').forEach(btn => {
        btn.addEventListener('click', (e) => filterByTipo(btn.dataset.tipo, e));
    });

    initEnvioPanelCotizar(); // Fase 4d

    window.editarSucursal = editarSucursal;
    window.eliminarSucursal = eliminarSucursal;
    window.seleccionarSucursal = seleccionarSucursal;
}
