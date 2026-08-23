// Gestión del catálogo de productos: alta/edición/baja y migración a la nube.
import { state } from '../core/state.js';
import { mostrarNotificacion, mostrarConfirmacion, showLoading } from '../core/ui-helpers.js';
import { parseFetch, PRODUCTO_CLASE, PRECIO_VENTA_CLASE, aclEquipo, aclSoloUsuario } from '../core/parseClient.js';
import { obtenerTiersProducto, calcularPrecioConIGV } from '../cotizador/precios.js';
import { renderTable, guardarEstado } from '../cotizador/productos-tabla.js';

// Catálogo de arranque: solo se usa para "sembrar" la nube la primera vez
// (botón "Subir catálogo a la nube"). Una vez migrado, el catálogo real
// vive en Back4App y state.productosDB se llena desde ahí en cada login.
const productosDBSemilla = [
            { codigo: "TOA-001", nombre: "Toalla Cuerpo 120x60 - 380gr", menor: 31.00, mayor: 25.00 },
            { codigo: "TOA-002", nombre: "Toalla Cuerpo 120x60 - 450gr", menor: 35.00, mayor: 29.00 },
            { codigo: "TOA-003", nombre: "Toalla Cuerpo 140x70 - 450gr", menor: 48.00, mayor: 39.00 },
            { codigo: "TOA-004", nombre: "Toalla Cuerpo 140x75 - 560gr", menor: 80.00, mayor: 67.00 },
            { codigo: "TOA-005", nombre: "Toalla Manos 75x40 - 380gr", menor: 17.00, mayor: 13.00 },
            { codigo: "TOA-006", nombre: "Toalla Manos 60x40 - 450gr", menor: 16.00, mayor: 12.00 },
            { codigo: "TOA-007", nombre: "Toalla Cara 30x50 - 400gr", menor: 14.00, mayor: 11.00 },
            { codigo: "SAB-001", nombre: "Juego Sábanas Algodón - 1.5 Plz", menor: 63.00, mayor: 63.00 },
            { codigo: "SAB-002", nombre: "Juego Sábanas Algodón - 2 Plz", menor: 75.00, mayor: 75.00 },
            { codigo: "SAB-003", nombre: "Juego Sábanas Algodón - Queen", menor: 88.00, mayor: 88.00 },
            { codigo: "SAB-004", nombre: "Juego Sábanas Algodón - King", menor: 107.00, mayor: 107.00 },
            { codigo: "SAB-005", nombre: "Juego Sábanas 200 Hilos - 1.5 Plz", menor: 94.00, mayor: 94.00 },
            { codigo: "SAB-006", nombre: "Juego Sábanas 200 Hilos - 2 Plz", menor: 112.00, mayor: 112.00 },
            { codigo: "SAB-007", nombre: "Juego Sábanas 200 Hilos - Queen", menor: 125.00, mayor: 125.00 },
            { codigo: "SAB-008", nombre: "Juego Sábanas 200 Hilos - King", menor: 157.00, mayor: 157.00 },
            { codigo: "DUV-001", nombre: "Duvet Algodón - 1.5 Plz", menor: 72.50, mayor: 72.50 },
            { codigo: "DUV-002", nombre: "Duvet Algodón - 2 Plz", menor: 85.00, mayor: 85.00 },
            { codigo: "DUV-003", nombre: "Duvet Algodón - Queen", menor: 94.00, mayor: 94.33 },
            { codigo: "DUV-004", nombre: "Duvet Algodón - King", menor: 106.00, mayor: 106.00 },
            { codigo: "DUV-005", nombre: "Duvet 200 Hilos - 1.5 Plz", menor: 91.00, mayor: 91.00 },
            { codigo: "DUV-006", nombre: "Duvet 200 Hilos - 2 Plz", menor: 106.00, mayor: 106.00 },
            { codigo: "DUV-007", nombre: "Duvet 200 Hilos - Queen", menor: 119.00, mayor: 119.00 },
            { codigo: "DUV-008", nombre: "Duvet 200 Hilos - King", menor: 131.00, mayor: 131.00 },
            { codigo: "PRO-001", nombre: "Protector Colchón - 1.5 Plz", menor: 81.00, mayor: 81.00 },
            { codigo: "PRO-002", nombre: "Protector Colchón - 2 Plz", menor: 93.00, mayor: 93.00 },
            { codigo: "PRO-003", nombre: "Protector Colchón - Queen", menor: 108.00, mayor: 108.00 },
            { codigo: "PRO-004", nombre: "Protector Colchón - King", menor: 119.00, mayor: 119.00 },
            { codigo: "ALM-001", nombre: "Almohada 60x40 cm", menor: 19.00, mayor: 19.00 },
            { codigo: "FUN-001", nombre: "Funda Almohada Algodón", menor: 9.00, mayor: 9.00 },
            { codigo: "FUN-002", nombre: "Funda Almohada 200 Hilos", menor: 11.00, mayor: 11.00 },
            { codigo: "BAT-001", nombre: "Bata Manga 3/4 - S y M", menor: 64.00, mayor: 64.00 },
            { codigo: "BAT-002", nombre: "Bata Manga 3/4 - L y XL", menor: 74.00, mayor: 74.00 },
            { codigo: "PIS-001", nombre: "Piso para Ducha 50x75 - 560gr", menor: 31.00, mayor: 31.00 },
            { codigo: "MAN-001", nombre: "Manta Felpa Polar - 1.5 Plz", menor: 55.00, mayor: 50.00 },
            { codigo: "MAN-002", nombre: "Manta Felpa Polar - 2.0 Plz", menor: 59.00, mayor: 62.50 },
            { codigo: "MAN-003", nombre: "Frazada de Polar - 1.5 Plz", menor: 50.00, mayor: 50.00 },
            { codigo: "MAN-004", nombre: "Frazada de Polar - 2.0 Plz", menor: 56.00, mayor: 56.00 },
            { codigo: "MAN-005", nombre: "Frazada de Polar - Queen Plz", menor: 63.00, mayor: 63.00 },
            { codigo: "MAN-006", nombre: "Frazada de Polar - King Plz", menor: 75.00, mayor: 75.00 },
            { codigo: "FRA-001", nombre: "Frazada Bandera - 1.5 Plz", menor: 39.00, mayor: 23.00 },
            { codigo: "FRA-002", nombre: "Frazada Bandera - 2.0 Plz", menor: 45.00, mayor: 24.00 },
            { codigo: "P000-76", nombre: "Cubreduvet - Queen - hilos 200", menor: 166.00, mayor: 156.00 },
            { codigo: "P000-51", nombre: "Cubreduvet - King - hilos 200", menor: 178.00, mayor: 168.00 },
            { codigo: "P000-49", nombre: "Cubreduvet - 2.0 Plz - hilos 200", menor: 152.00, mayor: 142.00 },
            { codigo: "P000-48", nombre: "Cubreduvet - 1.5 Plz - hilos 200", menor: 139.00, mayor: 129.00 },
            { codigo: "BOR-001", nombre: "Bordado", menor: 3, mayor: 3 },
            { codigo: "PRM-001", nombre: "Frazada polar 300 gr + Juegos de sabanas 1.5 plz", menor: 99, mayor: 99 },
            { codigo: "PRM-002", nombre: "Frazada polar 300 gr + Juegos de sabanas 2 plz", menor: 109, mayor: 109 },
            { codigo: "PRM-003", nombre: "Frazada polar 300 gr + Juegos de sabanas Queen plz", menor: 139, mayor: 139 },
            { codigo: "PRM-004", nombre: "Frazada polar 300 gr + Juegos de sabanas King", menor: 159, mayor: 159 },
            { codigo: "PRM-005", nombre: "Frazada polar + Juegos de sabanas 1.5 plz 200 H", menor: 144, mayor: 144 },
            { codigo: "PRM-006", nombre: "Frazada polar + Juegos de sabanas 2 plz 200 H", menor: 109, mayor: 109 },
            { codigo: "PRM-007", nombre: "Frazada poLar + Juegos de sabanas Queen 200 H", menor: 139, mayor: 139 },
            { codigo: "PRM-008", nombre: "Frazada polar + Juegos de sabanas King 200 H", menor: 159, mayor: 159 },
            { codigo: "PRM-009", nombre: "Frazada polar + Juegos de sabanas 2 plz 300 HILOS", menor: 347.5, mayor: 347.5 },
            { codigo: "PRM-010", nombre: "Frazada polar + Juegos de sabanas Queen 300 HILOS", menor: 350, mayor: 350 }

        ];

