/**
 * Módulo de Desembolsos - Versión Móvil Modular
 */

let creditosData = [];
let selectedFilesForDesembolsoMobile = {};
let requiredSlotsForDesembolsoMobile = [];
let solicitudDocsEnginePromise = null;

function ensureMobileDocGeneratorShims() {
    // En móvil auth.js expone getCurrentUser async; para el generador de documentos
    // necesitamos una lectura síncrona idéntica al flujo de PC.
    window.getCurrentUser = () => window.currentUser || null;

    if (typeof window.getDatosAcreedor !== 'function') {
        window.getDatosAcreedor = function () {
            const user = window.currentUser || null;

            if (!user) {
                return {
                    nombre: '',
                    institucion: 'INKA CORP',
                    cedula: '',
                    telefono: '',
                    domicilio: '',
                    ciudad: ''
                };
            }

            let numWhatsapp = user.whatsapp || user.user_metadata?.whatsapp || user.phone || '';
            let telefonoFinal = String(numWhatsapp || '').trim();
            const invalidValues = ['undefined', 'null', '[object object]', '0', 'none'];

            if (invalidValues.includes(telefonoFinal.toLowerCase())) {
                telefonoFinal = '';
            }

            return {
                nombre: (user.nombre || user.full_name || user.user_metadata?.full_name || '').toUpperCase(),
                institucion: 'INKA CORP',
                cedula: user.cedula || '',
                telefono: telefonoFinal,
                domicilio: user.direccion || user.domicilio || '',
                ciudad: user.lugar_asesor || user.ciudad || ''
            };
        };
    }

    if (typeof window.showToast !== 'function') {
        // En móvil evitamos toasts ruidosos durante la generación;
        // se mantiene únicamente el aviso final de éxito del flujo principal.
        window.showToast = function () {};
    }

    if (typeof window.formatDateTime !== 'function') {
        window.formatDateTime = function (dateString, options = {}) {
            if (!dateString) return '-';
            try {
                const date = (dateString instanceof Date) ? dateString : new Date(dateString);
                if (isNaN(date.getTime())) return '-';

                const defaultOptions = {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Guayaquil'
                };

                return date.toLocaleString('es-EC', { ...defaultOptions, ...options });
            } catch (e) {
                return '-';
            }
        };
    }

    if (typeof window.formatDate !== 'function') {
        window.formatDate = function (dateString, options = {}) {
            if (!dateString) return '-';
            try {
                const date = (dateString instanceof Date) ? dateString : new Date(dateString);
                if (isNaN(date.getTime())) return '-';

                const defaultOptions = {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'America/Guayaquil'
                };

                return date.toLocaleDateString('es-EC', { ...defaultOptions, ...options });
            } catch (e) {
                return '-';
            }
        };
    }
}

async function ensureAsesorProfileForDocsMobile() {
    const user = window.currentUser;
    if (!user || !user.id) return;

    const hasNombre = !!(user.nombre || user.full_name || user.user_metadata?.full_name);
    const hasCedula = !!user.cedula;
    const hasWhatsapp = !!(user.whatsapp || user.telefono || user.phone || user.user_metadata?.whatsapp);

    if (hasNombre && hasCedula && hasWhatsapp) return;

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        const { data: userProfile, error } = await supabase
            .from('ic_users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !userProfile) return;

        const mergedUser = {
            ...user,
            ...userProfile,
            id: user.id,
            whatsapp: userProfile.whatsapp || userProfile.telefono || user.whatsapp || user.phone || null
        };

        window.currentUser = mergedUser;
    } catch (err) {
        console.warn('No se pudo hidratar perfil del asesor para documentos móviles:', err);
    }
}

