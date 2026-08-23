// Contadores COT/OC (numeración consecutiva, en vivo).
// Cotización y Orden de compra tienen cada una su propio contador,
// compartido por todo el equipo (clase Contador en Back4App). Se
// incrementa de forma atómica (operación "Increment" de Parse) para
// evitar números repetidos aunque dos personas guarden a la vez.
import { state } from '../core/state.js';
import { mostrarNotificacion } from '../core/ui-helpers.js';
import { parseFetch, CONTADOR_CLASE } from '../core/parseClient.js';

export async function obtenerOCrearContador(tipo) {
    if (state.contadorObjectIds[tipo]) return state.contadorObjectIds[tipo];

    const existentes = await parseFetch(CONTADOR_CLASE, 'GET', null, null, { where: { tipo }, limit: 1 });
    if (existentes.results && existentes.results.length > 0) {
        state.contadorObjectIds[tipo] = existentes.results[0].objectId;
        return state.contadorObjectIds[tipo];
    }

    const creado = await parseFetch(CONTADOR_CLASE, 'POST', null, {
        tipo, valor: 0,
        ACL: { 'role:Admin': { read: true, write: true } }
    });
    state.contadorObjectIds[tipo] = creado.objectId;
    return creado.objectId;
}

// Incrementa el contador y devuelve el número asignado, ya
// formateado (ej. "COT-000123" / "OC-000045").
export async function siguienteCorrelativo(tipo) {
    const prefijos = { cotizacion: 'COT', orden_compra: 'OC' };
    try {
        const objectId = await obtenerOCrearContador(tipo);
        await parseFetch(CONTADOR_CLASE, 'PUT', objectId, {
            valor: { __op: 'Increment', amount: 1 }
        });
        const actualizado = await parseFetch(CONTADOR_CLASE, 'GET', objectId);
        const numero = actualizado.valor || 1;
        cargarCorrelativoHeaderInfo(); // el "próximo N°" del header queda desactualizado tras asignar este — se refresca solo
        return `${prefijos[tipo]}-${String(numero).padStart(6, '0')}`;
    } catch (err) {
        console.error('Error obteniendo correlativo:', err);
        return null; // si falla, la cotización se guarda igual, solo sin número
    }
}

// Badge del header (arriba a la izquierda) con el próximo N° que
// se asignará a la siguiente cotización y a la siguiente orden de
// compra. Es de solo lectura — solo consulta el contador, nunca
// lo incrementa (eso solo lo hace siguienteCorrelativo() al
// guardar de verdad), así que no compromete la numeración.
export async function cargarCorrelativoHeaderInfo() {
    const el = document.getElementById('correlativoHeaderInfo');
    if (!el || !state.sesionUsuario) return;
    try {
        const resultado = await parseFetch(CONTADOR_CLASE, 'GET', null, null, {});
        const filas = resultado.results || [];
        const cot = filas.find(f => f.tipo === 'cotizacion');
        const oc = filas.find(f => f.tipo === 'orden_compra');
        const proximaCot = String((cot ? cot.valor : 0) + 1).padStart(6, '0');
        const proximaOc = String((oc ? oc.valor : 0) + 1).padStart(6, '0');
        el.innerHTML = `🔖 Próximo N°: <strong>COT-${proximaCot}</strong> · <strong>OC-${proximaOc}</strong>`;
    } catch (err) {
        el.style.display = 'none';
        console.error('No se pudo cargar el correlativo del header:', err.message);
    }
}

// ---------- Panel de administración de correlativos (⚙️ Cuenta) ----------

export async function cargarCorrelativosUI() {
    const panel = document.getElementById('correlativosPanel');
    if (!panel) return;
    try {
        const resultado = await parseFetch(CONTADOR_CLASE, 'GET', null, null, {});
        const filas = resultado.results || [];
        const cot = filas.find(f => f.tipo === 'cotizacion');
        const oc = filas.find(f => f.tipo === 'orden_compra');
        document.getElementById('correlativoCotInput').value = cot ? cot.valor : 0;
        document.getElementById('correlativoOcInput').value = oc ? oc.valor : 0;
        panel.style.display = 'block';
    } catch (err) {
        panel.style.display = 'none';
    }
}

export async function guardarCorrelativoManual(tipo, inputId) {
    const nuevoValor = parseInt(document.getElementById(inputId).value);
    if (isNaN(nuevoValor) || nuevoValor < 0) {
        mostrarNotificacion('⚠️ Ingresa un número válido', 'warning');
        return;
    }
    try {
        const objectId = await obtenerOCrearContador(tipo);
        await parseFetch(CONTADOR_CLASE, 'PUT', objectId, { valor: nuevoValor });
        mostrarNotificacion('✅ Correlativo actualizado', 'success');
        cargarCorrelativoHeaderInfo();
    } catch (err) {
        mostrarNotificacion('❌ Error al actualizar (¿tienes rol Admin?): ' + err.message, 'warning');
    }
}

export function initCorrelativos() {
    document.getElementById('btnGuardarCorrelativoCot').addEventListener('click', () => guardarCorrelativoManual('cotizacion', 'correlativoCotInput'));
    document.getElementById('btnGuardarCorrelativoOc').addEventListener('click', () => guardarCorrelativoManual('orden_compra', 'correlativoOcInput'));
}
