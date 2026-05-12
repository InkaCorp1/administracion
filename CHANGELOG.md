# CHANGELOG - INKA CORP

## [31.0.0] - 2026-05-12
### Caja
- **Caja más confiable:** Los cobros, pagos, desembolsos y devoluciones ahora se reflejan automáticamente en Caja cuando corresponden.
- **Sin caja abierta no se registran movimientos:** Si intentas hacer una operación que mueve dinero, el sistema te avisará que primero debes abrir tu caja.
- **Arqueo más claro:** Caja queda preparada para mostrar cuánto dinero debería haber según los movimientos registrados durante el turno.
- **Mensajes más fáciles de entender:** Si falta caja abierta, usuario identificado o un monto válido, verás una alerta clara en lugar de un error técnico.
- **Aportes separados:** Las aportaciones se mantienen fuera de Caja para no mezclar ese módulo con el dinero operativo del día.

### Pólizas
- **Renovaciones sin inflar Caja:** Cuando una póliza se renueva, el sistema evita contar esa reinversión como si fuera dinero nuevo entrando.

## [30.5.0] - 2026-05-07
### Pólizas
- **Renovar con descuentos completos:** Al renovar una póliza, ahora puedes revisar los créditos normales y preferenciales que se descontarán antes de crear la nueva inversión.
- **Ver el valor real de renovación:** En el modal de renovación verás el valor de la póliza al vencimiento, los descuentos aplicados y el valor final a renovar.
- **Descargar el detalle en PDF:** Desde el modal de renovación puedes descargar un PDF con el detalle de descuentos, pagos registrados y comprobantes cuando correspondan.

### Créditos Preferenciales
- **Registrar pagos desde el crédito:** En créditos preferenciales desembolsados ahora puedes registrar abonos o pago total directamente desde la tabla.
- **Ver saldo actualizado:** La tabla muestra el saldo a hoy considerando intereses y pagos realizados.
- **Consultar pagos en detalles:** Al abrir el detalle de un crédito preferencial verás la lista de pagos registrados, si existen.
- **Archivar pendientes:** Los créditos preferenciales pendientes que ya no se usarán pueden archivarse y quedan separados en la pestaña de archivados.

### Dashboard
- **Alertas urgentes de pólizas vencidas:** Si hay pólizas vencidas pendientes de renovación, el dashboard muestra una alerta prioritaria con acceso directo a Pólizas.

## [30.0.0] - 2026-05-06
### Añadido
- **Renovación de pólizas:** La renovación ahora permite descontar créditos normales y preferenciales antes de crear la nueva inversión.
- **Pagos por descuento:** Los créditos normales descontados registran pagos reales de una cuota o múltiples cuotas, usando el comprobante fijo de descuento.
- **Contrato de renovación:** El PDF muestra el detalle de descuentos después de las cláusulas y antes de firmas.

### Mejorado
- **Ventana de renovación:** Las pólizas pueden renovarse desde 3 días antes hasta 21 días después del vencimiento.
- **Alertas prioritarias:** El dashboard avisa cuando existen pólizas vencidas pendientes de renovación.
- **Service Worker:** Se actualizó la versión visible y de caché a v30.0.0.

## [29.7.4] - 2026-03-18
### Corregido
- **Patch Forzado PWA/SW:** Se incrementó la versión de app y service worker para obligar la recarga del paquete actualizado en escritorio y móvil.
- **Sincronía de Producción:** Se alinearon service worker, configuración global y archivos funcionales de caja y precancelaciones entre raíz y `produccion`.

## [29.7.2] - 2026-03-13
### Corregido
- **Pagos Bancarios PC/Móvil:** El registro de comprobantes en situación bancaria ahora sube el archivo original al bucket `inkacorp`, evitando la ruta antigua que podía fallar con el error de compresión/carga de imagen.

## [29.7.0] - 2026-03-12
### Añadido
- **Precancelaciones Lite en Móvil:** Nueva versión móvil simplificada con listado de créditos, selector de fecha y cálculo rápido del valor a precancelar para créditos nuevos y legacy.

### Mejorado
- **Orden por Categorías en Móvil:** Las precancelaciones móviles ahora muestran primero créditos activos y luego créditos en mora.
- **Autoscroll en PC:** Al calcular una precancelación, el sistema lleva automáticamente al bloque donde se muestra el valor a pagar.

### Corregido
- **Caché de Changelog:** Se limpia el caché de changelog de versiones anteriores y se impone la nueva versión activa.
- **Sincronía de Producción:** Se alinearon archivos de raíz y producción con el último trabajo en PC y móvil.

## [29.6.0] - 2026-03-12
### Añadido
- **Precancelaciones Legacy en PC:** Soporte para créditos legacy o antiguos con tabla ajustada visual y cálculo de precancelación con valores correctos.

### Mejorado
- **Aceptación de Cambios por Versión:** El changelog ahora queda cacheado por versión y seguirá mostrándose al cargar hasta que el usuario acepte explícitamente la actualización.

### Corregido
- **Actualización PWA Obligatoria:** Se alineó la versión de app y service worker, se cachea el changelog versionado y se fuerza la toma del nuevo paquete en escritorio y móvil.

## [29.5.0] - 2026-03-10
### Añadido
- **Módulo Créditos Preferenciales:** Implementado sistema de Estado de Cuenta Global por Socio.
- **Intereses Dinámicos:** Nuevo botón de "Activar Interés" (⚡) que permite configurar tasas (diaria, semanal, mensual, anual) por crédito.
- **Bolsa de Pagos:** Los abonos ahora se registran a nivel de Socio, permitiendo amortizar la deuda total calculada (Capital + Intereses devengados).

## [29.4.0] - 2026-03-10
## [29.3.1] - 2026-03-10

## [29.2.4] - 2026-03-10
### Corregido
- **Forzado de Actualización PWA:** Se elevó el patch y se reforzó la revisión inmediata de `registration.waiting` tras `update()` para que el prompt de actualización no se pierda en escritorio ni móvil.

## [29.2.3] - 2026-03-10
### Corregido
- **Patch PWA/SW Producción:** Se incrementó nuevamente la versión patch para forzar que escritorio y móvil tomen el paquete centralizado de webhooks y utilidades corregidas desde caché limpia.

## [29.2.2] - 2026-03-10
### Corregido
- **Patch PWA/SW:** Se incrementó la versión patch para forzar la propagación del Service Worker y asegurar que clientes con caché anterior reciban el update más reciente.

## [29.2.1] - 2026-03-10
### Mejorado
- **Notificaciones de Pago Uniformes:** El botón de confirmación ahora refleja el estado real del envío de notificaciones en escritorio y móvil, incluyendo confirmación visual para socio y José.
- **Sincronía PWA de Versión:** La interfaz ahora puede refrescar la versión visible desde el Service Worker activo, reduciendo desalineaciones entre caché, móvil y escritorio.

### Corregido
- **Despliegue en Producción:** Se alinearon archivos críticos de créditos, móvil y Service Worker para evitar diferencias entre raíz y producción.

## [29.2.0] - 2026-03-05
### Añadido
- **Estados de Crédito en PDF (PC y Móvil):** Ya se pueden generar documentos PDF del estado de pagos directamente desde el detalle del crédito, incluyendo tabla de amortización y resumen para ponerse al día cuando existe mora.

### Corregido
- **Ahorro Programado en Créditos:** El valor destacado ahora prioriza el ahorro efectivamente cobrado en cuotas pagadas para evitar confusiones con proyecciones totales futuras.

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