async function ensureSolicitudDocsEngineMobile() {
    const docsCssId = 'solicitud-docs-css-mobile-bridge';
    if (!document.getElementById(docsCssId)) {
        const docsCss = document.createElement('link');
        docsCss.id = docsCssId;
        docsCss.rel = 'stylesheet';
        docsCss.href = '../css/solicitud_credito.css';
        document.head.appendChild(docsCss);
    }

    const modalBridgeCssId = 'solicitud-modal-base-mobile-bridge';
    if (!document.getElementById(modalBridgeCssId)) {
        const style = document.createElement('style');
        style.id = modalBridgeCssId;
        style.textContent = `
            #modal-documentos-credito.modal {
                position: fixed;
                inset: 0;
                z-index: 2001;
                display: flex;
                align-items: stretch;
                justify-content: stretch;
                padding: 0;
            }

            #modal-documentos-credito .modal-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.82);
                backdrop-filter: none;
            }

            #modal-documentos-credito .modal-card {
                position: relative;
                z-index: 1;
                width: 100vw;
                height: 100dvh;
                max-width: none;
                max-height: none;
                border-radius: 0;
                border: none;
                box-shadow: none;
                overflow: hidden;
                animation: none;
                transform: none;
                transition: none;
            }

            #modal-documentos-credito .modal-header {
                position: relative;
                padding: 0.85rem 1rem;
                min-height: 56px;
            }

            #modal-documentos-credito .modal-header h3 {
                font-size: 1.05rem;
                line-height: 1.25;
                padding-right: 2.8rem;
            }

            #modal-documentos-credito .modal-close {
                position: absolute;
                top: 50%;
                right: 0.8rem;
                transform: translateY(-50%);
                width: 34px;
                height: 34px;
                border-radius: 8px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            #modal-documentos-credito .modal-body {
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                padding: 1rem;
                padding-bottom: calc(1rem + env(safe-area-inset-bottom));
            }

            #modal-documentos-credito .modal-body > * {
                max-width: 760px;
                margin-left: auto;
                margin-right: auto;
            }

            #modal-documentos-credito .docs-credito-info,
            #modal-documentos-credito .docs-fecha-firma-container,
            #modal-documentos-credito .doc-item {
                border-radius: 14px;
                padding: 0.9rem;
                margin-bottom: 0.7rem;
            }

            #modal-documentos-credito .docs-info-header {
                gap: 0.75rem;
                align-items: flex-start;
            }

            #modal-documentos-credito .docs-info-header h4 {
                font-size: 1rem;
                margin-bottom: 0.2rem;
            }

            #modal-documentos-credito .docs-monto .valor {
                font-size: 2rem;
                line-height: 1.05;
            }

            #modal-documentos-credito .docs-list {
                display: flex;
                flex-direction: column;
                gap: 0.55rem;
                margin-bottom: 0.85rem;
            }

            #modal-documentos-credito .doc-item {
                gap: 0.8rem;
            }

            #modal-documentos-credito .doc-icon {
                width: 40px;
                height: 40px;
                font-size: 1rem;
                border-radius: 10px;
            }

            #modal-documentos-credito .doc-info h5 {
                font-size: 0.88rem;
                margin-bottom: 0.15rem;
            }

            #modal-documentos-credito .doc-info p {
                font-size: 0.76rem;
                line-height: 1.3;
            }

            #modal-documentos-credito .docs-actions-all {
                position: sticky;
                bottom: 0;
                margin: 0;
                padding: 0.9rem 0 calc(1rem + env(safe-area-inset-bottom));
                border-top: 1px solid rgba(148, 163, 184, 0.25);
                background: linear-gradient(180deg, rgba(31, 42, 56, 0.25) 0%, rgba(31, 42, 56, 0.92) 28%, rgba(31, 42, 56, 1) 100%);
                backdrop-filter: blur(4px);
            }

            #modal-documentos-credito .btn-generar-todos {
                margin: 0;
                min-height: 48px;
                border-radius: 12px;
                font-size: 0.95rem;
                box-shadow: none;
                transform: none;
            }

            #modal-documentos-credito .btn-generar-todos:hover {
                transform: none;
                box-shadow: none;
            }

            #modal-documentos-credito .modal-close {
                border: none;
                background: transparent;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    const alreadyReady = typeof window.generarDocumentoSolicitud === 'function'
        && typeof window.generarDocumentoContrato === 'function'
        && typeof window.generarDocumentoPagare === 'function'
        && typeof window.generarDocumentoTablaAmortizacion === 'function'
        && typeof window.abrirModalDocumentosCredito === 'function'
        && typeof window.generarTodosDocumentos === 'function';

    if (alreadyReady) {
        ensureMobileDocGeneratorShims();
        return;
    }

    if (!solicitudDocsEnginePromise) {
        solicitudDocsEnginePromise = new Promise((resolve, reject) => {
            ensureMobileDocGeneratorShims();

            const script = document.createElement('script');
            script.src = '../js/modules/solicitud_credito.js';
            script.onload = () => {
                const loadedOk = typeof window.generarDocumentoSolicitud === 'function'
                    && typeof window.generarDocumentoContrato === 'function'
                    && typeof window.generarDocumentoPagare === 'function'
                    && typeof window.generarDocumentoTablaAmortizacion === 'function'
                    && typeof window.abrirModalDocumentosCredito === 'function'
                    && typeof window.generarTodosDocumentos === 'function';

                if (loadedOk) {
                    resolve();
                } else {
                    reject(new Error('No se pudo inicializar el generador de documentos.'));
                }
            };
            script.onerror = () => reject(new Error('No se pudo cargar el módulo de documentos.'));
            document.body.appendChild(script);
        });
    }

    await solicitudDocsEnginePromise;
}

async function initDesembolsosModule() {
    // Si no se ha verificado el estado de la caja, intentamos hacerlo rápido
    // O si ya está verificado, forzamos la actualización de la UI del alert inyectado
    if (typeof window.checkCajaStatusGlobal === 'function') {
        await window.checkCajaStatusGlobal();
    }

    // El alert se oculta/muestra automáticamente dentro de checkCajaStatusGlobal()
    // si el elemento con id 'caja-cerrada-alert-mobile' ya está en el DOM

    await loadDesembolsosPendientes();
}

async function loadDesembolsosPendientes() {
    const container = document.getElementById('desembolsos-container');
    const countBadge = document.getElementById('desembolsos-count');
    const mainHeader = document.getElementById('mobile-home-main-header');
    const mainIcon = document.getElementById('mobile-home-main-icon');
    const mainTitle = document.getElementById('mobile-home-main-title');
    const homeBadge = document.getElementById('home-pending-count');
    const homeStatus = document.getElementById('mobile-home-status');
    const homeMenu = document.getElementById('mobile-home-menu');
    const desembolsosSection = document.getElementById('home-desembolsos-section');
    const desembolsosTitle = document.getElementById('home-desembolsos-title');
    const polizasTitle = document.getElementById('home-polizas-title');
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();
        const [{ data: creditosPendientes, error }, polizasPendientes] = await Promise.all([
            supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                capital,
                plazo,
                cuota_con_ahorro,
                tasa_interes_mensual,
                garante,
                created_at,
                id_socio
            `)
            .eq('estado_credito', 'PENDIENTE')
                .order('created_at', { ascending: false }),
            loadPolizasPendientesMobile()
        ]);

        if (error) throw error;

        if (!creditosPendientes || creditosPendientes.length === 0) {
            container.innerHTML = '';
            desembolsosSection?.classList.add('hidden');
            if (desembolsosSection) desembolsosSection.style.display = 'none';
            if (countBadge) {
                countBadge.textContent = '0';
                countBadge.classList.add('hidden');
                countBadge.style.display = 'none';
            }
        } else {
            desembolsosSection?.classList.remove('hidden');
            if (desembolsosSection) desembolsosSection.style.display = '';
            if (countBadge) {
                countBadge.textContent = creditosPendientes.length;
                countBadge.classList.remove('hidden');
                countBadge.style.display = '';

                const alertBadge = document.querySelector('.mobile-caja-status-alert .alert-badge');
                if (alertBadge) alertBadge.textContent = creditosPendientes.length;
            }

            const socioIds = [...new Set(creditosPendientes.map(c => c.id_socio))];
            const { data: socios } = await supabase
                .from('ic_socios')
                .select('idsocio, nombre, cedula, whatsapp')
                .in('idsocio', socioIds);

            creditosPendientes.forEach(credito => {
                credito.socio = socios?.find(s => s.idsocio === credito.id_socio) || {};
            });

            creditosData = creditosPendientes;
            if (countBadge) countBadge.textContent = creditosPendientes.length;

            container.innerHTML = creditosPendientes.map(credito => {
                const socio = credito.socio || {};
                const nombreCompleto = socio.nombre || 'Sin nombre';
                const capitalFormatted = parseFloat(credito.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 });
                const cuotaFormatted = parseFloat(credito.cuota_con_ahorro).toLocaleString('es-EC', { minimumFractionDigits: 2 });

                return `
                    <div class="desembolso-card" data-id="${credito.id_credito}">
                        <div class="desembolso-header">
                            <div class="desembolso-socio">
                                <div class="desembolso-nombre">${nombreCompleto}</div>
                                <div class="desembolso-cedula">${socio.cedula || '-'} | ${credito.codigo_credito}</div>
                            </div>
                            <div class="desembolso-monto">
                                <div class="desembolso-monto-valor">$${capitalFormatted}</div>
                                <div class="desembolso-monto-label">Capital</div>
                            </div>
                        </div>
                        <div class="desembolso-info">
                            <div class="desembolso-info-item">
                                <span class="desembolso-info-label">Plazo</span>
                                <span class="desembolso-info-value">${credito.plazo} meses</span>
                            </div>
                            <div class="desembolso-info-item">
                                <span class="desembolso-info-label">Cuota</span>
                                <span class="desembolso-info-value">$${cuotaFormatted}</span>
                            </div>
                            <div class="desembolso-info-item">
                                <span class="desembolso-info-label">Tasa</span>
                                <span class="desembolso-info-value">${credito.tasa_interes_mensual}%</span>
                            </div>
                            <div class="desembolso-info-item">
                                <span class="desembolso-info-label">Garante</span>
                                <span class="desembolso-info-value">${credito.garante ? 'Sí' : 'No'}</span>
                            </div>
                        </div>
                        <div class="desembolso-actions">
                            <button class="desembolso-btn desembolso-btn-docs" onclick="generarDocumentosCreditoMobile('${credito.id_credito}')">
                                <i class="fas fa-file-pdf"></i> Documentos
                            </button>
                            <button class="desembolso-btn desembolso-btn-action" onclick="desembolsarCreditoMobile('${credito.id_credito}')">
                                <i class="fas fa-cloud-upload-alt"></i> Desembolsar
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        renderPolizasPendientesMobile(polizasPendientes);

        const desembolsosTotal = creditosPendientes?.length || 0;
        const polizasTotal = polizasPendientes?.length || 0;
        const totalPendientes = desembolsosTotal + polizasTotal;

        updateMobileHomeMainHeader({
            mainHeader,
            mainIcon,
            mainTitle,
            total: totalPendientes,
            desembolsosTotal,
            polizasTotal
        });

        const onlyOneCategory = (desembolsosTotal > 0 && polizasTotal === 0) || (polizasTotal > 0 && desembolsosTotal === 0);
        desembolsosTitle?.classList.toggle('is-inline-hidden', onlyOneCategory);
        polizasTitle?.classList.toggle('is-inline-hidden', onlyOneCategory);

        if (homeBadge) {
            homeBadge.textContent = totalPendientes;
            homeBadge.classList.toggle('hidden', totalPendientes === 0);
            homeBadge.style.display = totalPendientes === 0 ? 'none' : '';
        }

        if (homeStatus) {
            homeStatus.innerHTML = totalPendientes === 0
                ? `
                    <div class="mobile-home-excellent">
                        <i class="fas fa-circle-check"></i>
                        <h3>Excelente</h3>
                        <p>No tienes procesos pendientes.</p>
                    </div>
                `
                : '';
            homeStatus.style.display = totalPendientes === 0 ? '' : 'none';
        }

        if (homeMenu) {
            homeMenu.classList.toggle('hidden', totalPendientes > 0);
            homeMenu.style.display = totalPendientes > 0 ? 'none' : '';
        }

    } catch (error) {
        console.error('Error loading desembolsos:', error);
        if (homeStatus) {
            homeStatus.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar</h3>
                    <p>No se pudieron cargar los procesos pendientes. Intenta de nuevo.</p>
                </div>
            `;
        }
    }
}

