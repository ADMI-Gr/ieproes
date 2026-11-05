// ==================== CONFIGURACIÓN ====================
// Proyecto Supabase compartido por las apps de IEPROES ("IEPROES Apps").
// Es un proyecto distinto al de ADMI: cuentas, datos y accesos no se mezclan.
// La clave es pública por diseño: la seguridad la ponen el login y las políticas RLS.

const SUPABASE_URL = 'https://bjcszktjspyrwdfvmrhm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uLF8h4WgV0xBcXyMIxhnOg_76tWLIMQ';

// Tipo de enlace de correo (invitación / recuperación). Se lee antes de crear
// el cliente porque supabase-js limpia el hash al procesarlo.
const ENLACE_TIPO = new URLSearchParams(location.hash.slice(1)).get('type');

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
