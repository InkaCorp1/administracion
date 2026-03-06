/**
 * INKA CORP - Módulo Simulador Móvil
 * Réplica de lógica de escritorio adaptada a UI móvil
 */

let mobileSimType = 'credito';
let mobileSimData = null;
let mobileAmortizacion = [];

/**
 * Inicializador del módulo
 */
function initSimuladorModule() {
    console.log('[Simulador] Inicializando módulo móvil...');
    setMobileDefaultDates();
    
    // Exponer al scope global
    window.switchSimType = switchSimType;
    window.calcularSimulacionMobile = calcularSimulacionMobile;
    window.limpiarSimuladorMobile = limpiarSimuladorMobile;
    window.generarPDFSimulacionMobile = generarPDFSimulacionMobile;
}

function setMobileDefaultDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    
    const inpDesembolso = document.getElementById('sim-fecha-desembolso');
    const inpInicio = document.getElementById('sim-fecha-inicio');
    
    if (inpDesembolso) inpDesembolso.value = today;
    if (inpInicio) inpInicio.value = today;
}

function switchSimType(type) {
    mobileSimType = type;
    
    // UI Toggles
    const btnCred = document.getElementById('btn-toggle-credito');
    const btnPol = document.getElementById('btn-toggle-poliza');
    if(btnCred) btnCred.classList.toggle('active', type === 'credito');
    if(btnPol) btnPol.classList.toggle('active', type === 'poliza');
    
    // Fields visibility
    const divCred = document.getElementById('fields-credito');
    const divPol = document.getElementById('fields-poliza');
    if(divCred) divCred.classList.toggle('hidden', type !== 'credito');
    if(divPol) divPol.classList.toggle('hidden', type !== 'poliza');
    
    // Labels & Defaults
    const labelCapital = document.getElementById('label-capital');
    const labelInteres = document.getElementById('label-interes');
    const inputInteres = document.getElementById('sim-interes');
    
    if (type === 'credito') {
        if(labelCapital) labelCapital.textContent = 'Capital Solicitado ($)';
        if(labelInteres) labelInteres.textContent = 'Interés Mensual (%)';
        if(inputInteres) inputInteres.value = '2.0';
    } else {
        if(labelCapital) labelCapital.textContent = 'Valor de Inversión ($)';
        if(labelInteres) labelInteres.textContent = 'Interés Anual (%)';
        if(inputInteres) inputInteres.value = '10.0';
    }
    
    // Ocultar resultados
    const resCont = document.getElementById('sim-result-container');
    const tableCont = document.getElementById('sim-table-container');
    if(resCont) resCont.classList.add('hidden');
    if(tableCont) tableCont.classList.add('hidden');
}

/**
 * Lógica de Cálculo (Réplica de PC)
 */
function calcularSimulacionMobile() {
    if (mobileSimType === 'credito') {
        calcularCreditoMobile();
    } else {
        calcularPolizaMobile();
    }
}

