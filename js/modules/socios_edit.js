/**
 * INKA CORP - Módulo de Edición de Socios (Pantalla Completa)
 */

let currentSocioEdit = null;
let imageFiles = {}; // { fieldName: { blob: Blob, previewUrl: string } }

async function initSociosEditModule() {
    const socioId = sessionStorage.getItem('edit_socio_id');
    if (!socioId) {
        showToast('No se seleccionó ningún socio para editar', 'error');
        window.loadView('socios');
        return;
    }

    try {
        await loadSocioToEdit(socioId);
        setupEditEvents();
    } catch (error) {
        console.error('Error inicializando edición:', error);
        showToast('Error al cargar datos del socio', 'error');
    }
}

async function loadSocioToEdit(socioId) {
    const supabase = window.getSupabaseClient();
    const { data, error } = await supabase
        .from('ic_socios')
        .select('*')
        .eq('idsocio', socioId)
        .single();

    if (error) throw error;
    currentSocioEdit = data;

    // Poblar formulario
    const form = document.getElementById('form-edit-socio');
    if (!form) return;

    // Campos de texto simples
    const fields = [
        'nombre', 'cedula', 'whatsapp', 'domicilio', 'paisresidencia', 
        'estadocivil', 'nombreconyuge', 'cedulaconyuge', 'whatsappconyuge', 
        'nombrereferencia', 'whatsappreferencia'
    ];

    fields.forEach(field => {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            input.value = data[field] || '';
        }
    });

    // Cargar previsualizaciones de imágenes existentes
    const imageFields = ['fotoidentidad', 'fotodomicilio', 'fotobien', 'fotofirma', 'fotodocumentoconyuge'];
    imageFields.forEach(field => {
        const preview = document.getElementById(`preview-${field}`);
        if (preview && data[field]) {
            preview.innerHTML = `
                <img src="${data[field]}" alt="Previsualización" 
                     onerror="this.style.display='none'; this.parentElement.classList.add('doc-corrupto');">
                <div class="doc-placeholder corrupto-msg" style="display:none; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-sync-alt" style="font-size: 1.5rem; color: #ef4444"></i>
                    <span style="font-size: 0.8rem; color: #ef4444; font-weight: 600;">Actualizar Imagen</span>
                </div>
            `;
            preview.style.backgroundImage = 'none';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
        }
    });

    // Controlar visibilidad de cónyuge si no aplica
    toggleConyugeSection(data.estadocivil);
}

function setupEditEvents() {
    const btnBack = document.getElementById('btn-back-to-socios');
    const btnSave = document.getElementById('btn-save-socio');
    const form = document.getElementById('form-edit-socio');
    const estadoCivilSelect = document.getElementById('edit-estado-civil');

    if (btnBack) {
        btnBack.onclick = () => window.loadView('socios');
    }

    if (estadoCivilSelect) {
        estadoCivilSelect.onchange = (e) => toggleConyugeSection(e.target.value);
    }

    // Manejo de carga de imágenes
    const imageCards = document.querySelectorAll('.image-upload-card');
    imageCards.forEach(card => {
        const field = card.dataset.field;
        const fileInput = document.getElementById(`file-${field}`);
        
        card.onclick = () => fileInput.click();

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showToast('Por favor selecciona un archivo de imagen válido', 'warning');
                return;
            }

            const preview = document.getElementById(`preview-${field}`);
            preview.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Procesando...</span>';

            try {
                // Comprimir y convertir a WebP (0.8 calidad)
                const result = await processSocioImage(file);
                
                // Generar URL para previsualización local
                const previewUrl = URL.createObjectURL(result.blob);
                preview.innerHTML = `<img src="${previewUrl}" alt="Previsualización">`;
                preview.style.backgroundImage = 'none';

                // Guardar en el objeto de pendientes de subida
                imageFiles[field] = {
                    blob: result.blob,
                    previewUrl: previewUrl,
                    fileName: `${field}.webp`
                };

                showToast(`Imagen ${field} preparada (${Math.round(result.blob.size/1024)} KB)`, 'info');
            } catch (err) {
                console.error('Error procesando imagen:', err);
                showToast('No se pudo procesar la imagen', 'error');
                preview.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Error</span>';
            }
        };
    });

    if (btnSave) {
        btnSave.onclick = saveSocioChanges;
    }
}