function updateMobileHomeMainHeader({ mainHeader, mainIcon, mainTitle, total, desembolsosTotal, polizasTotal }) {
    if (!mainHeader) return;

    if (total === 0) {
        mainHeader.style.display = 'none';
        return;
    }

    mainHeader.style.display = '';

    let icon = 'fa-bell';
    let title = 'Procesos pendientes';

    if (desembolsosTotal > 0 && polizasTotal === 0) {
        icon = 'fa-hand-holding-usd';
        title = 'Desembolsos pendientes';
    } else if (polizasTotal > 0 && desembolsosTotal === 0) {
        icon = 'fa-file-signature';
        title = 'Pólizas por actualizar';
    }

    if (mainIcon) mainIcon.className = `fas ${icon}`;
    if (mainTitle) mainTitle.textContent = title;
}

async function loadPolizasPendientesMobile() {
    const supabase = window.getSupabaseClient();
    const { data, error } = await supabase
        .from('ic_polizas')
        .select(`
            id_poliza,
            id_socio,
            fecha,
            valor,
            interes,
            plazo,
            fecha_vencimiento,
            valor_final,
            certificado_firmado,
            estado,
            socio:ic_socios (
                idsocio,
                nombre,
                cedula
            )
        `)
        .in('estado', ['PENDIENTE', 'ACTIVO'])
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).filter(poliza => !String(poliza.certificado_firmado || '').trim());
}