function calcularCreditoMobile() {
    const capital = parseFloat(document.getElementById('sim-capital').value);
    const interesMensual = parseFloat(document.getElementById('sim-interes').value) / 100;
    const plazo = parseInt(document.getElementById('sim-plazo').value);
    const fechaDesembolsoStr = document.getElementById('sim-fecha-desembolso').value;
    const diaPago = parseInt(document.getElementById('sim-dia-pago').value);

    if (isNaN(capital) || capital <= 0) {
        if(window.Swal) Swal.fire('Error', 'Ingrese un capital válido', 'error');
        return;
    }

    if (!fechaDesembolsoStr) {
        if(window.Swal) Swal.fire('Error', 'Seleccione fecha de desembolso', 'error');
        return;
    }
    
    const fechaDesembolso = new Date(fechaDesembolsoStr + 'T12:00:00');

    // 1. Gastos Administrativos
    let gastosAdmin;
    if (capital < 5000) gastosAdmin = capital * 0.038;
    else if (capital < 20000) gastosAdmin = capital * 0.023;
    else gastosAdmin = capital * 0.018;

    // 2. Fechas
    const fechaBase = new Date(fechaDesembolso.getTime());
    if (fechaDesembolso.getDate() <= diaPago + 2) {
        fechaBase.setDate(diaPago);
    } else {
        fechaBase.setMonth(fechaBase.getMonth() + 1);
        fechaBase.setDate(diaPago);
    }
    
    const finCredito = new Date(fechaBase.getTime());
    finCredito.setMonth(finCredito.getMonth() + plazo);
    
    const unDiaMs = 1000 * 60 * 60 * 24;
    const diasTotales = Math.round((finCredito - fechaDesembolso) / unDiaMs);
    
    const fechaPrimerPago = new Date(fechaBase.getTime());
    fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);

    // 3. Interés Total
    const tasaDiaria = (interesMensual * 12) / 365;
    const interesTotal = capital * tasaDiaria * diasTotales;
    const totalPagar = capital + interesTotal + gastosAdmin;
    
    const cuotaBase = Math.ceil(totalPagar / plazo);
    const ahorroTotal = (capital + interesTotal) * 0.10;
    const ahorroCuota = Math.ceil(ahorroTotal / plazo);
    const cuotaConAhorro = cuotaBase + ahorroCuota;

    // 4. Amortización
    const amortizacion = [];
    let saldo = capital;
    let fechaAnt = fechaDesembolso;
    let intAcum = 0;
    const sumDigits = plazo * (plazo + 1) / 2;
    const gastosCuota = gastosAdmin / plazo;

    for (let i = 0; i < plazo; i++) {
        const fVen = new Date(fechaPrimerPago);
        fVen.setMonth(fechaPrimerPago.getMonth() + i);
        
        const diasPer = Math.ceil((fVen - fechaAnt) / unDiaMs);
        let intMes = (sumDigits > 0) ? interesTotal * ((plazo - i) / sumDigits) : 0;
        let capMes = cuotaBase - intMes - gastosCuota;
        let cuotaMes = cuotaBase;

        if (i === plazo - 1) {
            capMes = saldo;
            const intRest = interesTotal - intAcum;
            const gasRest = gastosAdmin - (gastosCuota * (plazo - 1));
            cuotaMes = capMes + intRest + gasRest;
        }

        const gasMes = (i === plazo - 1) ? (gastosAdmin - (gastosCuota * (plazo - 1))) : gastosCuota;
        intMes = cuotaMes - capMes - gasMes;
        saldo -= capMes;
        intAcum += intMes;

        amortizacion.push({
            n: i + 1,
            fecha: new Date(fVen),
            dias: diasPer,
            cap: capMes,
            int: intMes,
            gas: gasMes,
            base: cuotaMes,
            ahorro: ahorroCuota,
            total: cuotaMes + ahorroCuota,
            saldo: Math.max(0, saldo)
        });
        fechaAnt = fVen;
    }

    mobileSimData = {
        tipo: 'credito',
        nombre: document.getElementById('sim-nombre').value || 'Cliente',
        capital, 
        gastosAdmin, 
        interesTotal, 
        ahorroTotal,
        cuotaBase, 
        cuotaConAhorro,
        plazo, 
        tasaInteresMensual: interesMensual * 100,
        fechaDesembolso, 
        fechaFin: finCredito,
        totales: {
            capital: amortizacion.reduce((sum, r) => sum + r.cap, 0),
            interes: amortizacion.reduce((sum, r) => sum + r.int, 0),
            ahorro: amortizacion.reduce((sum, r) => sum + r.ahorro, 0),
            cuotas: amortizacion.reduce((sum, r) => sum + r.total, 0)
        }
    };
    mobileAmortizacion = amortizacion;
    
    renderResultsMobile();
}