export async function agregarNuevoProducto(event) {
    event.preventDefault();

    const codigo = document.getElementById('newProductCodigo').value.trim();
    const nombre = document.getElementById('newProductNombre').value.trim();
    const costoInput = document.getElementById('newProductCosto').value;
    const costo = costoInput !== '' ? parseFloat(costoInput) : undefined;
    const tiers = leerTiersDesde('newProductTiers');

    if (tiers.length === 0) {
        mostrarNotificacion('⚠️ Agrega al menos un nivel de precio', 'warning');
        return;
    }

    const existe = state.productosDB.find(p => p.codigo === codigo);
    if (existe) {
        mostrarNotificacion('⚠️ El código ya existe', 'warning');
        return;
    }

    try {
        // 1) Producto base — compartido con el equipo (código, nombre, costo)
        const base = await parseFetch(PRODUCTO_CLASE, 'POST', null, {
            codigo, nombre,
            costo: costo !== undefined ? costo : null,
            ACL: aclEquipo()
        });
        // 2) Mi propio precio de venta para ese producto (solo mío)
        await parseFetch(PRECIO_VENTA_CLASE, 'POST', null, {
            codigo,
            productoId: base.objectId,
            tiers,
            ACL: aclSoloUsuario()
        });

        await cargarProductosDesdeNube();
        document.getElementById('newProductForm').reset();
        document.getElementById('newProductTiers').innerHTML = '';
        mostrarNotificacion('✅ Producto agregado correctamente', 'success');
    } catch (err) {
        mostrarNotificacion('❌ Error al guardar: ' + err.message, 'warning');
    }
}

