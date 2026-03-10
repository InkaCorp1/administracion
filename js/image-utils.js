/**
 * INKA CORP - Utilidades de Imagen y Storage
 * Funciones para compresión y subida de comprobantes de pago
 */

// ==========================================
// CONFIGURACIÓN
// ==========================================
const STORAGE_BUCKET = 'inkacorp';
const COMPRESSION_CONFIG = {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.8,
    mimeType: 'image/webp'
};

const COMPRESSIBLE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);

// ==========================================
// COMPRESIÓN DE IMAGEN
// ==========================================

/**
 * Comprime una imagen usando Canvas API
 * Si la compresión aumenta el tamaño, retorna el archivo original
 * 
 * @param {File} file - Archivo de imagen a comprimir
 * @param {Object} options - Opciones de compresión
 * @returns {Promise<{blob: Blob, wasCompressed: boolean, originalSize: number, compressedSize: number}>}
 */
async function compressImage(file, options = {}) {
    const config = { ...COMPRESSION_CONFIG, ...options };
    const originalSize = file.size;

    // Si no es imagen, retornar original
    if (!file.type.startsWith('image/')) {
        console.warn('compressImage: El archivo no es una imagen');
        return {
            blob: file,
            wasCompressed: false,
            originalSize,
            compressedSize: originalSize,
            outputMimeType: file.type || 'application/octet-stream',
            outputExtension: getExtensionFromFile(file)
        };
    }

    if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type)) {
        console.warn(`compressImage: Tipo no compatible para compresión (${file.type}). Usando original.`);
        return {
            blob: file,
            wasCompressed: false,
            originalSize,
            compressedSize: originalSize,
            outputMimeType: file.type || 'application/octet-stream',
            outputExtension: getExtensionFromFile(file)
        };
    }

    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.onload = () => {
                // Calcular nuevas dimensiones manteniendo proporción
                let { width, height } = img;

                if (width > config.maxWidth) {
                    height = (height * config.maxWidth) / width;
                    width = config.maxWidth;
                }

                if (height > config.maxHeight) {
                    width = (width * config.maxHeight) / height;
                    height = config.maxHeight;
                }

                // Crear canvas y dibujar imagen redimensionada
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.error('compressImage: No se pudo obtener contexto 2D');
                    resolve({
                        blob: file,
                        wasCompressed: false,
                        originalSize,
                        compressedSize: originalSize,
                        outputMimeType: file.type || 'application/octet-stream',
                        outputExtension: getExtensionFromFile(file)
                    });
                    return;
                }

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Convertir a blob
                canvas.toBlob((blob) => {
                    if (!blob) {
                        console.error('compressImage: Canvas.toBlob retornó null, usando original');
                        resolve({
                            blob: file,
                            wasCompressed: false,
                            originalSize,
                            compressedSize: originalSize,
                            outputMimeType: file.type || 'application/octet-stream',
                            outputExtension: getExtensionFromFile(file)
                        });
                        return;
                    }

                    const compressedSize = blob.size;

                    // Si la compresión aumentó el tamaño, usar original
                    if (compressedSize >= originalSize) {
                        console.log(`compressImage: Compresión ineficiente (${originalSize} -> ${compressedSize} bytes). Usando original.`);
                        resolve({
                            blob: file,
                            wasCompressed: false,
                            originalSize,
                            compressedSize: originalSize,
                            outputMimeType: file.type || 'application/octet-stream',
                            outputExtension: getExtensionFromFile(file)
                        });
                    } else {
                        const savedPercent = Math.round((1 - compressedSize / originalSize) * 100);
                        console.log(`compressImage: Comprimido ${savedPercent}% (${originalSize} -> ${compressedSize} bytes)`);
                        resolve({
                            blob,
                            wasCompressed: true,
                            originalSize,
                            compressedSize,
                            outputMimeType: config.mimeType,
                            outputExtension: getExtensionFromMimeType(config.mimeType)
                        });
                    }
                }, config.mimeType, config.quality);
            };

            img.onerror = () => {
                console.error('compressImage: Error al cargar imagen');
                resolve({
                    blob: file,
                    wasCompressed: false,
                    originalSize,
                    compressedSize: originalSize,
                    outputMimeType: file.type || 'application/octet-stream',
                    outputExtension: getExtensionFromFile(file)
                });
            };

            img.src = e.target.result;
        };

        reader.onerror = () => {
            console.error('compressImage: Error al leer archivo');
            resolve({
                blob: file,
                wasCompressed: false,
                originalSize,
                compressedSize: originalSize,
                outputMimeType: file.type || 'application/octet-stream',
                outputExtension: getExtensionFromFile(file)
            });
        };

        reader.readAsDataURL(file);
    });
}