function renderPolizasPendientesMobile(polizas) {
    const section = document.getElementById('home-polizas-section');
    const container = document.getElementById('polizas-pendientes-container');
    const count = document.getElementById('polizas-pendientes-count');
    if (!section || !container) return;

    if (!polizas?.length) {
        section.classList.add('hidden');
        section.style.display = 'none';
        container.innerHTML = '';
        if (count) {
            count.textContent = '0';
            count.classList.add('hidden');
            count.style.display = 'none';
        }
        return;
    }

    section.classList.remove('hidden');
    section.style.display = '';
    if (count) {
        count.textContent = polizas.length;
        count.classList.remove('hidden');
        count.style.display = '';
    }

    container.innerHTML = polizas.map(poliza => {
        const socio = poliza.socio || {};
        const valor = parseFloat(poliza.valor || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
        const isActive = poliza.estado === 'ACTIVO';
        return `
            <div class="desembolso-card poliza-mobile-card" data-id="${poliza.id_poliza}">
                <div class="desembolso-header">
                    <div class="desembolso-socio">
                        <div class="desembolso-nombre">${socio.nombre || 'Socio sin nombre'}</div>
                        <div class="desembolso-cedula">${socio.cedula || '-'} | ${isActive ? 'Comprobante pendiente' : 'Activación pendiente'}</div>
                    </div>
                    <div class="desembolso-monto">
                        <div class="desembolso-monto-valor">$${valor}</div>
                        <div class="desembolso-monto-label">Póliza</div>
                    </div>
                </div>
                <div class="desembolso-info poliza-mobile-info">
                    <div class="desembolso-info-item">
                        <span class="desembolso-info-label">Estado</span>
                        <span class="desembolso-info-value">${isActive ? 'Activa' : 'Pendiente'}</span>
                    </div>
                    <div class="desembolso-info-item">
                        <span class="desembolso-info-label">Tasa</span>
                        <span class="desembolso-info-value">${poliza.interes || 0}%</span>
                    </div>
                    <div class="desembolso-info-item">
                        <span class="desembolso-info-label">Vence</span>
                        <span class="desembolso-info-value">${window.formatDate ? window.formatDate(poliza.fecha_vencimiento) : poliza.fecha_vencimiento}</span>
                    </div>
                </div>
                <div class="desembolso-actions">
                    <button class="desembolso-btn desembolso-btn-action" onclick="openPolizaSignedUploadMobile('${poliza.id_poliza}')">
                        <i class="fas fa-camera"></i> Subir firmado
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function openPolizaSignedUploadMobile(idPoliza) {
    const existsInList = Array.from(document.querySelectorAll('.poliza-mobile-card'))
        .some(card => card.dataset.id === idPoliza);
    if (!existsInList) {
        Swal.fire('No encontrado', 'No se encontró la póliza seleccionada.', 'warning');
        return;
    }

    const supabase = window.getSupabaseClient();
    const { data: polizaData, error: loadError } = await supabase
        .from('ic_polizas')
        .select(`
            id_poliza,
            id_socio,
            fecha,
            valor,
            estado,
            socio:ic_socios (
                nombre,
                cedula
            )
        `)
        .eq('id_poliza', idPoliza)
        .single();

    if (loadError) {
        Swal.fire('Error', 'No se pudo cargar la póliza.', 'error');
        return;
    }

    const alreadyActive = polizaData.estado === 'ACTIVO';
    if (!alreadyActive && window.validateCajaBeforeAction && !window.validateCajaBeforeAction('activar póliza')) {
        return;
    }

    openPolizaSignedUploadModalMobile(polizaData, alreadyActive);
}

function openPolizaSignedUploadModalMobile(polizaData, alreadyActive) {
    const existing = document.getElementById('mobile-poliza-upload-modal');
    if (existing) existing.remove();

    const socioNombre = polizaData.socio?.nombre || 'Socio';
    const modalHTML = `
        <div id="mobile-poliza-upload-modal" class="mobile-poliza-modal-overlay">
            <div class="mobile-poliza-modal-backdrop" onclick="closePolizaSignedUploadModalMobile()"></div>
            <div class="mobile-poliza-modal-card">
                <div class="mobile-poliza-modal-header">
                    <div>
                        <h3>${alreadyActive ? 'Subir comprobante firmado' : 'Activar póliza'}</h3>
                        <p>${socioNombre}</p>
                    </div>
                    <button type="button" class="mobile-poliza-modal-close" onclick="closePolizaSignedUploadModalMobile()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="mobile-poliza-modal-body">
                    <div class="mobile-poliza-modal-note">
                        ${alreadyActive ? 'La póliza ya está activa. Solo guardaremos el contrato firmado.' : 'Al subir el contrato firmado, la póliza pasará a estado activo.'}
                    </div>
                    <div class="mobile-poliza-upload-options">
                        <button type="button" class="mobile-poliza-upload-option camera" onclick="document.getElementById('mobile-poliza-camera-input').click()">
                            <i class="fas fa-camera"></i>
                            <span>Tomar foto</span>
                        </button>
                        <button type="button" class="mobile-poliza-upload-option file" onclick="document.getElementById('mobile-poliza-file-input').click()">
                            <i class="fas fa-folder-open"></i>
                            <span>Cargar archivo</span>
                        </button>
                    </div>
                    <input id="mobile-poliza-camera-input" type="file" accept="image/*" capture="environment" hidden onchange="handlePolizaSignedFileMobile('${polizaData.id_poliza}', this.files[0])">
                    <input id="mobile-poliza-file-input" type="file" accept="image/*" hidden onchange="handlePolizaSignedFileMobile('${polizaData.id_poliza}', this.files[0])">
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
}

function closePolizaSignedUploadModalMobile() {
    const modal = document.getElementById('mobile-poliza-upload-modal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
}

async function handlePolizaSignedFileMobile(idPoliza, file) {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
        Swal.fire('Archivo inválido', 'El archivo debe ser una imagen.', 'warning');
        return;
    }

    const supabase = window.getSupabaseClient();
    const { data: polizaData, error: loadError } = await supabase
        .from('ic_polizas')
        .select(`
            id_poliza,
            id_socio,
            fecha,
            valor,
            estado,
            socio:ic_socios (
                nombre,
                cedula
            )
        `)
        .eq('id_poliza', idPoliza)
        .single();

    if (loadError) {
        Swal.fire('Error', 'No se pudo cargar la póliza.', 'error');
        return;
    }

    const alreadyActive = polizaData.estado === 'ACTIVO';
    if (!alreadyActive && window.validateCajaBeforeAction && !window.validateCajaBeforeAction('activar póliza')) {
        return;
    }

    try {
        closePolizaSignedUploadModalMobile();
        Swal.fire({
            title: 'Subiendo...',
            text: 'Optimizando imagen y guardando comprobante.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const uploadResult = await uploadPolizaSignedDocumentMobileToWebp(file, polizaData);
        if (!uploadResult.success) throw new Error(uploadResult.error || 'No se pudo subir el documento.');

        const updateData = {
            certificado_firmado: uploadResult.url,
            updated_at: new Date().toISOString()
        };
        if (!alreadyActive) updateData.estado = 'ACTIVO';

        const { error } = await supabase
            .from('ic_polizas')
            .update(updateData)
            .eq('id_poliza', idPoliza);

        if (error) throw error;

        await Swal.fire(
            alreadyActive ? 'Comprobante guardado' : 'Póliza activada',
            alreadyActive ? 'El contrato firmado fue guardado correctamente.' : 'El contrato firmado fue guardado y la póliza quedó activa.',
            'success'
        );

        await loadDesembolsosPendientes();
    } catch (error) {
        console.error('Error subiendo contrato firmado móvil:', error);
        if (window.showFinancialError) {
            await window.showFinancialError(error, 'No se pudo subir el contrato firmado.');
        } else {
            Swal.fire('Error', error.message || 'No se pudo subir el contrato firmado.', 'error');
        }
    }
}

async function uploadPolizaSignedDocumentMobileToWebp(file, poliza) {
    try {
        if (!file?.type?.startsWith('image/')) {
            throw new Error('El contrato firmado debe ser una imagen.');
        }

        const supabase = window.getSupabaseClient();
        const socioNombre = poliza.socio?.nombre || poliza.id_socio || 'socio';
        const safeSocio = slugMobilePoliza(socioNombre);
        const safeFecha = slugMobilePoliza(poliza.fecha || new Date().toISOString().split('T')[0]);
        const safeValor = slugMobilePoliza(parseFloat(poliza.valor || 0).toFixed(2));
        const path = `contratospolizas/${safeSocio}_${safeFecha}_${safeValor}_${Date.now()}.webp`;
        const blob = await compressMobilePolizaImageToWebp(file);

        const { error } = await supabase.storage
            .from('inkacorp')
            .upload(path, blob, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/webp'
            });

        if (error) throw error;

        const { data } = supabase.storage.from('inkacorp').getPublicUrl(path);
        if (!data?.publicUrl) throw new Error('No se pudo obtener la URL pública.');

        return { success: true, url: data.publicUrl, path };
    } catch (error) {
        return { success: false, error: error.message || 'Error al subir contrato firmado.' };
    }
}

function compressMobilePolizaImageToWebp(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();
        reader.onload = event => {
            img.onload = () => {
                const maxSize = 1600;
                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('No se pudo preparar la imagen.'));
                    return;
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    if (!blob) {
                        reject(new Error('No se pudo convertir la imagen a WebP.'));
                        return;
                    }
                    resolve(blob);
                }, 'image/webp', 0.88);
            };
            img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
    });
}

