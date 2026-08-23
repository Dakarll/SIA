// Dashboard: KPIs y gráficos (Chart.js) de cotizaciones confirmadas
// (marcadas como "Orden de compra"), por rango de fecha.
import { state } from '../core/state.js';
import { mostrarNotificacion, prefiereMovimientoReducido } from '../core/ui-helpers.js';
import { parseFetch, COTIZACION_CLASE } from '../core/parseClient.js';

export function calcularFechasRango(rango) {
    const ahora = new Date();
    let desde, hasta;

    if (rango === 'mes') {
        desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        hasta = ahora;
    } else if (rango === '3m') {
        desde = new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1);
        hasta = ahora;
    } else if (rango === 'anio') {
        desde = new Date(ahora.getFullYear(), 0, 1);
        hasta = ahora;
    } else if (rango === 'todo') {
        desde = new Date(2000, 0, 1);
        hasta = ahora;
    } else { // custom
        const desdeInput = document.getElementById('dashDesde').value;
        const hastaInput = document.getElementById('dashHasta').value;
        desde = desdeInput ? new Date(desdeInput + 'T00:00:00') : new Date(2000, 0, 1);
        hasta = hastaInput ? new Date(hastaInput + 'T23:59:59') : ahora;
    }
    return { desde, hasta };
}

export function cambiarRangoDashboard(rango) {
    state.dashRango = rango;
    document.querySelectorAll('.dash-range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.rango === rango);
    });
    cargarDashboard();
}

