// Página principal de IEPROES.
// El catálogo sale de public.apps: para mostrar una app nueva basta con agregar
// su fila. Las cuentas son solo por invitación (no hay registro público).

const $ = id => document.getElementById(id);

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const safeUrl = u => (/^(\/|https:\/\/)/.test(u || '') ? u : '#');
const safeColor = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#2d2f74');
const safeIcon = i => (/^fa-[a-z0-9-]+$/.test(i || '') ? i : 'fa-cube');

const ROLES_APP = { lector: 'Lector', editor: 'Editor', admin: 'Admin' };

const Estado = { apps: [], user: null, miembro: null, accesos: new Map(), esAdmin: false };

function aviso(texto, tipo = '') {
    const t = $('toast');
    t.textContent = texto;
    t.className = `toast ${tipo}`;
    t.hidden = false;
    clearTimeout(aviso._t);
    aviso._t = setTimeout(() => { t.hidden = true; }, 3500);
}

function mensaje(id, texto, tipo = '') {
    const el = $(id);
    el.textContent = texto;
    el.className = `msg ${tipo}`;
}

function textoError(err) {
    const m = (err && err.message) || '';
    if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(m)) return 'Esa cuenta todavía no aceptó su invitación.';
    if (/password should be at least|weak/i.test(m)) return 'La contraseña es muy corta o débil (mínimo 8 caracteres).';
    if (/same.*password|different from the old/i.test(m)) return 'La nueva contraseña debe ser distinta a la anterior.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    return m || 'No se pudo completar. Revisa tu conexión.';
}

// ---------- Catálogo ----------
function tarjeta(app) {
    const color = safeColor(app.color);
    let badge = '';
    if (Estado.user) {
        const rol = Estado.accesos.get(app.slug);
        badge = rol
            ? `<span class="badge ok"><i class="fas fa-check"></i> Tienes acceso · ${esc(ROLES_APP[rol] || rol)}</span>`
            : '<span class="badge"><i class="fas fa-lock"></i> Sin acceso</span>';
    }
    return `
        <a class="app-card" href="${esc(safeUrl(app.url))}" style="--app-color: ${color}">
            <span class="app-icon"><i class="fas ${safeIcon(app.icon)}"></i></span>
            <span class="app-text">
                <span class="app-name">${esc(app.name)}</span>
                <span class="app-desc">${esc(app.description)}</span>
            </span>
            <span class="app-foot">
                ${badge}
                <span class="app-open">Abrir <i class="fas fa-arrow-right"></i></span>
            </span>
        </a>`;
}

function pintarApps() {
    const grid = $('appsGrid');
    grid.innerHTML = Estado.apps.length
        ? Estado.apps.map(tarjeta).join('')
        : '<p class="empty">No se pudo cargar la lista de apps. Recarga la página.</p>';
    grid.setAttribute('aria-busy', 'false');
}

async function cargarApps() {
    const { data, error } = await sb.from('apps')
        .select('slug, name, description, url, icon, color, sort_order')
        .order('sort_order').order('name');
    Estado.apps = error || !data ? [] : data;
}

// ---------- Sesión ----------
async function cargarUsuario(session) {
    Estado.user = session ? session.user : null;
    Estado.miembro = null;
    Estado.accesos = new Map();
    Estado.esAdmin = false;
    if (!session) return;

    const uid = session.user.id;
    const [perfil, miembro, accesos] = await Promise.all([
        sb.from('profiles').select('nombre, email').eq('id', uid).maybeSingle(),
        sb.from('miembros').select('rol, activo').eq('user_id', uid).maybeSingle(),
        sb.from('app_access').select('app_slug, rol').eq('user_id', uid)
    ]);
    Estado.nombre = (perfil.data && perfil.data.nombre) || session.user.email;
    Estado.miembro = miembro.data || null;
    const activo = !!(Estado.miembro && Estado.miembro.activo);
    if (activo) (accesos.data || []).forEach(a => Estado.accesos.set(a.app_slug, a.rol));
    Estado.esAdmin = activo && Estado.miembro.rol === 'admin';
}

