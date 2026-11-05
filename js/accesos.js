// Pantalla "Accesos" (solo administradores de IEPROES).
// Las escrituras van directo a public.miembros y public.app_access: las políticas
// RLS solo las permiten a un admin activo. Aquí no se crean cuentas.

const Accesos = {
    personas: [],
    _iniciado: false,

    async iniciar() {
        if (!this._iniciado) {
            this._iniciado = true;
            $('peopleBody').addEventListener('change', e => this.cambio(e));
        }
        await this.cargar();
    },

    selectRol(slug, uid, actual) {
        const opciones = [['', 'Sin acceso'], ...Object.entries(ROLES_APP)];
        return `<select data-app="${esc(slug)}" data-user="${esc(uid)}" aria-label="Acceso a ${esc(slug)}">
            ${opciones.map(([v, t]) => `<option value="${v}"${v === (actual || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}
        </select>`;
    },

    async cargar() {
        const [perfiles, miembros, accesos] = await Promise.all([
            sb.from('profiles').select('id, email, nombre').order('nombre'),
            sb.from('miembros').select('user_id, rol, activo'),
            sb.from('app_access').select('user_id, app_slug, rol')
        ]);
        const error = perfiles.error || miembros.error || accesos.error;
        if (error) { aviso('No se pudo cargar la lista de accesos', 'error'); console.error(error); return; }

        const porMiembro = new Map(miembros.data.map(m => [m.user_id, m]));
        this.personas = perfiles.data
            .filter(p => porMiembro.has(p.id))
            .map(p => ({
                ...p,
                miembro: porMiembro.get(p.id),
                accesos: new Map(accesos.data.filter(a => a.user_id === p.id).map(a => [a.app_slug, a.rol]))
            }));
        this.pintar();
    },

    pintar() {
        $('peopleHead').innerHTML = `<tr>
            <th>Persona</th><th>Rol</th><th>Activo</th>
            ${Estado.apps.map(a => `<th>${esc(a.name)}</th>`).join('')}
        </tr>`;
        $('peopleBody').innerHTML = this.personas.map(p => {
            const yo = p.id === Estado.user.id;
            const m = p.miembro;
            return `<tr class="${m.activo ? '' : 'inactivo'}">
                <td><div class="who"><b>${esc(p.nombre || '—')}</b>${yo ? ' <span class="tag">tú</span>' : ''}<small>${esc(p.email)}</small></div></td>
                <td><select data-rol="${esc(p.id)}" aria-label="Rol de ${esc(p.nombre || p.email)}"${yo ? ' disabled title="No puedes cambiar tu propio rol"' : ''}>
                    <option value="personal"${m.rol === 'personal' ? ' selected' : ''}>Personal</option>
                    <option value="admin"${m.rol === 'admin' ? ' selected' : ''}>Administrador</option>
                </select></td>
                <td><input type="checkbox" data-activo="${esc(p.id)}"${m.activo ? ' checked' : ''}${yo ? ' disabled title="No puedes desactivarte"' : ''} aria-label="Activo"></td>
                ${Estado.apps.map(a => `<td>${this.selectRol(a.slug, p.id, p.accesos.get(a.slug))}</td>`).join('')}
            </tr>`;
        }).join('');
    },

    async guardar(promesa, ok) {
        const { error } = await promesa;
        if (error) {
            aviso(/administrador/i.test(error.message) ? error.message : 'No se pudo guardar: ' + error.message, 'error');
        } else {
            aviso(ok, 'ok');
        }
        await refrescar(); // recarga tu sesión (por si cambió tu propio acceso) y la tabla
    },

    async cambio(e) {
        const el = e.target;
        if (el.dataset.rol) {
            await this.guardar(sb.from('miembros').update({ rol: el.value }).eq('user_id', el.dataset.rol), 'Rol actualizado');
        } else if (el.dataset.activo) {
            await this.guardar(sb.from('miembros').update({ activo: el.checked }).eq('user_id', el.dataset.activo),
                el.checked ? 'Persona activada' : 'Persona desactivada: ya no entra a ninguna app');
        } else if (el.dataset.app && el.dataset.user) {
            const { app, user } = el.dataset;
            await this.guardar(
                el.value
                    ? sb.from('app_access').upsert({ user_id: user, app_slug: app, rol: el.value, otorgado_por: Estado.user.id })
                    : sb.from('app_access').delete().eq('user_id', user).eq('app_slug', app),
                el.value ? 'Acceso actualizado' : 'Acceso quitado');
        }
    }
};