function slugMobilePoliza(value) {
    return String(value || 'poliza')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .substring(0, 90) || 'poliza';
}

async function desembolsarCreditoMobile(idCredito) {
    // Validar si la caja está abierta antes de continuar
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('realizar desembolsos')) return;
    }

    try {
        const credito = creditosData.find(c => c.id_credito === idCredito);
        if (!credito) {
            Swal.fire('Error', 'No se encontró el crédito seleccionado.', 'error');
            return;
        }

        const supabase = window.getSupabaseClient();
        const { data: docs, error } = await supabase
            .from('ic_creditos_documentos')
            .select('contrato_generado, pagare_generado, tabla_amortizacion_generada, documento_garante_firmado')
            .eq('id_credito', idCredito)
            .maybeSingle();

        if (error) throw error;

        const contratoOk = !!docs?.contrato_generado;
        const pagareOk = !!docs?.pagare_generado;
        const tablaOk = !!docs?.tabla_amortizacion_generada;
        const garanteOk = !credito.garante || !!docs?.documento_garante_firmado;

        if (!(contratoOk && pagareOk && tablaOk && garanteOk)) {
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Primero genere documentos',
                text: 'Antes de desembolsar debes generar todos los documentos del préstamo.',
                showCancelButton: true,
                confirmButtonText: 'Ir a generar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#0B4E32'
            });

            if (result.isConfirmed) {
                generarDocumentosCreditoMobile(idCredito);
            }
            return;
        }

        openDocsModal(idCredito);
    } catch (error) {
        console.error('Error validando documentos generados:', error);
        Swal.fire('Error', 'No se pudo validar el estado de documentos.', 'error');
    }
}

