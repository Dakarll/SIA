// Panel de datos de cliente y base de datos local de clientes.
import { mostrarNotificacion } from '../core/ui-helpers.js';

export function toggleClientePanel() {
    const body = document.getElementById('clientePanelBody');
    const icon = document.getElementById('clienteToggleIcon');
    body.classList.toggle('open');
    icon.classList.toggle('open');
}

export function actualizarResumenCliente() {
    const nombre = document.getElementById('clienteNombre').value.trim();
    const empresa = document.getElementById('clienteEmpresa').value.trim();
    const tel = document.getElementById('clienteTelefono').value.trim();
    const ruc = document.getElementById('clienteRUC').value.trim();

    const resumen = document.getElementById('clienteResumen');
    const badge = document.getElementById('clienteBadge');

    let parts = [];
    if (nombre) parts.push(`👤 ${nombre}`);
    if (empresa) parts.push(`🏢 ${empresa}`);
    if (tel) parts.push(`📞 ${tel}`);
    if (ruc) parts.push(`📄 ${ruc}`);

    if (parts.length > 0) {
        resumen.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
        badge.style.display = 'inline-block';
    } else {
        resumen.innerHTML = '';
        badge.style.display = 'none';
    }
}

export function getClienteData() {
    return {
        nombre: document.getElementById('clienteNombre').value.trim(),
        empresa: document.getElementById('clienteEmpresa').value.trim(),
        ruc: document.getElementById('clienteRUC').value.trim(),
        telefono: document.getElementById('clienteTelefono').value.trim(),
        email: document.getElementById('clienteEmail').value.trim(),
        direccion: document.getElementById('clienteDireccion').value.trim(),
        notas: document.getElementById('clienteNotas').value.trim()
    };
}

// ============================================
// BASE DE DATOS DE CLIENTES
// ============================================

export function getClientesDB() {
    try { return JSON.parse(localStorage.getItem('clientes_lh_db') || '[]'); }
    catch (e) { return []; }
}

export function guardarClienteDB() {
    const cliente = getClienteData();
    if (!cliente.nombre) { mostrarNotificacion('Ingresa al menos el nombre del cliente', 'warning'); return; }
    const clientes = getClientesDB();
    // Actualizar si ya existe por nombre+empresa
    const idx = clientes.findIndex(c => c.nombre.toLowerCase() === cliente.nombre.toLowerCase() && c.empresa === cliente.empresa);
    if (idx >= 0) {
        clientes[idx] = { ...cliente, updatedAt: new Date().toISOString() };
        mostrarNotificacion('✅ Cliente actualizado en base de datos', 'success');
    } else {
        clientes.unshift({ ...cliente, createdAt: new Date().toISOString() });
        mostrarNotificacion('✅ Cliente guardado en base de datos', 'success');
    }
    if (clientes.length > 200) clientes.pop();
    localStorage.setItem('clientes_lh_db', JSON.stringify(clientes));
}

export function buscarClienteDB(query) {
    const dropdown = document.getElementById('clienteDBDropdown');
    if (!query || query.length < 2) { dropdown.classList.remove('visible'); return; }
    const clientes = getClientesDB();
    const q = query.toLowerCase();
    const matches = clientes.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.empresa || '').toLowerCase().includes(q) ||
        (c.ruc || '').includes(q)
    ).slice(0, 6);

    if (matches.length === 0) { dropdown.classList.remove('visible'); return; }

    dropdown.innerHTML = matches.map((c, i) => `
        <div class="cliente-db-item" onclick="cargarClienteDB(${clientes.indexOf(c)})">
            <div class="cliente-db-item-name">${c.nombre}</div>
            <div class="cliente-db-item-sub">${[c.empresa, c.telefono, c.ruc].filter(Boolean).join(' · ')}</div>
        </div>
    `).join('');
    dropdown.classList.add('visible');
}

export function cargarClienteDB(index) {
    const clientes = getClientesDB();
    const c = clientes[index];
    if (!c) return;
    document.getElementById('clienteNombre').value = c.nombre || '';
    document.getElementById('clienteEmpresa').value = c.empresa || '';
    document.getElementById('clienteRUC').value = c.ruc || '';
    document.getElementById('clienteTelefono').value = c.telefono || '';
    document.getElementById('clienteEmail').value = c.email || '';
    document.getElementById('clienteDireccion').value = c.direccion || '';
    document.getElementById('clienteNotas').value = c.notas || '';
    document.getElementById('clienteDBDropdown').classList.remove('visible');
    actualizarResumenCliente();
    mostrarNotificacion(`👤 ${c.nombre} cargado`, 'success');
}

// Cerrar dropdown de clientes al click fuera
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('clienteDBDropdown');
    const input = document.getElementById('clienteNombre');
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.classList.remove('visible');
    }
});

export function initCliente() {
    document.getElementById('clientePanelHeader').addEventListener('click', toggleClientePanel);
    document.getElementById('clienteNombre').addEventListener('input', function () {
        actualizarResumenCliente();
        buscarClienteDB(this.value);
    });
    ['clienteEmpresa', 'clienteRUC', 'clienteTelefono', 'clienteEmail', 'clienteDireccion', 'clienteNotas'].forEach(id => {
        document.getElementById(id).addEventListener('input', actualizarResumenCliente);
    });
    document.getElementById('btnGuardarClienteDB').addEventListener('click', guardarClienteDB);

    window.cargarClienteDB = cargarClienteDB;
}