function pintarSesion() {
    const conSesion = !!Estado.user;
    $('session').hidden = !conSesion;
    $('authPanel').hidden = conSesion;
    $('loginForm').hidden = conSesion;
    $('passwordForm').hidden = true;
    if (conSesion) {
        $('sessionName').textContent = Estado.nombre;
        const activo = Estado.miembro && Estado.miembro.activo;
        $('sectionHint').textContent = !activo
            ? `Hola, ${Estado.nombre}. Tu cuenta todavía no tiene acceso a ninguna app; pídelo a un administrador.`
            : `Hola, ${Estado.nombre}. Estas son las apps de IEPROES.`;
    } else {
        $('sectionHint').textContent = 'Inicia sesión para ver a qué apps tienes acceso.';
    }
    $('adminPanel').hidden = !Estado.esAdmin;
}

function pantallaContrasena(tipo) {
    $('authPanel').hidden = false;
    $('loginForm').hidden = true;
    $('passwordForm').hidden = false;
    const invitacion = tipo === 'invite';
    $('passwordTitle').textContent = invitacion ? 'Bienvenido(a): crea tu contraseña' : 'Elige una contraseña nueva';
    $('passwordHint').textContent = invitacion
        ? 'Tu cuenta de IEPROES ya está creada. Elige una contraseña para entrar a las apps.'
        : 'Escribe tu nueva contraseña para volver a entrar.';
    $('newPassword').focus();
}

async function refrescar() {
    const { data: { session } } = await sb.auth.getSession();
    await cargarUsuario(session).catch(err => console.error(err));
    pintarSesion();
    pintarApps();
    if (Estado.esAdmin && typeof Accesos !== 'undefined') await Accesos.iniciar();
}

// ---------- Formularios ----------
$('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('loginBtn');
    btn.disabled = true;
    mensaje('loginMsg', '');
    try {
        const { error } = await sb.auth.signInWithPassword({
            email: $('loginEmail').value.trim(),
            password: $('loginPassword').value
        });
        if (error) throw error;
        $('loginPassword').value = '';
        await refrescar();
    } catch (err) {
        mensaje('loginMsg', textoError(err), 'error');
    } finally {
        btn.disabled = false;
    }
});

$('forgotBtn').addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    if (!email) { mensaje('loginMsg', 'Escribe tu correo y vuelve a tocar «¿Olvidaste tu contraseña?».', 'error'); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    mensaje('loginMsg', error ? textoError(error)
        : 'Si el correo tiene cuenta, te llegará un enlace para elegir una contraseña nueva.', error ? 'error' : 'ok');
});

$('passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('newPassword').value, b = $('newPassword2').value;
    if (a !== b) { mensaje('passwordMsg', 'Las contraseñas no coinciden.', 'error'); return; }
    const btn = $('passwordBtn');
    btn.disabled = true;
    try {
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) throw error;
        $('newPassword').value = $('newPassword2').value = '';
        history.replaceState(null, '', location.pathname);
        aviso('Contraseña guardada', 'ok');
        await refrescar();
    } catch (err) {
        mensaje('passwordMsg', textoError(err), 'error');
    } finally {
        btn.disabled = false;
    }
});

$('signOutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
});

$('year').textContent = new Date().getFullYear();

// ---------- Arranque ----------
(async () => {
    await cargarApps();
    if (ENLACE_TIPO === 'invite' || ENLACE_TIPO === 'recovery') {
        // supabase-js abre la sesión con el token del enlace; luego se pide la contraseña.
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            await cargarUsuario(session).catch(() => {});
            pintarApps();
            pantallaContrasena(ENLACE_TIPO);
            return;
        }
    }
    const err = new URLSearchParams(location.hash.slice(1)).get('error_description');
    await refrescar();
    if (err) {
        mensaje('loginMsg', /expired|invalid/i.test(err)
            ? 'El enlace ya venció o ya se usó. Pide uno nuevo.' : err, 'error');
        history.replaceState(null, '', location.pathname);
    }
})();