async function generarDocumentosCreditoMobile(idCredito) {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('generar documentos')) return;
    }

    const credito = creditosData.find(c => c.id_credito === idCredito);
    if (!credito) {
        Swal.fire('Error', 'No se encontró el crédito seleccionado.', 'error');
        return;
    }

    try {
        await ensureAsesorProfileForDocsMobile();
        await ensureSolicitudDocsEngineMobile();

        // Abrir exactamente el mismo modal/flujo que se usa en PC.
        // El pequeño defer evita autocierre por el mismo tap que disparó el botón.
        await new Promise(resolve => setTimeout(resolve, 80));
        await window.abrirModalDocumentosCredito(idCredito);
    } catch (error) {
        console.error('Error generando documentos en móvil:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error al generar documentos',
            text: error.message || 'No se pudo completar la generación de documentos.',
            confirmButtonColor: '#0B4E32'
        });
    }
}

function openDocsModal(idCredito) {
    const credito = creditosData.find(c => c.id_credito === idCredito);
    if (!credito) {
        Swal.fire('Error', 'No se encontró el crédito seleccionado.', 'error');
        return;
    }

    const nombreSocio = (credito.socio?.nombre || 'SOCIO').toUpperCase().replace(/\s+/g, '_');
    const tieneGarante = !!credito.garante;

    requiredSlotsForDesembolsoMobile = ['contrato', 'pagare', 'tabla'];
    if (tieneGarante) requiredSlotsForDesembolsoMobile.push('garante');

    selectedFilesForDesembolsoMobile = {
        contrato: null,
        pagare: null,
        tabla: null,
        garante: null
    };

    const existingModal = document.getElementById('mobile-modal-desembolso-archivos');
    if (existingModal) existingModal.remove();

    const docs = [
        { id: 'contrato', label: 'Solicitud / Contrato', icon: 'fa-file-contract' },
        { id: 'pagare', label: 'Pagaré Firmado', icon: 'fa-file-signature' },
        { id: 'tabla', label: 'Tabla de Amortización', icon: 'fa-table' }
    ];

    if (tieneGarante) {
        docs.push({ id: 'garante', label: 'Documento Garante', icon: 'fa-user-shield' });
    }

    const modalHTML = `
        <div id="mobile-modal-desembolso-archivos" class="mobile-docs-modal-overlay">
            <div class="mobile-docs-modal-backdrop" onclick="closeDocsModal()"></div>
            <div class="mobile-docs-modal-card">
                <div class="mobile-docs-modal-header">
                    <h3><i class="fas fa-cloud-upload-alt"></i> Carga de Documentos Firmados</h3>
                    <button type="button" class="mobile-docs-modal-close" onclick="closeDocsModal()"><i class="fas fa-times"></i></button>
                </div>

                <div class="mobile-docs-modal-body">
                    <div class="mobile-docs-note">
                        Suba cada documento por separado. El botón de activación se habilitará cuando todos los archivos estén listos.
                    </div>

                    <div class="mobile-docs-slots">
                        ${docs.map(doc => `
                            <div id="mobile-slot-${doc.id}" class="mobile-doc-slot">
                                <div class="mobile-doc-slot-main">
                                    <div class="mobile-doc-slot-icon"><i class="fas ${doc.icon}"></i></div>
                                    <div class="mobile-doc-slot-text">
                                        <div class="mobile-doc-slot-title">${doc.label}</div>
                                        <div id="mobile-status-${doc.id}" class="mobile-doc-slot-status">Pendiente de carga</div>
                                    </div>
                                </div>

                                <div id="mobile-action-${doc.id}" class="mobile-doc-slot-action">
                                    <button type="button" class="mobile-doc-upload-btn" onclick="document.getElementById('mobile-input-${doc.id}').click()">
                                        <i class="fas fa-upload"></i> Subir
                                    </button>
                                </div>

                                <input type="file" id="mobile-input-${doc.id}" accept="application/pdf,image/*" style="display:none;" onchange="handleFileSelectSlotMobile('${doc.id}', this)">

                                <div id="mobile-progress-container-${doc.id}" class="mobile-doc-progress hidden">
                                    <div class="mobile-doc-progress-track">
                                        <div id="mobile-progress-${doc.id}" class="mobile-doc-progress-bar"></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mobile-docs-footer-actions">
                        <button type="button" class="mobile-docs-cancel-btn" onclick="closeDocsModal()">Cancelar</button>
                        <button id="mobile-btn-confirmar-desembolso" type="button" class="mobile-docs-confirm-btn" onclick="ejecutarDesembolsoConArchivosMobile('${idCredito}', '${nombreSocio}', ${tieneGarante})" disabled>
                            <i class="fas fa-check-circle"></i> Activar Crédito
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
}