function calcularPolizaMobile() {
    const inversion = parseFloat(document.getElementById('sim-capital').value);
    const tasaAnual = parseFloat(document.getElementById('sim-interes').value) / 100;
    const plazo = parseInt(document.getElementById('sim-plazo').value);
    const fechaIniStr = document.getElementById('sim-fecha-inicio').value;

    if (isNaN(inversion) || inversion <= 0) {
        if(window.Swal) Swal.fire('Error', 'Ingrese inversión válida', 'error');
        return;
    }

    const fechaIni = new Date(fechaIniStr + 'T12:00:00');
    const intMensual = tasaAnual / 12;
    const intGen = inversion * intMensual * plazo;
    const valFin = inversion + intGen;
    const fVen = new Date(fechaIni);
    fVen.setMonth(fVen.getMonth() + plazo);

    const proyeccion = [];
    for (let i = 1; i <= plazo; i++) {
        const fMes = new Date(fechaIni);
        fMes.setMonth(fechaIni.getMonth() + i);
        proyeccion.push({
            n: i,
            fecha: new Date(fMes),
            inv: inversion,
            intMes: inversion * intMensual,
            total: inversion + (inversion * intMensual * i)
        });
    }

    mobileSimData = {
        tipo: 'poliza',
        nombre: document.getElementById('sim-nombre').value || 'Inversionista',
        inversion, tasaAnual: tasaAnual * 100, intGen, valFin, plazo, fechaIni, fVen
    };
    mobileAmortizacion = proyeccion;
    
    renderResultsMobile();
}