function getExtensionFromMimeType(mimeType = '') {
    const normalized = String(mimeType).toLowerCase();
    if (normalized === 'image/jpeg') return 'jpg';
    if (normalized === 'image/svg+xml') return 'svg';
    return normalized.split('/')[1] || 'bin';
}

function getExtensionFromFile(file) {
    if (file?.name && file.name.includes('.')) {
        return file.name.split('.').pop().toLowerCase();
    }

    return getExtensionFromMimeType(file?.type || 'application/octet-stream');
}

// ==========================================
// SUBIDA A SUPABASE STORAGE
// ==========================================

/**
 * Sube un archivo (imagen o documento) a Supabase Storage
 * Si es una imagen, la comprime automáticamente antes de subir
 * 
 * @param {File} file - Archivo a subir
 * @param {string} folder - Carpeta de destino (ej: 'pagos', 'socios', 'aportes')
 * @param {string} id - ID relacionado o subcarpeta (ej: idSocio, idCredito)
 * @param {string} bucketName - Nombre del bucket (opcional, usa STORAGE_BUCKET por defecto)
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
async function uploadFileToStorage(file, folder, id, bucketName = STORAGE_BUCKET) {
    try {
        const supabase = window.getSupabaseClient();

        if (!supabase) {
            throw new Error('Cliente Supabase no disponible');
        }

        let uploadBlob = file;
        let wasCompressed = false;
        let originalSize = file.size;
        let compressedSize = file.size;
        let contentType = file.type || 'application/octet-stream';
        let extension = getExtensionFromFile(file);

        // 1. Si es imagen, intentar compresión
        if (file.type && file.type.startsWith('image/')) {
            const compressionRes = await compressImage(file);
            uploadBlob = compressionRes.blob;
            wasCompressed = compressionRes.wasCompressed;
            originalSize = compressionRes.originalSize;
            compressedSize = compressionRes.compressedSize;
            contentType = compressionRes.outputMimeType || contentType;
            extension = compressionRes.outputExtension || extension;
        }

        // 2. Generar nombre único de archivo siguiendo el estándar de carpetas
        const timestamp = Date.now();
        // folder/id/timestamp.extension
        const fileName = `${folder}/${id}/${timestamp}.${extension}`;

        console.log(`uploadFileToStorage: Subiendo ${fileName} (${compressedSize} bytes, tipo: ${contentType})`);

        // 3. Subir a Storage
        const { error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, uploadBlob, {
                cacheControl: '3600',
                upsert: false,
                contentType: contentType
            });

        if (error) {
            console.error('uploadFileToStorage: Error al subir:', error);
            throw error;
        }

        // 4. Obtener URL pública
        const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

        const publicUrl = urlData?.publicUrl;

        if (!publicUrl) {
            throw new Error('No se pudo obtener URL pública');
        }

        return {
            success: true,
            url: publicUrl,
            wasCompressed,
            originalSize,
            compressedSize,
            fileName
        };

    } catch (error) {
        console.error('uploadFileToStorage: Error:', error);
        return {
            success: false,
            error: error.message || 'Error al subir archivo'
        };
    }
}

/**
 * Alias para compatibilidad con módulos existentes que usaban uploadImageToStorage
 */
async function uploadImageToStorage(file, folder, id, bucketName = STORAGE_BUCKET) {
    return uploadFileToStorage(file, folder, id, bucketName);
}

/**
 * Mantiene compatibilidad con la función anterior de pagos
 */
async function uploadReceiptToStorage(file, creditoId, cuotaNumero = '') {
    return uploadFileToStorage(file, 'creditos/pagos', `${creditoId}${cuotaNumero ? '_cuota' + cuotaNumero : ''}`);
}

/**
 * Genera preview de imagen en un elemento
 * 
 * @param {File} file - Archivo de imagen
 * @param {HTMLImageElement} imgElement - Elemento img donde mostrar preview
 * @returns {Promise<void>}
 */
function showImagePreview(file, imgElement) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('No es una imagen válida'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            imgElement.src = e.target.result;
            resolve();
        };
        reader.onerror = () => reject(new Error('Error al leer imagen'));
        reader.readAsDataURL(file);
    });
}

// Exportar funciones para uso global
window.compressImage = compressImage;
window.uploadFileToStorage = uploadFileToStorage;
window.uploadImageToStorage = uploadImageToStorage;
window.uploadReceiptToStorage = uploadReceiptToStorage;
window.showImagePreview = showImagePreview;
