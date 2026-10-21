/* ============================================================
   CARLOS SHOP — Authentification + client API (serveur)
   Inclus dans TOUTES les pages : <script src="js/auth.js"></script>
   Les comptes vivent sur le serveur ; le navigateur ne garde qu'un
   cookie de session (HttpOnly, invisible pour le JavaScript).
   ============================================================ */
(function () {
  'use strict';

  // ---------- Appels au serveur ----------
  async function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let r;
    try { r = await fetch('/api' + url, opt); }
    catch (e) { const er = new Error('Serveur injoignable. Vérifiez votre connexion.'); er.status = 0; throw er; }
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      const er = new Error((data && data.error) || ('Erreur ' + r.status));
      er.status = r.status;
      if (r.status === 401 && !/\/auth\/(login|register|password)/.test(url)) AuthCS._expired();
      throw er;
    }
    return data;
  }
  window.API = {
    get: u => api('GET', u), post: (u, b) => api('POST', u, b || {}),
    put: (u, b) => api('PUT', u, b || {}), del: u => api('DELETE', u)
  };

  const CACHE = 'cs_user';
  const AuthCS = {
    isReservedEmail(email) { return false; }, // contrôlé par le serveur
    getUser() {
      try { const s = localStorage.getItem(CACHE); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    _set(u) { try { u ? localStorage.setItem(CACHE, JSON.stringify(u)) : localStorage.removeItem(CACHE); } catch (e) {} },
    isAdmin(user) { user = user || this.getUser(); return !!user && user.role === 'admin'; },
    authPage() { return 'index.html'; },
    _expired() {
      this._set(null);
      if (!/(^|\/)(index|connexion)\.html$|\/$/.test(location.pathname)) location.replace('connexion.html');
    },

    // Interroge le serveur : renvoie l'utilisateur connecté ou null
    async verify() {
      try { const r = await window.API.get('/auth/me'); this._set(r.user); return r.user; }
      catch (e) { if (e.status === 401) this._set(null); return this.getUser(); }
    },

    // Début de chaque page protégée (synchrone : cache) + vérification serveur en arrière-plan
    requireAuth() {
      if (!this.getUser()) {
        document.documentElement.style.visibility = 'hidden';
        window.location.replace(this.authPage());
        return false;
      }
      this.verify().then(u => { if (!u) this._expired(); else this.mountUserMenu(); });
      return true;
    },
    requireAdmin() {
      if (!this.requireAuth()) return false;
      if (!this.isAdmin()) {
        alert('⛔ Accès réservé aux administrateurs.');
        window.location.replace('accueil.html');
        return false;
      }
      return true;
    },
    // Pages index / connexion : si la session est valable, aller à l'application
    async redirectIfLoggedIn() {
      const u = await this.verify();
      if (u) window.location.replace('accueil.html');
    },

    async register(fullname, email, phone, password) {
      const r = await window.API.post('/auth/register', { fullname, email, phone, password });
      this._set(r.user); return r.user;
    },
    async login(email, password, remember) {
      const r = await window.API.post('/auth/login', { email, password, remember: !!remember });
      this._set(r.user); return r.user;
    },
    async logout() {
      try { await window.API.post('/auth/logout'); } catch (e) {}
      this._set(null);
      try { sessionStorage.clear(); } catch (e) {}
      window.location.href = 'connexion.html';
    },
    changePassword(current, next) { return window.API.post('/auth/password', { current, next }); },

    // Panier : une clé par compte, pour ne pas mélanger deux clients sur le même navigateur
    cartKey(base) { const u = this.getUser(); return (base || 'cart') + ':' + (u ? u.email : ''); },

    mountUserMenu() {
      const user = this.getUser();
      if (!user) return;
      if (!this.isAdmin(user)) document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
      const nav = document.querySelector('.navbar');
      if (!nav || nav.querySelector('.user-menu')) return;
      const host = nav.querySelector('.nav-actions') || nav;
      const box = document.createElement('div');
      box.className = 'user-menu';
      box.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:12px;font-size:.85rem;';
      const name = document.createElement('span');
      name.textContent = '👤 ' + (user.fullname || user.email);
      name.style.cssText = 'color:#e2e8f0;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = 'Déconnexion';
      btn.style.cssText = 'background:transparent;border:1px solid #ef4444;color:#ef4444;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600;font-size:.8rem;';
      btn.addEventListener('click', () => AuthCS.logout());
      box.appendChild(name); box.appendChild(btn); host.appendChild(box);
    }
  };
  window.AuthCS = AuthCS;
  document.addEventListener('DOMContentLoaded', () => AuthCS.mountUserMenu());
})();
