// Cliente genérico para la API REST de Parse/Back4App, y las constantes de
// clase que antes vivían sueltas cerca de donde se usaba cada una.
import { state } from './state.js';

export const PARSE_URL = 'https://parseapi.back4app.com';

export const CONTADOR_CLASE = 'Contador';
export const PRODUCTO_CLASE = 'Producto';
export const PRECIO_VENTA_CLASE = 'PrecioVenta';
export const COTIZACION_CLASE = 'Cotizacion';
export const SHALOM_CLASE = 'EnvioShalom';

// Envoltorio genérico para la API REST de Parse/Back4App (cualquier clase).
export async function parseFetch(clase, metodo, objectId, body, query) {
    let url = `${PARSE_URL}/classes/${clase}`;
    if (objectId) url += `/${objectId}`;

    if (metodo === 'GET' && query) {
        const params = new URLSearchParams();
        if (query.where) params.set('where', JSON.stringify(query.where));
        if (query.order) params.set('order', query.order);
        if (query.limit) params.set('limit', query.limit);
        url += `?${params.toString()}`;
    }

    const headers = {
        'X-Parse-Application-Id': state.cloudConfig.appId,
        'X-Parse-JavaScript-Key': state.cloudConfig.jsKey,
        'Content-Type': 'application/json'
    };
    if (state.sesionUsuario && state.sesionUsuario.sessionToken) {
        headers['X-Parse-Session-Token'] = state.sesionUsuario.sessionToken;
    }

    const res = await fetch(url, {
        method: metodo,
        headers,
        body: (metodo === 'POST' || metodo === 'PUT') ? JSON.stringify(body || {}) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error((data && data.error) || `Error Back4App (${res.status})`);
    }
    return data;
}

// El dueño del registro siempre puede leer/escribir el suyo, y el
// rol "Admin" (configurado una vez en Back4App) puede leer/escribir
// TODO — así el administrador ve las cotizaciones y envíos de
// todos los usuarios, y cada usuario normal solo ve los suyos.
export function aclSoloUsuario() {
    if (!state.sesionUsuario) return undefined;
    return {
        [state.sesionUsuario.userId]: { read: true, write: true },
        'role:Admin': { read: true, write: true }
    };
}

// ACL del catálogo BASE (compartido): todo el equipo puede leer y
// escribir código/nombre/costo. Requiere el Role "Equipo" en
// Back4App (ver instrucciones) — si no existe, cae a solo-yo.
export function aclEquipo() {
    if (!state.sesionUsuario) return undefined;
    return {
        [state.sesionUsuario.userId]: { read: true, write: true },
        'role:Admin': { read: true, write: true },
        'role:Equipo': { read: true, write: true }
    };
}