function closeDocsModal() {
    const modal = document.getElementById('mobile-modal-desembolso-archivos');
    if (modal) modal.remove();
    document.body.style.overflow = '';
    selectedFilesForDesembolsoMobile = {};
    requiredSlotsForDesembolsoMobile = [];
}

function handleFileSelectSlotMobile(slotId, input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    selectedFilesForDesembolsoMobile[slotId] = file;

    const statusEl = document.getElementById(`mobile-status-${slotId}`);
    const actionEl = document.getElementById(`mobile-action-${slotId}`);
    const slotEl = document.getElementById(`mobile-slot-${slotId}`);

    if (statusEl) {
        statusEl.innerHTML = `<span class="mobile-doc-slot-ok"><i class="fas fa-check"></i> ${file.name}</span>`;
    }

    if (actionEl) {
        actionEl.innerHTML = `
            <button type="button" class="mobile-doc-mini-btn" onclick="document.getElementById('mobile-input-${slotId}').click()"><i class="fas fa-sync-alt"></i></button>
            <button type="button" class="mobile-doc-mini-btn danger" onclick="removeFileFromSlotMobile('${slotId}')"><i class="fas fa-trash-alt"></i></button>
        `;
    }

    if (slotEl) {
        slotEl.classList.add('ready');
    }

    checkAllFilesReadyMobile();
}

function removeFileFromSlotMobile(slotId) {
    selectedFilesForDesembolsoMobile[slotId] = null;

    const statusEl = document.getElementById(`mobile-status-${slotId}`);
    const actionEl = document.getElementById(`mobile-action-${slotId}`);
    const slotEl = document.getElementById(`mobile-slot-${slotId}`);
    const inputEl = document.getElementById(`mobile-input-${slotId}`);

    if (statusEl) statusEl.textContent = 'Pendiente de carga';

    if (actionEl) {
        actionEl.innerHTML = `
            <button type="button" class="mobile-doc-upload-btn" onclick="document.getElementById('mobile-input-${slotId}').click()">
                <i class="fas fa-upload"></i> Subir
            </button>
        `;
    }

    if (slotEl) {
        slotEl.classList.remove('ready');
    }

    if (inputEl) inputEl.value = '';

    checkAllFilesReadyMobile();
}

function checkAllFilesReadyMobile() {
    const btn = document.getElementById('mobile-btn-confirmar-desembolso');
    if (!btn) return;

    const allReady = requiredSlotsForDesembolsoMobile.length > 0 && requiredSlotsForDesembolsoMobile.every(slot => !!selectedFilesForDesembolsoMobile[slot]);
    btn.disabled = !allReady;
}

