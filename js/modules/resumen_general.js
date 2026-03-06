/**
 * INKA CORP - Módulo de Resumen General
 * Procesa indicadores clave de Créditos, Pólizas y Bancos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let resumenData = {
    creditos: {
        totalRecuperar: 0,
        recaudacionTrimestre: 0,
        activos: 0,
        topSocios: [],
        historicoMensual: []
    }
};

/**
 * Inicializa el módulo
 */
async function initResumenGeneralModule() {
    console.log('Iniciando Resumen General...');
    await refreshResumenData();
}

/**
 * Carga o actualiza los datos desde Supabase
 */
async function refreshResumenData() {
    try {
        const supabase = window.getSupabaseClient();
        
        // 1. Obtener TODOS los Créditos para calcular valor por recuperar global
        const { data: allCreditos, error: errC } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito, 
                estado_credito,
                socio:id_socio (nombre, cedula),
                cuotas:ic_creditos_amortizacion (cuota_total, estado_cuota, requiere_cobro)
            `);

        if (errC) throw errC;

        // Calcular Valor por Recuperar (Todas las cuotas pendientes que requieren cobro, sin importar el estado del crédito)
        let sumPendiente = 0;
        let countActivos = 0;
        
        allCreditos.forEach(c => {
            // Contabilizar créditos activos para el KPI de cantidad
            if (c.estado_credito === 'ACTIVO') countActivos++;

            // Sumar cuotas pendientes que requieren cobro (requiere_cobro = true)
            if (c.cuotas) {
                const porRecuperar = c.cuotas.filter(cuota => 
                    cuota.requiere_cobro === true && 
                    (cuota.estado_cuota === 'PENDIENTE' || cuota.estado_cuota === 'VENCIDO' || cuota.estado_cuota === 'PARCIAL')
                );
                sumPendiente += porRecuperar.reduce((acc, curr) => acc + parseFloat(curr.cuota_total || 0), 0);
            }
        });

        // 2. Obtener Recaudación últimos 6 meses (Historico real)
        const hoy = new Date();
        const hace6Meses = new Date();
        hace6Meses.setMonth(hoy.getMonth() - 6);
        
        const { data: pagos, error: errP } = await supabase
            .from('ic_creditos_pagos')
            .select('id_pago, monto_pagado, fecha_pago, id_credito') // Añadimos id_credito para filtrar socios
            .gte('fecha_pago', hace6Meses.toISOString())
            .lte('fecha_pago', hoy.toISOString()); 

        if (errP) throw errP;

        // 3. Obtener Top 5 Socios
        // Lógica: Socios con crédito ACTIVO que han pagado algo en los últimos 6 meses
        const idsCreditosPagaron = [...new Set(pagos.map(p => p.id_credito))];
        
        const topSociosRaw = allCreditos
            .filter(c => c.estado_credito === 'ACTIVO' && idsCreditosPagaron.includes(c.id_credito))
            .map(c => {
                // Sumar cuánto ha pagado este socio específico en los últimos 6 meses
                const totalPagado6m = pagos
                    .filter(p => p.id_credito === c.id_credito)
                    .reduce((acc, curr) => acc + parseFloat(curr.monto_pagado || 0), 0);

                return {
                    nombre: c.socio?.nombre || 'N/A',
                    montoTotalPagado: totalPagado6m,
                    cuotaActual: (c.cuotas && c.cuotas.length > 0) ? parseFloat(c.cuotas[0].cuota_total) : 0,
                    codigo: c.id_credito
                };
            })
            .sort((a, b) => b.montoTotalPagado - a.montoTotalPagado) // Ordenar por mayor recaudación generada
            .slice(0, 5);

        // 4. Agrupar recaudación por mes y guardar detalles
        const { historicoMensual, pagosDetallados } = procesarHistoricoMensual(pagos, 6); // Pasamos 6 meses
        window.pagosDetalladosCache = pagosDetallados; 

        // Calcular promedio mensual real de los meses con datos
        const mesesConDatos = historicoMensual.filter(h => h.monto > 0);
        const promedioMensual = mesesConDatos.length > 0 
            ? historicoMensual.reduce((acc, curr) => acc + curr.monto, 0) / historicoMensual.length 
            : 0;

        // Actualizar Estado
        resumenData.creditos = {
            totalRecuperar: sumPendiente,
            recaudacionTrimestre: historicoMensual.reduce((acc, curr) => acc + curr.monto, 0),
            promedioMensual: promedioMensual,
            activos: countActivos,
            topSocios: topSociosRaw,
            historicoMensual: historicoMensual
        };

        renderResumenCreditos();

    } catch (error) {
        console.error('Error al cargar Resumen General:', error);
        showToast('Error al cargar indicadores', 'error');
    }
}

/**
 * Muestra el detalle de pagos de un mes específico
 */
async function verDetalleMes(key, mesLabel) {
    const pagos = window.pagosDetalladosCache ? window.pagosDetalladosCache[key] : [];
    
    if (!pagos || pagos.length === 0) {
        showToast('No hay detalles disponibles para este mes', 'info');
        return;
    }

    const supabase = window.getSupabaseClient();
    
    // Obtener información extendida (Socio y Cobrador) si no viene en el primer fetch
    // En este caso, el fetch inicial de pagos solo tiene monto y fecha
    // Vamos a hacer un fetch rápido de estos IDs para el detalle
    try {
        Swal.fire({
            title: `Cargando detalles de ${mesLabel}...`,
            allowOutsideClick: false,
            customClass: {
                container: 'resumen-detalle-modal',
                popup: 'resumen-modal-popup'
            },
            didOpen: () => { Swal.showLoading(); }
        });

        // Obtenemos los IDs de los pagos de este mes para traer sus relaciones
        const idsPagos = pagos.map(p => p.id_pago);
        const { data: detalles, error } = await supabase
            .from('ic_creditos_pagos')
            .select(`
                fecha_pago,
                monto_pagado,
                ic_creditos (
                    socio:id_socio (nombre)
                ),
                cobrador:cobrado_por (nombre)
            `)
            .in('id_pago', idsPagos)
            .order('fecha_pago', { ascending: false });

        if (error) throw error;

        const totalMes = detalles.reduce((acc, d) => acc + parseFloat(d.monto_pagado || 0), 0);
        
        // Calcular resumen por asesor
        const resumenAsesores = {};
        detalles.forEach(d => {
            const nombre = d.cobrador?.nombre || 'Sist. Auto';
            if (!resumenAsesores[nombre]) {
                resumenAsesores[nombre] = { monto: 0, transacciones: 0 };
            }
            resumenAsesores[nombre].monto += parseFloat(d.monto_pagado || 0);
            resumenAsesores[nombre].transacciones += 1;
        });

        const html = `
            <div class="resumen-detalle-container">
                <div class="resumen-detalle-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Recaudado</span>
                        <span class="stat-value">${formatMoney(totalMes)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Transacciones</span>
                        <span class="stat-value">${detalles.length}</span>
                    </div>
                </div>

                <div class="resumen-asesores-grid">
                    ${Object.entries(resumenAsesores).map(([nombre, data]) => `
                        <div class="asesor-mini-card">
                            <div class="asesor-icon"><i class="fas fa-user-tie"></i></div>
                            <div class="asesor-info">
                                <span class="asesor-name">${nombre}</span>
                                <span class="asesor-monto">${formatMoney(data.monto)}</span>
                            </div>
                            <div class="asesor-divider"></div>
                            <div class="asesor-transactions">
                                <span class="tx-label">Cobros</span>
                                <span class="tx-count">${data.transacciones}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="resumen-detalle-table-wrapper">
                    <table class="resumen-detalle-table">
                        <thead>
                            <tr>
                                <th><i class="far fa-calendar-alt"></i> Fecha</th>
                                <th><i class="far fa-user"></i> Socio</th>
                                <th><i class="fas fa-dollar-sign"></i> Monto</th>
                                <th><i class="fas fa-id-badge"></i> Cobrado Por</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detalles.map(d => `
                                <tr>
                                    <td>${window.formatDate(d.fecha_pago)}</td>
                                    <td>
                                        <div class="socio-info-cell">
                                            <span class="socio-name">${d.ic_creditos?.socio?.nombre || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td class="text-success" style="font-weight: 700;">${formatMoney(d.monto_pagado)}</td>
                                    <td><span class="badge-cobrador"><i class="fas fa-user-check"></i> ${d.cobrador?.nombre || 'Sist. Auto'}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        Swal.fire({
            title: `<div class="resumen-modal-title"><span>Recaudación</span> <small>${mesLabel}</small></div>`,
            html: html,
            width: '1000px', // Más ancho para aprovechar la pantalla
            showConfirmButton: false, // Ocultamos el botón inferior
            showCloseButton: true, // Mostramos la "X" en la parte superior derecha
            customClass: {
                container: 'resumen-detalle-modal',
                popup: 'resumen-modal-popup',
                header: 'resumen-modal-header',
                closeButton: 'resumen-modal-close-btn'
            }
        });

    } catch (error) {
        console.error('Error al cargar detalle:', error);
        showToast('Error al cargar detalles', 'error');
    }
}

/**
 * Pinta los datos en la UI
 */
function renderResumenCreditos() {
    const d = resumenData.creditos;
    
    // KPIs
    const elRecuperar = document.getElementById('res-total-recuperar');
    const elTotal6m = document.getElementById('res-total-6m');
    const elPromedio = document.getElementById('res-promedio-mensual');
    const elActivos = document.getElementById('res-creditos-activos');

    if (elRecuperar) elRecuperar.textContent = formatMoney(d.totalRecuperar);
    if (elTotal6m) elTotal6m.textContent = formatMoney(d.recaudacionTrimestre); 
    if (elPromedio) elPromedio.textContent = formatMoney(d.promedioMensual); 
    if (elActivos) elActivos.textContent = d.activos;

    // Top Socios (Top 5)
    const topList = document.getElementById('top-socios-list');
    if (topList) {
        topList.innerHTML = d.topSocios.map((s, index) => `
            <div class="top-socio-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.7rem; background: #242c36; border: 1px solid rgba(148,163,184,0.2); border-radius: 0.75rem; margin-bottom: 0.5rem; border-left: 4px solid #10b981; transition: transform 0.2s;">
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <div style="width: 24px; height: 24px; background: #10b981; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800;">${index + 1}</div>
                    <div>
                        <div style="font-weight: 700; font-size: 0.85rem; color: #eef2f7; text-transform: uppercase;">${s.nombre.length > 25 ? s.nombre.substring(0, 25) + '...' : s.nombre}</div>
                        <div style="font-size: 0.65rem; color: #93a1b3;">Aportó ${formatMoney(s.montoTotalPagado)} en 6 meses</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: #10b981; font-size: 0.95rem;">${formatMoney(s.cuotaActual)}</div>
                    <div style="font-size: 0.6rem; color: #93a1b3;">Cuota base</div>
                </div>
            </div>
        `).join('') || '<p class="text-center text-muted">No hay socios con pagos activos en este rango</p>';
    }

    // Histórico (Lista Original - Selector de meses)
    const histList = document.getElementById('recaudacion-historia-list');
    if (histList) {
        histList.style = 'max-height: 400px; overflow-y: auto;'; // Restablecer a lista con scroll si es necesario
        histList.innerHTML = d.historicoMensual.map(h => `
            <div class="recaudacion-mes-item" onclick="verDetalleMes('${h.key}', '${h.mes}')" style="cursor: pointer; padding: 0.75rem; border-radius: 0.75rem; transition: all 0.2s; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(148,163,184,0.2); background: #242c36;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 30px; height: 30px; background: rgba(59,130,246,0.16); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-calendar-alt" style="color: #60a5fa; font-size: 0.8rem;"></i>
                    </div>
                    <span style="font-weight: 600; color: #e2e8f0; font-size: 0.9rem;">${h.mes}</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: #60a5fa; font-weight: 700; display: block;">${formatMoney(h.monto)}</span>
                    <span style="font-size: 0.6rem; color: #93a1b3;">Clic para detalles</span>
                </div>
            </div>
        `).join('') || '<p class="text-center text-muted">Sin datos recientes</p>';
    }

    // Gráfico de Evolución Detallado (Nuevo Módulo debajo)
    const trendBox = document.getElementById('trend-indicator-box');
    const evolucionContainer = document.getElementById('evolucion-detallada-container');

    if (evolucionContainer) {
        const mesesData = d.historicoMensual.slice().reverse();
        
        // --- 1. Calcular Proyección (Promedio de crecimiento simple) ---
        let proyeccion = [];
        let proySuma = 0;
        if (mesesData.length >= 2) {
            const ultimoMonto = mesesData[mesesData.length - 1].monto;
            const penultimoMonto = mesesData[mesesData.length - 2].monto;
            const diff = ultimoMonto - penultimoMonto;
            
            // Generar 2 meses futuros
            const hoy = new Date();
            for (let i = 1; i <= 2; i++) {
                const fechaFutura = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
                const label = `${fechaFutura.toLocaleDateString('es-EC', {month: 'short'})}`;
                const montoProyectado = Math.max(0, ultimoMonto + (diff * i));
                proyeccion.push({ label, monto: montoProyectado });
                proySuma += montoProyectado;
            }
        }

        // --- 2. Tendencia y Porcentajes ---
        const actualVal = d.historicoMensual[0]?.monto || 0;
        const anteriorVal = d.historicoMensual[1]?.monto || 1;
        const subio = actualVal >= anteriorVal;
        const diffPct = (((actualVal - anteriorVal) / anteriorVal) * 100).toFixed(1);
        const promedio = d.promedioMensual || 1;
        const pctDesempeno = ((actualVal / promedio) * 100).toFixed(1);

        // Actualizar Badge de Tendencia
        if (trendBox) {
            trendBox.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <div class="trend-badge ${subio ? 'trend-up' : 'trend-down'}">
                        <i class="fas ${subio ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
                        <span>
                            <strong>${subio ? 'Tendencia al Alza' : 'Recaudación en Baja'}</strong> 
                            (${subio ? '+' : ''}${diffPct}%)
                        </span>
                        <span class="trend-divider"></span>
                        <span>
                            <i class="fas fa-chart-line"></i> 
                            Proy. 2m: <strong>${formatMoney(proySuma)}</strong>
                        </span>
                    </div>
                    <div class="efficiency-badge" style="color: ${pctDesempeno >= 100 ? '#10b981' : '#f59e0b'}">
                        Eficiencia: <strong>${pctDesempeno}%</strong> <small>vs Meta Promedio</small>
                    </div>
                </div>
            `;
        }

        // --- 3. Preparar puntos del gráfico con ApexCharts ---
        const labels = [...mesesData.map(h => h.mes.split(' ')[0]), ...proyeccion.map(p => p.label + '*')];
        
        // Preparar series: La real termina donde empieza la proyección
        const realData = mesesData.map(h => h.monto);
        const placeholderProy = new Array(realData.length - 1).fill(null);
        const proyData = [...placeholderProy, realData[realData.length - 1], ...proyeccion.map(p => p.monto)];

        evolucionContainer.innerHTML = ''; // Limpiar SVG anterior
        
        const options = {
            series: [{
                name: 'Recaudación Real',
                data: realData
            }, {
                name: 'Proyección Estimada',
                data: proyData
            }],
            chart: {
                height: 320,
                type: 'area',
                fontFamily: 'Inter, sans-serif',
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: { enabled: true, easing: 'easeinout', speed: 800 }
            },
            colors: ['#3b82f6', '#94a3b8'],
            dataLabels: { enabled: false },
            stroke: {
                curve: 'smooth',
                width: [4, 3],
                dashArray: [0, 5]
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.45,
                    opacityTo: 0.05,
                    stops: [20, 100]
                }
            },
            markers: {
                size: [5, 4],
                strokeWidth: 2,
                hover: { size: 7 }
            },
            xaxis: {
                categories: labels,
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: {
                    style: { colors: '#64748b', fontWeight: 600 }
                }
            },
            yaxis: {
                labels: {
                    formatter: (val) => formatMoney(val).replace('.00', ''),
                    style: { colors: '#64748b', fontWeight: 600 }
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right',
                fontWeight: 600,
                markers: { radius: 12 }
            },
            grid: {
                borderColor: '#f1f5f9',
                strokeDashArray: 4
            },
            tooltip: {
                theme: 'light',
                shared: true,
                intersect: false,
                y: {
                    formatter: (val) => formatMoney(val)
                }
            }
        };

        if (window.resumenChart) {
            window.resumenChart.destroy();
        }
        window.resumenChart = new ApexCharts(evolucionContainer, options);
        window.resumenChart.render();
    }
}

/**
 * Navegación interna entre pestañas del módulo
 */
function switchResumenTab(tabId, btn) {
    // Buttons
    document.querySelectorAll('.resumen-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Panes
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`resumen-${tabId}`);
    if (target) target.classList.add('active');
}

/**
 * Procesa los pagos para agruparlos por mes
 */
function procesarHistoricoMensual(pagos, mesesAMostrar = 3) {
    const meses = {};
    const pagosDetallados = {}; 
    const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    // Generar las llaves de los últimos N meses incluso si no tienen pagos (para que el gráfico no esté vacío)
    const hoy = new Date();
    for (let i = 0; i < mesesAMostrar; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        meses[key] = { key: key, label: `${nombresMeses[d.getMonth()]} ${d.getFullYear()}`, monto: 0 };
        pagosDetallados[key] = [];
    }

    pagos.forEach(p => {
        if (!p.fecha_pago) return;
        
        // Extraer partes de la fecha de forma segura sin problemas de zona horaria
        const [year, month, day] = p.fecha_pago.split('-').map(Number);
        if (!year || !month) return;

        const key = `${year}-${String(month).padStart(2, '0')}`;

        if (meses[key]) {
            meses[key].monto += parseFloat(p.monto_pagado || 0);
            pagosDetallados[key].push(p);
        }
    });

    const result = Object.values(meses)
        .sort((a, b) => b.key.localeCompare(a.key));

    const max = Math.max(...result.map(r => r.monto), 1);
    
    return {
        historicoMensual: result.map(r => ({
            key: r.key,
            mes: r.label,
            monto: r.monto,
            pct: (r.monto / max) * 100
        })),
        pagosDetallados: pagosDetallados
    };
}

// Exportar funciones globales
window.switchResumenTab = switchResumenTab;
window.verDetalleMes = verDetalleMes;
