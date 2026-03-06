# CHANGELOG - INKA CORP

## [29.0.0] - 2026-02-23
### Añadido
- **Rediseño del Simulador (Móvil):** Interfaz completa en modo oscuro "Premium" con gradientes, sombras elevadas y tarjetas de resultados de lujo.
- **Módulo de Aportes Avanzado (Móvil):** Implementación de filtrado dual (Por Fecha / Por Socio) mediante un slider conmutador intuitivo.
- **Filtrado de Socios Activos:** Lógica optimizada para mostrar únicamente socios con aportes registrados en el historial.
- **Cabeceras Modernizadas (Floating Pill):** Sistema global de cabeceras flotantes con soporte para truncado inteligente de nombres largos y alineación de distintivos.

### Mejorado
- **Tipografía Mobile:** Estandarización de peso de fuente a 800 (Extra Bold) para solucionar problemas de renderizado en dispositivos móviles antiguos.
- **UX de Búsqueda:** Búsqueda híbrida de socios (ID / Nombre) en el historial de aportes para mayor resiliencia ante errores de base de datos.
- **Gestión de Créditos:** Mejoras en la visualización de la cartera de créditos y alineación con el nuevo sistema de diseño.

## [27.5.2] - 2026-02-20
### Corregido
- **Estandarización de Modales (Móvil):** Se unificaron los estilos de modales en una arquitectura global mejorada. Todos los modales ahora tienen scroll vertical garantizado, soporte para áreas seguras de iPhone (notch) y una animación de apertura más fluida.
- **Resolución de Conflictos CSS:** Se eliminaron definiciones redundantes de modales en archivos de módulos individuales para asegurar un comportamiento único y predecible.

## [27.5.1] - 2026-02-20
### Corregido
- **Scroll en Modal de Documentos (Móvil):** Se corrigió un problema de visualización donde el botón de "Descargar Todos" era inaccesible en pantallas pequeñas. El modal ahora se expande a pantalla completa y permite scroll vertical suave en dispositivos táctiles.

## [27.5.0] - 2026-02-20
### Añadido
- **Transferencias Inter-Cajas (PC y Móvil):** Sistema de envío de dinero en tiempo real entre compañeros con confirmación segura.
- **Validación Automática de Caja:** El sistema detecta si la caja está abierta antes de permitir el envío o la recepción de fondos.
- **Alertas de Transferencia Entrante:** Notificación visual tipo banner en el dashboard móvil para transferencias pendientes.
- **Nuevo Dashboard de Acciones (Móvil):** Rediseño total de los botones de Ingreso, Egreso y Transferir con iconos grandes y gradientes intuitivos.

### Mejorado
- **UX de Modales Móviles:** Apertura instantánea de modales de transferencia para mejorar la percepción de velocidad.
- **Esquema de Base de Datos:** Corrección de referencias cruzadas entre `ic_usuarios` e `ic_users` en el módulo móvil de caja.

---

## [27.2.0] - 2026-02-20
### Añadido
- **Almacenamiento Centralizado (Bucket inkacorp):** Se unificó la subida de todos los documentos y comprobantes al bucket único `inkacorp`.
- **Estructura de Carpetas (Organizativo):** Implementación de jerarquía de archivos (`documentos_creditos`, `pagos`, `caja`, `aportes`, `socios`) para un mantenimiento superior.
- **Compresión Automática:** Integración de la utilidad `image-utils.js` en todos los procesos de subida (PC y Móvil), optimizando el espacio en el servidor.

### Mejorado
- **Velocidad de Carga (STORAGE DIRECTO):** Se eliminó el uso de webhooks externos para el procesamiento de documentos, realizando la subida directa a Supabase Storage.
- **Corrección de Errores (PC y Móvil):** Se resolvió un error de sintaxis en la consola móvil causado por la redeclaración de variables en scripts duplicados.

---

## [27.1.0] - 2026-02-20
### Añadido
- **Auditoría de Desembolsos:** Los desembolsos de créditos (PC y Móvil) ahora registran automáticamente un **EGRESO** en Caja.
- **Evidencia Digital:** Se vincula automáticamente la URL del **Pagaré Firmado** como comprobante del movimiento en la bitácora de caja.
- **Integración Bancaria con Caja:** Soporte para referencias de texto (TRX-...) en movimientos de caja, permitiendo auditar pagos bancarios directamente.

### Mejorado
- **UX Móvil:** Se optimizó la visualización de la alerta de "Caja Cerrada", ocultándola por defecto para evitar parpadeos visuales durante la carga inicial de sesión.
- **Estabilidad de Datos:** Corrección de tipos en base de datos (`id_referencia` a TEXT) para mayor flexibilidad en integraciones de terceros.

---

## [27.0.0] - 2026-02-19
### Añadido
- **Módulo de Control de Caja (MAJOR RELEASE):**
  - Sistema centralizado de Apertura, Cierre y Arqueo de Caja.
  - Auditoría forzada: Integración de Triggers en base de datos para prevenir registros financieros sin sesión de caja activa.
  - Seguridad en UI: Bloqueo de modales de pago y banners de advertencia persistentes.
  - Generación de reportes de cierre en PDF con desglose detallado.
- **UX Improvements:** 
  - Botón de acceso directo en el Dashboard para apertura de caja.
  - Estilo visual profesional (remoción de elementos informales).

### Actualizado
- Versión Mayor del Service Worker (v27.0.0) para optimización de caché global.
- Estabilidad de las pasarelas de pago y validaciones de caja.

---

## [26.0.2] - 2026-02-19
### Corregido
- En el módulo de Créditos, los nombres de los socios se han cambiado de gris oscuro a blanco para una mejor legibilidad sobre fondo oscuro.
- Mejora visual en dispositivos móviles: Los encabezados de los modales ahora tienen fondo verde con letras blancas (estilo corporativo).

## [26.0.1] - 2026-02-19
### Añadido
- Nueva gestión de actualizaciones de la aplicación.
- Sistema de visualización de cambios (Changelog) post-actualización.
- Notificaciones de nuevas versiones detectadas sin recarga forzada inmediata.

### Mejorado
- Estabilidad del Service Worker en dispositivos móviles y escritorio.
- Interfaz de usuario para notificaciones de actualización.
- Control de versiones interno v26.0.1.

---
© 2026 INKA CORP - LP Solutions