// Cuenta animada de 0 al valor final — el toque "vivo" tipo Power BI.
export function animarNumero(elId, valorFinal, prefijo = '', decimales = 0) {
    const el = document.getElementById(elId);
    if (!el) return;
    const duracion = 700;
    const inicio = performance.now();

    function paso(ahora) {
        const progreso = Math.min((ahora - inicio) / duracion, 1);
        const suavizado = 1 - Math.pow(1 - progreso, 3); // ease-out
        const valorActual = valorFinal * suavizado;
        el.textContent = prefijo + valorActual.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
        if (progreso < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
}

export async function cargarDashboard() {
    if (!state.sesionUsuario) return;

    try {
        // Traemos hasta 1000 cotizaciones (de sobra para un negocio
        // de este tamaño); el ACL ya filtra automáticamente según
        // si el usuario es admin o no.
        const resultado = await parseFetch(COTIZACION_CLASE, 'GET', null, null, { order: '-createdAt', limit: 1000 });
        const todas = resultado.results || [];

        // El Dashboard mide negocio real: solo cuenta las que se
        // marcaron como "Orden de compra" (venta confirmada), no
        // toda cotización que se generó sin concretarse.
        const confirmadas = todas.filter(c => c.estado === 'orden_compra');

        const { desde, hasta } = calcularFechasRango(state.dashRango);
        const filtradas = confirmadas.filter(c => {
            const f = new Date(c.createdAt);
            return f >= desde && f <= hasta;
        });

        const vacioEl = document.getElementById('dashVacio');
        vacioEl.style.display = filtradas.length === 0 ? 'block' : 'none';
        if (filtradas.length === 0 && todas.length > 0) {
            vacioEl.innerHTML = 'No hay <strong>órdenes de compra confirmadas</strong> en este rango.<br><br>Recuerda: el Dashboard solo cuenta cotizaciones marcadas como "✅ Marcar venta" en el Historial — las cotizaciones sin confirmar no se contabilizan aquí.';
        }

        // ---- KPIs ----
        const totalCotizaciones = filtradas.length;
        const montoTotal = filtradas.reduce((a, c) => a + (c.total || 0), 0);
        const ticketProm = totalCotizaciones > 0 ? montoTotal / totalCotizaciones : 0;
        const conGanancia = filtradas.filter(c => c.ganancia !== null && c.ganancia !== undefined);
        const gananciaTotal = conGanancia.reduce((a, c) => a + c.ganancia, 0);

        const porDepto = {};
        filtradas.forEach(c => {
            const depto = c.provincia || 'Sin especificar';
            porDepto[depto] = (porDepto[depto] || 0) + 1;
        });
        const deptoTopEntry = Object.entries(porDepto).sort((a, b) => b[1] - a[1])[0];
        const deptoTop = deptoTopEntry ? `${deptoTopEntry[0]} (${deptoTopEntry[1]})` : '—';

        animarNumero('kpiCotizaciones', totalCotizaciones);
        animarNumero('kpiMontoTotal', montoTotal, 'S/ ', 2);
        animarNumero('kpiTicketProm', ticketProm, 'S/ ', 2);
        document.getElementById('kpiGananciaWrap').style.display = conGanancia.length > 0 ? 'block' : 'none';
        if (conGanancia.length > 0) {
            animarNumero('kpiGanancia', gananciaTotal, 'S/ ', 2);
            document.getElementById('kpiGananciaNota').textContent = conGanancia.length < totalCotizaciones
                ? `Basado en ${conGanancia.length} de ${totalCotizaciones} órdenes (con costo registrado)`
                : 'Ganancia estimada sobre todas las órdenes del período';
        }
        document.getElementById('kpiDeptoTop').textContent = deptoTop;

        // ---- Gráfico: cotizaciones por departamento ----
        const deptosOrdenados = Object.entries(porDepto).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const coloresPaleta = ['#667eea', '#764ba2', '#38a169', '#3182ce', '#ed8936', '#e53e3e', '#805ad5', '#0d9488'];

        const ctxDepto = document.getElementById('chartDepartamentos').getContext('2d');
        if (state.chartDepartamentosInstancia) state.chartDepartamentosInstancia.destroy();
        state.chartDepartamentosInstancia = new Chart(ctxDepto, {
            type: 'bar',
            data: {
                labels: deptosOrdenados.map(d => d[0]),
                datasets: [{
                    data: deptosOrdenados.map(d => d[1]),
                    backgroundColor: deptosOrdenados.map((_, i) => coloresPaleta[i % coloresPaleta.length]),
                    borderRadius: 8,
                    maxBarThickness: 40
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: prefiereMovimientoReducido() ? 0 : 800, easing: 'easeOutQuart' },
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(128,128,128,0.1)' } },
                    y: { grid: { display: false } }
                }
            }
        });

        // ---- Gráfico: tendencia en el tiempo ----
        // La granularidad se adapta al rango elegido: si el rango es
        // corto (p.ej. "Este mes"), agrupar por MES colapsa todo en
        // un solo punto (justamente el bug reportado: con pocos días
        // de uso, todas las ventas caen en el mismo mes y el
        // gráfico "no funciona" — muestra un único punto). Por eso
        // agrupamos por DÍA cuando el rango cubre pocas semanas, por
        // SEMANA cuando cubre varios meses, y por MES solo cuando el
        // rango es amplio (año completo o "todo").
        const spanMs = hasta - desde;
        const spanDias = Math.max(1, Math.ceil(spanMs / (1000 * 60 * 60 * 24)));
        const granularidad = spanDias <= 45 ? 'dia' : (spanDias <= 130 ? 'semana' : 'mes');

        function claveYEtiqueta(fecha) {
            if (granularidad === 'dia') {
                const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
                const orden = fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();
                const etiqueta = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
                return { clave, orden, etiqueta };
            }
            if (granularidad === 'semana') {
                // Semana ISO simplificada: lunes como inicio de semana
                const d = new Date(fecha);
                const dow = (d.getDay() + 6) % 7; // 0 = lunes
                d.setDate(d.getDate() - dow);
                const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const orden = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
                const etiqueta = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
                return { clave, orden, etiqueta: `Sem. ${etiqueta}` };
            }
            // mes
            const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
            const orden = fecha.getFullYear() * 100 + (fecha.getMonth() + 1);
            const etiqueta = fecha.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
            return { clave, orden, etiqueta };
        }

        const porPeriodo = {};
        filtradas.forEach(c => {
            const f = new Date(c.createdAt);
            const { clave, orden, etiqueta } = claveYEtiqueta(f);
            if (!porPeriodo[clave]) porPeriodo[clave] = { cantidad: 0, monto: 0, orden, etiqueta };
            porPeriodo[clave].cantidad++;
            porPeriodo[clave].monto += (c.total || 0);
        });
        const clavesOrdenadas = Object.keys(porPeriodo).sort((a, b) => porPeriodo[a].orden - porPeriodo[b].orden);
        const nombresPeriodo = clavesOrdenadas.map(k => porPeriodo[k].etiqueta);

        const ctxTend = document.getElementById('chartTendencia').getContext('2d');
        if (state.chartTendenciaInstancia) state.chartTendenciaInstancia.destroy();
        state.chartTendenciaInstancia = new Chart(ctxTend, {
            type: 'line',
            data: {
                labels: nombresPeriodo,
                datasets: [{
                    label: 'Monto vendido (S/)',
                    data: clavesOrdenadas.map(k => porPeriodo[k].monto),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.15)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: clavesOrdenadas.length > 1 ? 4 : 6,
                    pointBackgroundColor: '#667eea'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: prefiereMovimientoReducido() ? 0 : 900, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const k = clavesOrdenadas[items[0].dataIndex];
                                return granularidad === 'dia' ? `Día: ${porPeriodo[k].etiqueta}` : (granularidad === 'semana' ? `Semana del ${porPeriodo[k].etiqueta.replace('Sem. ', '')}` : porPeriodo[k].etiqueta);
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error('Error cargando dashboard:', err);
        mostrarNotificacion('❌ Error al cargar el dashboard: ' + err.message, 'warning');
    }
}

export function initDashboard() {
    document.querySelectorAll('.dash-range-btn[data-rango]').forEach(btn => {
        btn.addEventListener('click', () => cambiarRangoDashboard(btn.dataset.rango));
    });
    const desde = document.getElementById('dashDesde');
    const hasta = document.getElementById('dashHasta');
    if (desde) desde.addEventListener('change', () => cambiarRangoDashboard('custom'));
    if (hasta) hasta.addEventListener('change', () => cambiarRangoDashboard('custom'));
}