function toggleConyugeSection(estadoCivil) {
    const section = document.getElementById('section-conyuge');
    const conyugeCard = document.querySelector('.conyuge-doc');
    const lCase = (estadoCivil || '').toLowerCase();
    const noAplica = ['soltero', 'soltera', 'divorciado', 'divorciada', 'viudo', 'viuda'].some(s => lCase.includes(s));

    if (noAplica) {
        section?.classList.add('muted');
        conyugeCard?.classList.add('hidden');
        // Opcional: Limpiar campos o deshabilitar
    } else {
        section?.classList.remove('muted');
        conyugeCard?.classList.remove('hidden');
    }
}

/**
 * Procesa la imagen: Redimensiona, convierte a WebP y comprime al 0.8
 */
async function processSocioImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.onload = () => {
                const maxWidth = 1600;
                const maxHeight = 1600;
                let { width, height } = img;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Fondo blanco para transparencia en webp si se desea, o dejar transparente
                ctx.drawImage(img, 0, 0, width, height);

                // Convertir a WebP con calidad 0.8
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve({ blob });
                    } else {
                        reject(new Error('Error al generar Blob WebP'));
                    }
                }, 'image/webp', 0.8);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveSocioChanges() {
    const btnSave = document.getElementById('btn-save-socio');
    const statusText = document.getElementById('save-status');
    const form = document.getElementById('form-edit-socio');

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    statusText.textContent = 'Subiendo archivos...';

    try {
        const supabase = window.getSupabaseClient();
        const socioId = currentSocioEdit.idsocio;
        const socioNombre = (document.getElementById('edit-nombre').value || 'SinNombre').replace(/\s+/g, '_').toUpperCase();

        // 1. Subir imágenes nuevas al bucket
        const updatedImageUrls = {};
        for (const [field, data] of Object.entries(imageFiles)) {
            const filePath = `socios/${socioNombre}/${data.fileName}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('inkacorp')
                .upload(filePath, data.blob, {
                    upsert: true,
                    contentType: 'image/webp'
                });

            if (uploadError) throw uploadError;

            // Obtener URL pública
            const { data: urlData } = supabase.storage
                .from('inkacorp')
                .getPublicUrl(filePath);

            updatedImageUrls[field] = urlData.publicUrl;
        }

        // 2. Preparar objeto de actualización de BD
        const formData = new FormData(form);
        const updates = Object.fromEntries(formData.entries());
        
        // Combinar con las nuevas URLs de imagen
        Object.assign(updates, updatedImageUrls);
        
        // Añadir metadata
        updates.updated_at = new Date().toISOString();

        // 3. Ejecutar actualización en Supabase
        const { error: updateError } = await supabase
            .from('ic_socios')
            .update(updates)
            .eq('idsocio', socioId);

        if (updateError) throw updateError;

        showToast('Socio actualizado correctamente', 'success');
        statusText.textContent = 'Cambios guardados';
        
        // Recargar datos locales en app.js si existe el caché
        if (window.setCacheData) {
            // Esto es un poco simplista, lo ideal sería actualizar el array existente
            const currentSocios = window.getCacheData('socios') || [];
            const index = currentSocios.findIndex(s => s.idsocio === socioId);
            if (index !== -1) {
                currentSocios[index] = { ...currentSocios[index], ...updates };
                window.setCacheData('socios', currentSocios);
            }
        }

        // Regresar después de un breve delay
        setTimeout(() => {
            window.loadView('socios');
        }, 1500);

    } catch (error) {
        console.error('Error al guardar cambios:', error);
        showToast('No se pudieron guardar los cambios: ' + error.message, 'error');
        statusText.textContent = 'Error al guardar';
        btnSave.disabled = false;
        btnSave.innerHTML = '<i class="fas fa-save"></i> <span>Guardar Cambios</span>';
    }
}

// Exponer globalmente para app.js
window.initSociosEditModule = initSociosEditModule;