export function renderProductList() {
    const tbody = document.getElementById('productListBody');
    document.getElementById('productCount').textContent = state.productosDB.length;

    const buscadorEl = document.getElementById('buscadorGestionProductos');
    const texto = buscadorEl ? buscadorEl.value.trim().toLowerCase() : '';

    const filas = state.productosDB
        .map((producto, index) => ({ producto, index }))
        .filter(({ producto }) => !texto || producto.codigo.toLowerCase().includes(texto) || producto.nombre.toLowerCase().includes(texto));

    if (texto && filas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-faint); padding:20px;">No se encontró ningún producto con "${texto}"</td></tr>`;
        return;
    }

    tbody.innerHTML = filas.map(({ producto, index }) => {
        const tiers = obtenerTiersProducto(producto);
        const tiersTexto = producto.tengoMiPrecio
            ? tiers.map(t => {
                const precioMostrado = state.mostrarConIGV ? calcularPrecioConIGV(t.precio) : t.precio;
                return `<div style="font-size:0.82em; white-space:nowrap;">${t.etiqueta} (≥${t.cantidadMinima}): <strong>S/ ${precioMostrado.toFixed(2)}</strong></div>`;
              }).join('')
            : `<span style="color:var(--danger); font-size:0.82em; font-weight:600;">⚠️ Configura tu precio</span>`;
        return `
        <tr>
            <td class="codigo-cell">${producto.codigo}</td>
            <td class="producto-cell">${producto.nombre}</td>
            <td class="precio-cell">${tiersTexto}</td>
            <td class="precio-cell">${producto.costo != null ? 'S/ ' + Number(producto.costo).toFixed(2) : '<span style="color:var(--text-faint);">—</span>'}</td>
            <td>
                <button class="btn-edit" aria-label="Editar producto" onclick="editarProducto(${index})">✏️</button>
                <button class="btn-remove" aria-label="Eliminar producto" onclick="eliminarProducto(${index})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

export function editarProducto(index) {
    state.productoEditandoIndex = index;
    const producto = state.productosDB[index];

    document.getElementById('editProductoCodigo').value = producto.codigo;
    document.getElementById('editProductoNombre').value = producto.nombre;
    document.getElementById('editProductoCosto').value = producto.costo != null ? producto.costo : '';

    const contenedorTiers = document.getElementById('editProductoTiers');
    contenedorTiers.innerHTML = '';
    obtenerTiersProducto(producto).forEach(t => {
        crearFilaTier('editProductoTiers', t.etiqueta, t.cantidadMinima, t.precio);
    });

    document.getElementById('editProductoModal').classList.add('active');
}

export function closeEditProductoModal() {
    document.getElementById('editProductoModal').classList.remove('active');
    state.productoEditandoIndex = -1;
}

async function onSubmitEditProducto(e) {
    e.preventDefault();

    if (state.productoEditandoIndex === -1) return;

    const nuevoNombre = document.getElementById('editProductoNombre').value.trim();
    const costoInput = document.getElementById('editProductoCosto').value;
    const nuevoCosto = costoInput !== '' ? parseFloat(costoInput) : undefined;
    const nuevosTiers = leerTiersDesde('editProductoTiers');

    if (!nuevoNombre || nuevosTiers.length === 0) {
        mostrarNotificacion('Completa el nombre y al menos un nivel de precio', 'warning');
        return;
    }
    if (nuevoCosto !== undefined && (isNaN(nuevoCosto) || nuevoCosto < 0)) {
        mostrarNotificacion('El costo debe ser un número válido mayor o igual a 0', 'warning');
        return;
    }

    const producto = state.productosDB[state.productoEditandoIndex];

    try {
        // Nombre y costo son del catálogo BASE (compartido con el equipo)
        await parseFetch(PRODUCTO_CLASE, 'PUT', producto.objectId, {
            nombre: nuevoNombre,
            costo: nuevoCosto !== undefined ? nuevoCosto : null
        });

        // Mis niveles de precio son solo míos — crea mi registro de
        // precio si aún no tenía uno para este producto (caso de un
        // producto que agregó otra persona del equipo), o actualiza
        // el mío si ya existía.
        if (producto.precioVentaObjectId) {
            await parseFetch(PRECIO_VENTA_CLASE, 'PUT', producto.precioVentaObjectId, { tiers: nuevosTiers });
        } else {
            await parseFetch(PRECIO_VENTA_CLASE, 'POST', null, {
                codigo: producto.codigo,
                productoId: producto.objectId,
                tiers: nuevosTiers,
                ACL: aclSoloUsuario()
            });
        }

        // Actualizar en la cotización actual si ese producto ya está agregado
        const enTabla = state.productosEnTabla.find(p => p.codigo === producto.codigo);
        if (enTabla) {
            enTabla.nombre = nuevoNombre;
            enTabla.tiers = nuevosTiers;
            enTabla.costo = nuevoCosto;
            enTabla.menor = nuevosTiers[0].precio;
            enTabla.mayor = nuevosTiers[nuevosTiers.length - 1].precio;
        }

        await cargarProductosDesdeNube();
        renderTable();
        closeEditProductoModal();
        guardarEstado();
        mostrarNotificacion('✅ Producto actualizado', 'success');
    } catch (err) {
        mostrarNotificacion('❌ Error al actualizar: ' + err.message, 'warning');
    }
}

// Elimina TU precio de venta para este producto (no el producto
// base compartido, que puede seguir usando el resto del equipo).
// Si el producto es tuyo y nadie más le puso precio, desaparece
// de tu lista pero sigue existiendo en el catálogo base.
export function eliminarProducto(index) {
    const producto = state.productosDB[index];
    if (producto.precioVentaObjectId) {
        eliminarPrecioVentaNube(producto.precioVentaObjectId);
    } else {
        mostrarNotificacion('Este producto no tiene precio tuyo configurado', 'info');
    }
}

// Trae el catálogo base (compartido) + mis propios precios de
// venta, y arma state.productosDB combinando ambos. Si un producto del
// equipo no tiene precio mío todavía, igual aparece (con tiers
// vacíos) para que lo pueda configurar desde "Editar".
export async function cargarProductosDesdeNube() {
    if (!state.sesionUsuario) return;
    try {
        const [resBase, resPrecios] = await Promise.all([
            parseFetch(PRODUCTO_CLASE, 'GET', null, null, { order: 'nombre', limit: 1000 }),
            parseFetch(PRECIO_VENTA_CLASE, 'GET', null, null, { limit: 1000 })
        ]);
        const base = resBase.results || [];
        const misPrecios = {};
        (resPrecios.results || []).forEach(p => { misPrecios[p.codigo] = p; });

        state.productosDB = base.map(p => {
            const miPrecio = misPrecios[p.codigo];
            const tiers = miPrecio ? [...(miPrecio.tiers || [])].sort((a, b) => a.cantidadMinima - b.cantidadMinima) : [];
            return {
                objectId: p.objectId, // id del producto BASE (compartido)
                precioVentaObjectId: miPrecio ? miPrecio.objectId : null,
                codigo: p.codigo,
                nombre: p.nombre,
                costo: p.costo,
                tiers,
                tengoMiPrecio: !!miPrecio,
                menor: tiers.length > 0 ? tiers[0].precio : 0,
                mayor: tiers.length > 0 ? tiers[tiers.length - 1].precio : 0
            };
        });

        renderProductList();
        renderMigracionCatalogoUI();
    } catch (err) {
        console.error('Error cargando productos:', err);
        mostrarNotificacion('❌ Error al cargar tu catálogo: ' + err.message, 'warning');
    }
}

// Botón de migración: solo aparece si el catálogo en la nube está
// vacío, para subir el catálogo de arranque como punto de partida.
// Es manual a propósito — así nunca duplica productos por accidente.
export function renderMigracionCatalogoUI() {
    const el = document.getElementById('migracionCatalogoAviso');
    if (!el) return;
    el.style.display = state.productosDB.length === 0 ? 'block' : 'none';
}

export function migrarCatalogoALaNube() {
    mostrarConfirmacion(`Esto va a subir ${productosDBSemilla.length} productos de arranque a tu catálogo en la nube. ¿Continuar?`, async () => {
        showLoading(true);
        try {
            for (const p of productosDBSemilla) {
                const base = await parseFetch(PRODUCTO_CLASE, 'POST', null, {
                    codigo: p.codigo,
                    nombre: p.nombre,
                    costo: null,
                    ACL: aclEquipo()
                });
                await parseFetch(PRECIO_VENTA_CLASE, 'POST', null, {
                    codigo: p.codigo,
                    productoId: base.objectId,
                    tiers: [
                        { etiqueta: 'Por menor', cantidadMinima: 1, precio: p.menor },
                        { etiqueta: 'Por mayor', cantidadMinima: 6, precio: p.mayor }
                    ],
                    ACL: aclSoloUsuario()
                });
            }
            await cargarProductosDesdeNube();
            mostrarNotificacion('✅ Catálogo subido a la nube', 'success');
        } catch (err) {
            mostrarNotificacion('❌ Error al migrar: ' + err.message, 'warning');
        } finally {
            showLoading(false);
        }
    }, { textoAceptar: 'Sí, subir' });
}

// ---------- Filas dinámicas de niveles de precio (usado en el
// formulario de nuevo producto y en el modal de edición) ----------

export function crearFilaTier(contenedorId, etiqueta = '', cantidadMinima = '', precio = '') {
    const contenedor = document.getElementById(contenedorId);
    const fila = document.createElement('div');
    fila.className = 'tier-row';
    fila.innerHTML = `
        <input type="text" class="form-input tier-etiqueta" placeholder="Ej: Docena" value="${etiqueta}">
        <input type="number" class="form-input tier-cantidad" placeholder="Cant. mín." min="1" value="${cantidadMinima}">
        <input type="number" class="form-input tier-precio" placeholder="Precio S/" min="0" step="0.01" value="${precio}">
        <button type="button" class="tier-del-btn" aria-label="Quitar nivel de precio" onclick="this.parentElement.remove()">✕</button>
    `;
    contenedor.appendChild(fila);
}

export function leerTiersDesde(contenedorId) {
    const filas = document.querySelectorAll(`#${contenedorId} .tier-row`);
    const tiers = [];
    filas.forEach(fila => {
        const etiqueta = fila.querySelector('.tier-etiqueta').value.trim();
        const cantidadMinima = parseInt(fila.querySelector('.tier-cantidad').value);
        const precio = parseFloat(fila.querySelector('.tier-precio').value);
        if (etiqueta && cantidadMinima > 0 && precio >= 0) {
            tiers.push({ etiqueta, cantidadMinima, precio });
        }
    });
    return tiers.sort((a, b) => a.cantidadMinima - b.cantidadMinima);
}

export function eliminarPrecioVentaNube(objectId) {
    mostrarConfirmacion('¿Quitar tu precio de venta para este producto? (el producto sigue disponible para el resto del equipo)', async () => {
        try {
            await parseFetch(PRECIO_VENTA_CLASE, 'DELETE', objectId);
            await cargarProductosDesdeNube();
            mostrarNotificacion('🗑️ Tu precio fue eliminado', 'success');
        } catch (err) {
            mostrarNotificacion('❌ Error al eliminar: ' + err.message, 'warning');
        }
    }, { textoAceptar: 'Sí, quitar' });
}

export function initProductosCrud() {
    document.getElementById('newProductForm').addEventListener('submit', agregarNuevoProducto);
    document.getElementById('editProductoForm').addEventListener('submit', onSubmitEditProducto);
    document.getElementById('btnCloseEditProductoModal').addEventListener('click', closeEditProductoModal);
    document.getElementById('btnCancelarEditProducto').addEventListener('click', closeEditProductoModal);
    document.getElementById('btnMigrarCatalogo').addEventListener('click', migrarCatalogoALaNube);
    document.getElementById('btnAgregarTierEditProducto').addEventListener('click', () => crearFilaTier('editProductoTiers'));
    document.getElementById('btnAgregarTierNewProduct').addEventListener('click', () => crearFilaTier('newProductTiers'));
    const buscador = document.getElementById('buscadorGestionProductos');
    if (buscador) buscador.addEventListener('input', renderProductList);

    window.editarProducto = editarProducto;
    window.eliminarProducto = eliminarProducto;
}
