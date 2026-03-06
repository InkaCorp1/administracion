/**
 * INKA CORP - Configuración Global
 */
// Prevenir redeclaración si el script se carga múltiples veces
if (typeof SUPABASE_URL === 'undefined') {
    var SUPABASE_URL = 'https://lpsupabase.luispintasolutions.com';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.LJEZ3yyGRxLBmCKM9z3EW-Yla1SszwbmvQMngMe3IWA';
}

if (typeof APP_VERSION === 'undefined') {
    var APP_VERSION = '29.1.4';
    window.APP_VERSION = APP_VERSION;
}
