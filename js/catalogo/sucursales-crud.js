// Gestión de sucursales (alta/edición/baja) + filtro y mapa por provincia
// para la pestaña de Sucursales dentro de la cotización.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion, showLoading } from '../core/ui-helpers.js';
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

    document.getElementById('newSucursalForm').reset();
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

    state.sucursalesDB[state.sucursalEditandoIndex] = {
        nombre: nuevoNombre,
        direccion: nuevaDireccion,
        ciudad: nuevaCiudad,
        provincia: nuevaProvincia,
        tipo: nuevoTipo
    };

    renderSucursalList();
    closeEditSucursalModal();
    guardarEstado();
    mostrarNotificacion('✅ Sucursal actualizada', 'success');
}

export function eliminarSucursal(index) {
    mostrarConfirmacion('¿Eliminar esta sucursal permanentemente?', () => {
        state.sucursalesDB.splice(index, 1);
        guardarEstado();
        renderSucursalList();
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
        return `
            <div class="sucursal-card ${selected}" onclick='seleccionarSucursal(${JSON.stringify(sucursal).replace(/'/g, "&apos;")})'>
                <div class="sucursal-nombre">${sucursal.nombre}</div>
                <div class="sucursal-direccion">📍 ${sucursal.direccion}</div>
                <div class="sucursal-direccion">🏙️ ${sucursal.ciudad}, ${sucursal.provincia}</div>
                <div class="sucursal-tipo">${sucursal.tipo}</div>
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

function toggleEnvioPanelCotizar() {
    const body = document.getElementById('envioPanelBody');
    const icon = document.getElementById('envioPanelToggleIcon');
    if (!body) return;
    const abriendo = !body.classList.contains('open');
    body.classList.toggle('open');
    if (icon) icon.classList.toggle('open');
    if (abriendo) renderEnvioSucursalList();
}

export function actualizarPanelEnvioCotizar() {
    const resumen = document.getElementById('envioPanelResumen');
    const badge = document.getElementById('envioPanelBadge');
    if (!resumen || !badge) return;
    const s = state.sucursalSeleccionada;
    if (s) {
        resumen.innerHTML = `<span>📦 ${s.nombre}</span><span>🏙️ ${s.ciudad}, ${s.provincia}</span>`;
        badge.style.display = 'inline-block';
    } else {
        resumen.innerHTML = '';
        badge.style.display = 'none';
    }
    // Si la lista está abierta, reflejar cuál fila queda marcada.
    const body = document.getElementById('envioPanelBody');
    if (body && body.classList.contains('open')) renderEnvioSucursalList();
}

export function renderEnvioSucursalList() {
    const cont = document.getElementById('envioSucursalList');
    const searchEl = document.getElementById('envioSucursalSearch');
    if (!cont) return;
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();

    let lista = state.sucursalesDB;
    if (q.length >= 2) {
        lista = lista.filter(s =>
            s.nombre.toLowerCase().includes(q) ||
            s.ciudad.toLowerCase().includes(q) ||
            s.provincia.toLowerCase().includes(q) ||
            (s.direccion || '').toLowerCase().includes(q)
        );
    }

    if (lista.length === 0) {
        cont.innerHTML = `<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.9em;">${state.sucursalesDB.length === 0 ? 'No hay sucursales registradas todavía.' : 'Sin coincidencias.'}</div>`;
        return;
    }

    const activa = state.sucursalSeleccionada ? state.sucursalSeleccionada.nombre : null;
    cont.innerHTML = lista.slice(0, 40).map(s => {
        const sel = s.nombre === activa;
        return `<button type="button" class="envio-suc-row${sel ? ' selected' : ''}" data-nombre="${encodeURIComponent(s.nombre)}">
            <span class="envio-suc-dot${sel ? '' : ' off'}"></span>
            <span class="envio-suc-info">
                <span class="envio-suc-nombre">${s.nombre}</span>
                <span class="envio-suc-meta">${s.direccion ? s.direccion + ' · ' : ''}${s.ciudad}, ${s.provincia}</span>
            </span>
            <span class="envio-suc-check">${sel ? '✓' : ''}</span>
        </button>`;
    }).join('');
}

export function initEnvioPanelCotizar() {
    const header = document.getElementById('envioPanelHeader');
    const searchEl = document.getElementById('envioSucursalSearch');
    const listEl = document.getElementById('envioSucursalList');
    if (!header) return;

    header.addEventListener('click', toggleEnvioPanelCotizar);
    if (searchEl) searchEl.addEventListener('input', renderEnvioSucursalList);
    if (listEl) {
        listEl.addEventListener('click', (e) => {
            const row = e.target.closest('.envio-suc-row');
            if (!row) return;
            const nombre = decodeURIComponent(row.dataset.nombre);
            const sucursal = state.sucursalesDB.find(s => s.nombre === nombre);
            if (sucursal) seleccionarSucursal(sucursal); // ya llama a actualizarPanelEnvioCotizar()
        });
    }
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