function renderResultsMobile() {
    const resContainer = document.getElementById('sim-result-container');
    const tableContainer = document.getElementById('sim-table-container');
    
    // Si no hay datos reales, ocultar todo y salir
    if (!mobileSimData) {
        if(resContainer) resContainer.classList.add('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }

    if(resContainer) resContainer.classList.remove('hidden');
    
    // Solo mostrar tabla si hay filas generadas
    if(tableContainer) {
        if (mobileAmortizacion && mobileAmortizacion.length > 0) {
            tableContainer.classList.remove('hidden');
        } else {
            tableContainer.classList.add('hidden');
        }
    }

    if (mobileSimType === 'credito') {
        const cuotaDisp = document.getElementById('res-cuota-principal');
        if(cuotaDisp) cuotaDisp.textContent = formatMoney(mobileSimData.cuotaConAhorro);
        
        const labelCuota = document.querySelector('.main-res-item .label');
        if(labelCuota) labelCuota.textContent = 'Cuota Mensual sugerida';

        document.getElementById('res-capital').textContent = formatMoney(mobileSimData.capital);
        document.getElementById('res-gastos').textContent = formatMoney(mobileSimData.gastosAdmin);
        document.getElementById('res-interes').textContent = formatMoney(mobileSimData.interesTotal);
        
        const totalNeto = mobileSimData.cuotaBase * mobileSimData.plazo;
        document.getElementById('res-total').textContent = formatMoney(totalNeto);
        document.getElementById('res-nota-ahorro').textContent = `* El ahorro de ${formatMoney(mobileSimData.ahorroTotal)} se devuelve íntegramente.`;
        
        renderTableMobile(['#', 'Fecha', 'Cuota', 'Ahorro', 'Total']);
    } else {
        const cuotaDisp = document.getElementById('res-cuota-principal');
        if(cuotaDisp) cuotaDisp.textContent = formatMoney(mobileSimData.intGen / mobileSimData.plazo);
        
        const labelCuota = document.querySelector('.main-res-item .label');
        if(labelCuota) labelCuota.textContent = 'Interés Mensual Promedio';

        document.getElementById('res-capital').textContent = formatMoney(mobileSimData.inversion);
        document.getElementById('res-gastos').textContent = mobileSimData.tasaAnual + '% Anual';
        document.getElementById('res-interes').textContent = formatMoney(mobileSimData.intGen);
        document.getElementById('res-total').textContent = formatMoney(mobileSimData.valFin);
        document.getElementById('res-nota-ahorro').textContent = `Vencimiento: ${mobileSimData.fVen.toLocaleDateString()}`;
        
        renderTableMobile(['Mes', 'Fecha', 'Interés', 'Valor Total']);
    }
    
    setTimeout(() => {
        resContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function renderTableMobile(headers) {
    const head = document.getElementById('sim-table-head');
    const body = document.getElementById('sim-table-body');
    
    if(head) head.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
    
    if (mobileSimType === 'credito') {
        body.innerHTML = mobileAmortizacion.map(r => `
            <tr>
                <td>${r.n}</td>
                <td style="font-size: 0.75rem;">${r.fecha.toLocaleDateString('es-EC', {day:'2-digit', month:'2-digit'})}</td>
                <td>${formatMoney(r.base)}</td>
                <td class="text-gold">${formatMoney(r.ahorro)}</td>
                <td class="text-primary">${formatMoney(r.total)}</td>
            </tr>
        `).join('');
    } else {
        body.innerHTML = mobileAmortizacion.map(r => `
            <tr>
                <td>${r.n}</td>
                <td style="font-size: 0.75rem;">${r.fecha.toLocaleDateString('es-EC', {day:'2-digit', month:'2-digit'})}</td>
                <td class="text-gold">${formatMoney(r.intMes)}</td>
                <td class="text-primary">${formatMoney(r.total)}</td>
            </tr>
        `).join('');
    }
}

async function generarPDFSimulacionMobile() {
    if (!mobileSimData) return;

    const btn = document.getElementById('btn-generar-pdf');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let y = 20;

        // Colores corporativos PC
        const primaryColor = [11, 78, 50]; 
        const goldColor = [242, 187, 58];
        const grayColor = [100, 100, 100];
        const darkGray = [50, 50, 50];

        const today = new Date();
        const fechaFormateada = today.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });

        // ==========================================
        // PÁGINA 1: RESUMEN Y CONDICIONES
        // ==========================================
        
        // Header / Logo Branding
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 5, 'F');
        
        y = 25;
        doc.setTextColor(...primaryColor);
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('INKA CORP', margin, y);

        doc.setTextColor(...goldColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Cooperativa de Ahorro y Credito', margin, y + 6);

        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.text('Documento de Simulacion Informativa', pageWidth - margin, y, { align: 'right' });
        doc.text(fechaFormateada, pageWidth - margin, y + 5, { align: 'right' });

        y = 50;
        doc.setTextColor(...primaryColor);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const tituloSim = mobileSimType === 'credito' ? 'SIMULACION DE CREDITO' : 'SIMULACION DE INVERSION (POLIZA)';
        doc.text(tituloSim, margin, y);

        y += 2;
        doc.setDrawColor(...goldColor);
        doc.setLineWidth(1);
        doc.line(margin, y, margin + 40, y);

        y += 12;
        doc.setTextColor(...darkGray);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Estimado/a ${mobileSimData.nombre}:`, margin, y);
        y += 6;
        doc.setFontSize(10);
        doc.text('Presentamos a continuacion el detalle de la simulacion solicitada:', margin, y);

        y += 10;

        if (mobileSimType === 'credito') {
            // DETALLE DEL CRÉDITO (Caja)
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 55, 3, 3, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 55, 3, 3, 'S');

            y += 8;
            doc.setTextColor(...primaryColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DEL CREDITO', margin + 5, y);

            y += 8;
            const col1X = margin + 5;
            const col2X = pageWidth / 2 + 5;
            doc.setFontSize(9);
            doc.setTextColor(...grayColor);
            doc.setFont('helvetica', 'normal');

            // Fila 1
            doc.text('Capital Solicitado:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(formatMoney(mobileSimData.capital), col1X + 40, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Tasa de Interes:', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(mobileSimData.tasaInteresMensual.toFixed(2) + '% mensual', col2X + 30, y);

            y += 7;
            // Fila 2
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Plazo:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(mobileSimData.plazo + ' meses', col1X + 40, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Cuota Mensual (inc. ahorro):', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(formatMoney(mobileSimData.cuotaConAhorro), col2X + 42, y);

            y += 7;
            // Fila 3
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Ahorro Programado/Cuota:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...goldColor);
            doc.text(formatMoney(mobileSimData.ahorroTotal / mobileSimData.plazo), col1X + 48, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Total Intereses + Gastos:', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            const totalNetoPagar = mobileSimData.cuotaBase * mobileSimData.plazo;
            doc.text(formatMoney(totalNetoPagar - mobileSimData.capital), col2X + 42, y);

            y += 10;
            // Recuadro Totales
            const totalBruto = totalNetoPagar + mobileSimData.ahorroTotal;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin + 5, y, pageWidth - 2 * margin - 10, 32, 3, 3, 'FD');

            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('TOTAL A PAGAR (Capital + Intereses + Ahorro):', margin + 10, y + 7);
            doc.setTextColor(...primaryColor);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(formatMoney(totalBruto), pageWidth - margin - 15, y + 7, { align: 'right' });

            doc.setTextColor(16, 185, 129);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('(-) Ahorro Programado (se devuelve al socio):', margin + 10, y + 15);
            doc.setFont('helvetica', 'bold');
            doc.text('- ' + formatMoney(mobileSimData.ahorroTotal), pageWidth - margin - 15, y + 15, { align: 'right' });

            doc.setDrawColor(...goldColor);
            doc.setLineWidth(0.5);
            doc.line(margin + 10, y + 19, pageWidth - margin - 10, y + 19);

            doc.setFillColor(...primaryColor);
            doc.roundedRect(margin + 8, y + 21, pageWidth - 2 * margin - 16, 9, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL NETO A CANCELAR DEL CREDITO:', margin + 12, y + 27);
            doc.setTextColor(...goldColor);
            doc.setFontSize(10);
            doc.text(formatMoney(totalNetoPagar), pageWidth - margin - 17, y + 27, { align: 'right' });

            y += 42;
            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text('* Todo credito incluye un Ahorro Programado obligatorio, pensando en el bienestar del socio.', margin, y);
            y += 4;
            doc.text('  Este ahorro se devuelve integramente al socio al finalizar el credito.', margin, y);
            y += 4;
            doc.text('  El valor total del ahorro programado de este credito sera de ' + formatMoney(mobileSimData.ahorroTotal) + '.', margin, y);

            y += 10;
            doc.setTextColor(...primaryColor);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('CONDICIONES GENERALES', margin, y);
            doc.setDrawColor(...goldColor);
            doc.setLineWidth(0.5);
            y += 2;
            doc.line(margin, y, margin + 45, y);

            y += 6;
            doc.setTextColor(...darkGray);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            const tasaGastosTotal = mobileSimData.capital < 5000 ? 3.8 : (mobileSimData.capital < 20000 ? 2.3 : 1.8);
            const tasaGastosMensual = (tasaGastosTotal / mobileSimData.plazo).toFixed(2);
            [
                '- Gastos administrativos: ' + tasaGastosMensual + '% mensual sobre el capital.',
                '- Ahorro programado: se devuelve al socio al finalizar el credito.',
                '- Pagos mensuales en la fecha acordada.',
                '- Precancelacion disponible a partir del 3er mes.',
                '- Renovacion del credito disponible en cualquier momento.'
            ].forEach(line => {
                doc.text(line, margin, y);
                y += 4;
            });
        } else {
            // DETALLE DE LA INVERSIÓN
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 45, 3, 3, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 45, 3, 3, 'S');

            y += 8;
            doc.setTextColor(...primaryColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DE LA INVERSION', margin + 5, y);

            y += 10;
            const detallesPoliza = [
                ['Valor de Inversion:', formatMoney(mobileSimData.inversion)],
                ['Tasa de Interes Anual:', mobileSimData.tasaAnual.toFixed(2) + '%'],
                ['Plazo:', mobileSimData.plazo + ' meses'],
                ['Interes Generado:', formatMoney(mobileSimData.intGen)],
                ['Valor al Vencimiento:', formatMoney(mobileSimData.valFin)],
                ['Fecha de Vencimiento:', mobileSimData.fVen.toLocaleDateString()]
            ];

            doc.setFontSize(10);
            detallesPoliza.forEach(([lbl, val]) => {
                doc.setTextColor(...grayColor);
                doc.setFont('helvetica', 'normal');
                doc.text(lbl, margin + 5, y);
                doc.setTextColor(...primaryColor);
                doc.setFont('helvetica', 'bold');
                doc.text(val, margin + 60, y);
                y += 6;
            });
        }

        y += 12;
        doc.setTextColor(...darkGray);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Atentamente,', margin, y);
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...primaryColor);
        doc.text('INKA CORP', margin, y);
        y += 4;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(mobileSimType === 'credito' ? 'Departamento de Creditos' : 'Departamento de Inversiones', margin, y);

        // Footer Pág 1
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7);
        doc.text('Pagina 1 de 2', pageWidth / 2, pageHeight - 10, { align: 'center' });

        // ==========================================
        // PÁGINA 2: TABLA
        // ==========================================
        doc.addPage();
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('INKA CORP', margin, 15);
        doc.setTextColor(...goldColor);
        doc.setFontSize(12);
        doc.text(mobileSimType === 'credito' ? 'TABLA DE AMORTIZACION' : 'PROYECCION DE RENDIMIENTOS', pageWidth - margin, 15, { align: 'right' });

        y = 35;
        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Socio: ' + mobileSimData.nombre, margin, y);
        doc.text('Fecha: ' + fechaFormateada, pageWidth - margin, y, { align: 'right' });

        y += 10;
        const colWidths = mobileSimType === 'credito' ? [12, 28, 25, 25, 25, 28, 27] : [15, 30, 35, 30, 35, 35];
        const headers = mobileSimType === 'credito' ? ['#', 'Fecha', 'Capital', 'Interes', 'Ahorro', 'Cuota', 'Saldo'] : ['Mes', 'Fecha', 'Inversion', 'Int. Mes', 'Int. Acum.', 'Valor Total'];

        doc.setFillColor(...primaryColor);
        doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        let x = margin + 2;
        headers.forEach((h, i) => { doc.text(h, x, y + 5.5); x += colWidths[i]; });

        y += 10;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        mobileAmortizacion.forEach((row, idx) => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 20;
                doc.setFillColor(...primaryColor);
                doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                x = margin + 2;
                headers.forEach((h, i) => { doc.text(h, x, y + 5.5); x += colWidths[i]; });
                y += 10;
            }
            if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 3, pageWidth - 2 * margin, 6, 'F'); }
            doc.setTextColor(51, 65, 85);
            doc.setFont('helvetica', 'normal');
            x = margin + 2;
            const cells = mobileSimType === 'credito' 
                ? [row.n.toString(), row.fecha.toLocaleDateString(), formatMoney(row.cap), formatMoney(row.int), formatMoney(row.ahorro), formatMoney(row.total), formatMoney(row.saldo)]
                : [row.n.toString(), row.fecha.toLocaleDateString(), formatMoney(row.inv), formatMoney(row.intMes), formatMoney(row.intMes * row.n), formatMoney(row.total)];
            cells.forEach((c, i) => { doc.text(c, x, y); x += colWidths[i]; });
            y += 6;
        });

        // Totales Row
        y += 2;
        doc.setFillColor(...goldColor);
        doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
        doc.setTextColor(...primaryColor);
        doc.setFont('helvetica', 'bold');
        if (mobileSimType === 'credito') {
            x = margin + 2;
            doc.text('TOTALES', x, y + 5.5);
            x += colWidths[0] + colWidths[1];
            doc.text(formatMoney(mobileSimData.totales.capital), x, y + 5.5);
            x += colWidths[2];
            doc.text(formatMoney(mobileSimData.totales.interes), x, y + 5.5);
            x += colWidths[3];
            doc.text(formatMoney(mobileSimData.totales.ahorro), x, y + 5.5);
            x += colWidths[4];
            doc.text(formatMoney(mobileSimData.totales.cuotas), x, y + 5.5);
            x += colWidths[5];
            doc.text('$0.00', x, y + 5.5);
        }

        // Footer Pág 2
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7);
        doc.text('INKA CORP - Documento de Simulacion', margin, pageHeight - 10);
        doc.text('Pagina 2 de 2', pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text('No constituye contrato', pageWidth - margin, pageHeight - 10, { align: 'right' });

        const fileName = `Simulacion_${mobileSimType === 'credito' ? 'Credito' : 'Poliza'}_${mobileSimData.nombre.replace(/\s+/g, '_')}_INKA.pdf`;
        doc.save(fileName);
        if(window.Swal) Swal.fire('Éxito', 'PDF generado correctamente', 'success');
    } catch (e) {
        console.error(e);
        if(window.Swal) Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function limpiarSimuladorMobile() {
    const nom = document.getElementById('sim-nombre');
    const cap = document.getElementById('sim-capital');
    const plz = document.getElementById('sim-plazo');
    if(nom) nom.value = '';
    if(cap) cap.value = '1000';
    if(plz) plz.value = '12';
    setMobileDefaultDates();
    const rc = document.getElementById('sim-result-container');
    const tc = document.getElementById('sim-table-container');
    if(rc) rc.classList.add('hidden');
    if(tc) tc.classList.add('hidden');
    mobileSimData = null;
}

function formatMoney(n) {
    if(isNaN(n)) return '$0.00';
    return '$' + parseFloat(n).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}
