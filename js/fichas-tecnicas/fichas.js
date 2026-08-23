// Generación de fichas técnicas (formulario editable → vista previa → PDF).
import { state } from '../core/state.js';
import { mostrarNotificacion, showLoading } from '../core/ui-helpers.js';
import { descargarOCompartirPDF } from '../cotizador/export.js';

// Cargar productos en selector
export function cargarProductosSelectorFicha() {
    const select = document.getElementById('fichaProductoSelect');
    select.innerHTML = '<option value="">Selecciona un producto...</option>' +
        state.productosDB.map((p, i) => `<option value="${i}">${p.codigo} - ${p.nombre}</option>`).join('');
}

export function cargarProductoFicha(index) {
    if (index === '') {
        document.getElementById('fichaFormSection').style.display = 'none';
        return;
    }

    const producto = state.productosDB[index];
    document.getElementById('fichaCodigo').value = producto.codigo;
    document.getElementById('fichaNombre').value = producto.nombre;
    document.getElementById('fichaFormSection').style.display = 'block';

    // Autocompletar valores por defecto
    document.getElementById('fichaMarca').value = 'Línea Hotelera';
    document.getElementById('fichaPais').value = 'Perú';
}

export function mostrarVistaPrevia() {
    const preview = document.getElementById('fichaPreview');
    const html = generarHTMLFicha();
    preview.innerHTML = html;
}

export function generarHTMLFicha() {
    const data = {
        codigo: document.getElementById('fichaCodigo').value,
        nombre: document.getElementById('fichaNombre').value,
        marca: document.getElementById('fichaMarca').value || 'Línea Hotelera',
        pais: document.getElementById('fichaPais').value || 'Perú',
        composicion: document.getElementById('fichaComposicion').value,
        gramaje: document.getElementById('fichaGramaje').value,
        dimensiones: document.getElementById('fichaDimensiones').value,
        peso: document.getElementById('fichaPeso').value,
        color: document.getElementById('fichaColor').value,
        acabado: document.getElementById('fichaAcabado').value,
        caracteristicas: document.getElementById('fichaCaracteristicas').value,
        lavado: document.getElementById('fichaLavado').value,
        uso: document.getElementById('fichaUso').value,
        garantia: document.getElementById('fichaGarantia').value,
        certificaciones: document.getElementById('fichaCertificaciones').value,
        notas: document.getElementById('fichaNotas').value
    };

    return `
        <div class="ficha-section">
            <h3>📋 Información General</h3>
            <div class="ficha-grid">
                <div class="ficha-item">
                    <div class="ficha-item-label">Código</div>
                    <div class="ficha-item-value">${data.codigo || '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Marca</div>
                    <div class="ficha-item-value">${data.marca || '-'}</div>
                </div>
                <div class="ficha-item" style="grid-column: 1/-1;">
                    <div class="ficha-item-label">Producto</div>
                    <div class="ficha-item-value" style="font-size: 1.2em; font-weight: 600;">${data.nombre || '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">País de Origen</div>
                    <div class="ficha-item-value">${data.pais || '-'}</div>
                </div>
            </div>
        </div>

        <div class="ficha-section">
            <h3>🔧 Especificaciones Técnicas</h3>
            <div class="ficha-grid">
                <div class="ficha-item">
                    <div class="ficha-item-label">Composición</div>
                    <div class="ficha-item-value">${data.composicion || '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Gramaje</div>
                    <div class="ficha-item-value">${data.gramaje ? data.gramaje + ' gr/m²' : '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Dimensiones</div>
                    <div class="ficha-item-value">${data.dimensiones || '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Peso</div>
                    <div class="ficha-item-value">${data.peso ? data.peso + ' kg' : '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Color(es)</div>
                    <div class="ficha-item-value">${data.color || '-'}</div>
                </div>
                <div class="ficha-item">
                    <div class="ficha-item-label">Acabado</div>
                    <div class="ficha-item-value">${data.acabado || '-'}</div>
                </div>
            </div>
        </div>

        ${data.caracteristicas ? `
        <div class="ficha-section">
            <h3>⭐ Características</h3>
            <div class="ficha-item">
                <div style="white-space: pre-line; line-height: 1.8;">${data.caracteristicas}</div>
            </div>
        </div>
        ` : ''}

        ${data.lavado ? `
        <div class="ficha-section">
            <h3>🧼 Instrucciones de Cuidado</h3>
            <div class="ficha-item">
                <div style="white-space: pre-line; line-height: 1.8;">${data.lavado}</div>
            </div>
        </div>
        ` : ''}

        ${data.uso ? `
        <div class="ficha-section">
            <h3>🏨 Uso y Aplicaciones</h3>
            <div class="ficha-item">
                <div style="white-space: pre-line; line-height: 1.8;">${data.uso}</div>
            </div>
        </div>
        ` : ''}

        <div class="ficha-section">
            <h3>📋 Información Adicional</h3>
            <div class="ficha-grid">
                ${data.garantia ? `
                <div class="ficha-item">
                    <div class="ficha-item-label">Garantía</div>
                    <div class="ficha-item-value">${data.garantia}</div>
                </div>
                ` : ''}
                ${data.certificaciones ? `
                <div class="ficha-item">
                    <div class="ficha-item-label">Certificaciones</div>
                    <div class="ficha-item-value">${data.certificaciones}</div>
                </div>
                ` : ''}
                ${data.notas ? `
                <div class="ficha-item" style="grid-column: 1/-1;">
                    <div class="ficha-item-label">Notas</div>
                    <div class="ficha-item-value" style="white-space: pre-line;">${data.notas}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

export async function generarFichaPDF() {
    const codigo = document.getElementById('fichaCodigo').value;
    const nombre = document.getElementById('fichaNombre').value;

    if (!codigo || !nombre) {
        mostrarNotificacion('⚠️ Selecciona un producto primero', 'warning');
        return;
    }

    showLoading(true);

    try {
        // Preparar fecha
        const fecha = new Date();
        const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('fichaPrintFecha').textContent = fecha.toLocaleDateString('es-PE', opciones);

        // Generar contenido
        document.getElementById('fichaPrintContent').innerHTML = generarHTMLFicha();

        await new Promise(resolve => setTimeout(resolve, 500));

        const element = document.getElementById('fichaPrint');

        const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: 900,
            height: element.scrollHeight
        });

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        await descargarOCompartirPDF(pdf, `FichaTecnica_${codigo}_${Date.now()}.pdf`);

        showLoading(false);
        mostrarNotificacion('✅ Ficha técnica generada exitosamente', 'success');
    } catch (error) {
        console.error('Error:', error);
        showLoading(false);
        mostrarNotificacion('❌ Error al generar ficha técnica', 'error');
    }
}

export function initFichas() {
    document.getElementById('fichaProductoSelect').addEventListener('change', function () {
        cargarProductoFicha(this.value);
    });
    document.getElementById('btnMostrarVistaPreviaFicha').addEventListener('click', mostrarVistaPrevia);
    document.getElementById('btnGenerarFichaPDF').addEventListener('click', generarFichaPDF);
}