async function ejecutarDesembolsoConArchivosMobile(idCredito, nombreSocio, tieneGarante) {
    const btn = document.getElementById('mobile-btn-confirmar-desembolso');
    const supabase = window.getSupabaseClient();
    const originalBtn = btn ? btn.innerHTML : '';

    // Validar caja abierta antes de cualquier operación financiera
    if (window.validateCajaBeforeAction && !window.validateCajaBeforeAction('desembolsar este crédito')) {
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        }

        const hoy = new Date();
        const fechaStr = `${hoy.getDate().toString().padStart(2, '0')}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getFullYear()}`;

        const slots = ['contrato', 'pagare', 'tabla'];
        if (tieneGarante) slots.push('garante');

        const columnMap = {
            contrato: { url: 'contrato_url', firmado: 'contrato_firmado' },
            pagare: { url: 'pagare_url', firmado: 'pagare_firmado' },
            tabla: { url: 'tabla_amortizacion_url', firmado: 'tabla_amortizacion_firmada' },
            garante: { url: 'documento_garante_url', firmado: 'documento_garante_firmado' }
        };

        for (const slotId of slots) {
            const file = selectedFilesForDesembolsoMobile[slotId];
            if (!file) throw new Error(`Falta subir el documento: ${slotId}`);

            const progressContainer = document.getElementById(`mobile-progress-container-${slotId}`);
            const progressBar = document.getElementById(`mobile-progress-${slotId}`);
            const statusEl = document.getElementById(`mobile-status-${slotId}`);
            const actionEl = document.getElementById(`mobile-action-${slotId}`);

            if (progressContainer) progressContainer.classList.remove('hidden');
            if (progressBar) progressBar.style.width = '30%';
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Subiendo archivo...';
            if (actionEl) actionEl.innerHTML = '';

            // 1. Subir a bucket 'inkacorp' con subcarpeta unificada
            const uploadRes = await window.uploadFileToStorage(file, 'creditos/documentos', `${idCredito}_${slotId}`, 'inkacorp');
            
            if (!uploadRes.success) {
                throw new Error(`Error al subir ${slotId}: ${uploadRes.error}`);
            }

            const fileLink = uploadRes.url;

            if (progressBar) progressBar.style.width = '70%';
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-database"></i> Registrando en base de datos...';

            const updateData = {};
            updateData[columnMap[slotId].url] = fileLink;
            updateData[columnMap[slotId].firmado] = true;

            const { error: updateError } = await supabase
                .from('ic_creditos_documentos')
                .update(updateData)
                .eq('id_credito', idCredito);

            if (updateError) throw updateError;

            if (progressBar) progressBar.style.width = '100%';
            if (statusEl) statusEl.innerHTML = '<span class="mobile-doc-slot-ok"><i class="fas fa-check-double"></i> Completado</span>';
        }

        await completarActivacionCreditoMobile(idCredito);

        Swal.fire({
            icon: 'success',
            title: 'Crédito activado',
            text: 'Los documentos fueron cargados y el crédito se activó correctamente.',
            confirmButtonColor: '#0B4E32'
        });

        closeDocsModal();
        await loadDesembolsosPendientes();

    } catch (error) {
        console.error('Error en desembolso móvil:', error);
        if (window.showFinancialError) {
            await window.showFinancialError(error, 'No se pudo completar el desembolso.');
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error en desembolso',
                text: error.message || 'No se pudo completar el desembolso.',
                confirmButtonColor: '#0B4E32'
            });
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtn;
        }
    }
}

async function completarActivacionCreditoMobile(idCredito) {
    const supabase = window.getSupabaseClient();
    const currentUser = window.getCurrentUser?.() || window.currentUser;
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    // Cargar datos mínimos del crédito para actualizar la solicitud asociada.
    const { data: infoCredito, error: errorCarga } = await supabase
        .from('ic_creditos')
        .select('id_solicitud')
        .eq('id_credito', idCredito)
        .single();
    
    if (errorCarga) throw new Error('No se pudo obtener la información del crédito: ' + errorCarga.message);

    // El egreso de caja se registra automáticamente por trigger al activar el crédito.
    const { error: errorCredito } = await supabase
        .from('ic_creditos')
        .update({
            estado_credito: 'ACTIVO',
            fecha_desembolso: todayStr,
            updated_at: now
        })
        .eq('id_credito', idCredito);

    if (errorCredito) throw errorCredito;

    // 3. REGISTRAR EN HISTORIAL
    await supabase.from('ic_creditos_historial').insert({
        id_credito: idCredito,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'ACTIVO',
        fecha_cambio: now,
        usuario: currentUser?.id || null,
        motivo: `Desembolso móvil con carga de documentos. Procesado por: ${currentUser?.nombre || 'Sistema'}`
    });

    // 4. ACTUALIZAR SOLICITUD
    if (infoCredito?.id_solicitud) {
        await supabase
            .from('ic_solicitud_de_credito')
            .update({ estado: 'DESEMBOLSADA' })
            .eq('solicitudid', infoCredito.id_solicitud);
    }
}

window.openDocsModal = openDocsModal;
window.closeDocsModal = closeDocsModal;
window.handleFileSelectSlotMobile = handleFileSelectSlotMobile;
window.removeFileFromSlotMobile = removeFileFromSlotMobile;
window.ejecutarDesembolsoConArchivosMobile = ejecutarDesembolsoConArchivosMobile;
window.generarDocumentosCreditoMobile = generarDocumentosCreditoMobile;
window.desembolsarCreditoMobile = desembolsarCreditoMobile;
window.loadDesembolsosPendientes = loadDesembolsosPendientes;
window.openPolizaSignedUploadMobile = openPolizaSignedUploadMobile;
window.closePolizaSignedUploadModalMobile = closePolizaSignedUploadModalMobile;
window.handlePolizaSignedFileMobile = handlePolizaSignedFileMobile;
window.initDesembolsosModule = initDesembolsosModule;
