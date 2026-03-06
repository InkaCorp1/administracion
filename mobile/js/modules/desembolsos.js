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
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();
        const { data: creditosPendientes, error } = await supabase
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
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!creditosPendientes || creditosPendientes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>Sin desembolsos pendientes</h3>
                    <p>No hay créditos pendientes de desembolso en este momento.</p>
                </div>
            `;
            if (countBadge) {
                countBadge.textContent = '0';
                countBadge.classList.add('hidden');
            }
            return;
        }

        if (countBadge) {
            countBadge.textContent = creditosPendientes.length;
            countBadge.classList.remove('hidden');
            
            // Actualizar el badge dinámico de la alerta de caja si existe
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

    } catch (error) {
        console.error('Error loading desembolsos:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar</h3>
                    <p>No se pudieron cargar los desembolsos. Intenta de nuevo.</p>
                </div>
            `;
        }
    }
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
        Swal.fire({
            icon: 'error',
            title: 'Error en desembolso',
            text: error.message || 'No se pudo completar el desembolso.',
            confirmButtonColor: '#0B4E32'
        });

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

    // CARGAR DATOS DEL CRÉDITO PARA REGISTRO EN CAJA
    const { data: infoCredito, error: errorCarga } = await supabase
        .from('ic_creditos')
        .select('capital, codigo_credito, id_socio, id_solicitud')
        .eq('id_credito', idCredito)
        .single();
    
    if (errorCarga) throw new Error('No se pudo obtener la información del crédito: ' + errorCarga.message);

    // OBTENER NOMBRE DEL SOCIO
    const { data: socioData } = await supabase
        .from('ic_socios')
        .select('nombre')
        .eq('idsocio', infoCredito.id_socio)
        .single();
    
    const nombreSocio = socioData?.nombre || 'SOCIO DESCONOCIDO';

    // OBTENER URL DEL PAGARÉ (Para comprobante en Caja)
    const { data: docData } = await supabase
        .from('ic_creditos_documentos')
        .select('pagare_url')
        .eq('id_credito', idCredito)
        .single();

    const pagareUrl = docData?.pagare_url || null;

    // 1. REGISTRAR EL EGRESO EN CAJA (Si hay caja abierta)
    if (window.sysCajaAbierta) {
        // Buscar id_apertura activo del usuario
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (userId) {
            const { data: cajaData } = await supabase
                .from('ic_caja_aperturas')
                .select('id_apertura')
                .eq('id_usuario', userId)
                .eq('estado', 'ABIERTA')
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .single();

            if (cajaData) {
                const { error: errorMov } = await supabase
                    .from('ic_caja_movimientos')
                    .insert({
                        id_apertura: cajaData.id_apertura,
                        tipo_movimiento: 'EGRESO',
                        categoria: 'DESEMBOLSO_CREDITO',
                        monto: infoCredito.capital,
                        metodo_pago: 'TRANSFERENCIA',
                        descripcion: `DESEMBOLSO DE CRÉDITO ${infoCredito.codigo_credito} A: ${nombreSocio}`,
                        comprobante_url: pagareUrl,
                        id_referencia: idCredito,
                        tabla_referencia: 'ic_creditos',
                        id_usuario: userId
                    });
                
                if (errorMov) console.error('[CAJA] Error registrando desembolso:', errorMov);
            }
        }
    }

    // 2. ACTUALIZAR ESTADO DEL CRÉDITO A ACTIVO
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

