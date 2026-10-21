'use strict';
// CARLOS SHOP : serveur web + API (zéro dépendance, Node 22.13 ou plus récent)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const D = require('./db');
const S = require('./security');

// ------------------------------------------------------------ utilitaires
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const bad = (m, extra) => new HttpError(400, m, extra);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

function send(res, status, body, headers) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(data);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Requête trop volumineuse')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const o = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(o && typeof o === 'object' ? o : {}); }
      catch (e) { reject(bad('JSON invalide')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isSecure(req) {
  if (cfg.COOKIE_SECURE === 'true') return true;
  if (cfg.COOKIE_SECURE === 'false') return false;
  return !!req.socket.encrypted || (cfg.TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}
function clientIp(req) {
  if (cfg.TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}
const str = (v, max, label) => {
  const s = String(v == null ? '' : v).trim();
  if (s.length > max) throw bad((label || 'Champ') + ' trop long');
  return s;
};
const int = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad((label || 'Valeur') + ' invalide');
  return n;
};
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

// ------------------------------------------------------------ sessions
function startSession(req, res, userId, remember) {
  const token = S.newToken();
  const ttl = remember ? 30 * 24 * 3600e3 : 24 * 3600e3;
  D.run('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', S.sha256(token), userId, Date.now() + ttl, Date.now());
  const cookie = ['sid=' + token, 'HttpOnly', 'SameSite=Lax', 'Path=/'];
  if (remember) cookie.push('Max-Age=' + Math.floor(ttl / 1000));
  if (isSecure(req)) cookie.push('Secure');
  return cookie.join('; ');
}
const clearCookie = req => 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (isSecure(req) ? '; Secure' : '');
function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const row = D.one(`SELECT u.id,u.email,u.fullname,u.phone,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`, S.sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}
const publicUser = u => ({ id: u.id, fullname: u.fullname, email: u.email, phone: u.phone || '', role: u.role });

// ------------------------------------------------------------ catalogue
const J = s => { try { return s ? JSON.parse(s) : undefined; } catch (e) { return undefined; } };
function itemOut(r) {
  const o = { id: r.id, kind: r.kind, name: J(r.name_json) || { fr: '' }, desc: J(r.desc_json), price: r.price, oldPrice: r.old_price,
    stock: r.stock, minStock: r.min_stock, rating: r.rating, emoji: r.emoji || '', image: r.image || '', demo: !!r.demo, updatedAt: r.updated_at };
  if (r.kind === 'product') { o.cat = r.cat; o.tag = r.tag || null; }
  else { o.lessons = J(r.lessons_json); o.color = r.color || ''; }
  return o;
}
const CATS = ['electronics', 'digital', 'accessories'], TAGS = ['new', 'hot', 'sale', 'digital'];
function l3(o, label, required) {
  o = (o && typeof o === 'object') ? o : {};
  const fr = str(o.fr, 300, label);
  if (required && !fr) throw bad(label + ' (FR) obligatoire');
  return { fr, en: str(o.en, 300, label) || fr, ar: str(o.ar, 300, label) || fr };
}
function checkImage(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.length > 500) throw bad('Lien d\'image trop long');
  if (s.startsWith('/uploads/') && !s.includes('..')) return s;
  if (/^images\/[\w\-./]+$/.test(s) && !s.includes('..')) return s;
  if (/^https?:\/\/[^\s"'<>()]+$/i.test(s)) return s;
  throw bad('Image invalide : envoyez la photo avec le formulaire ou collez un lien https://');
}
function dropUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const f = path.join(cfg.DATA_DIR, 'uploads', path.basename(url));
  fs.unlink(f, () => {});
}
function validateItem(kind, b, existing) {
  const m = Object.assign({}, existing || {}, b);
  const out = { kind };
  out.name = l3(m.name, 'Nom', true);
  out.desc = l3(m.desc, 'Description', kind === 'training');
  out.price = int(m.price, 0, 1e9, 'Prix');
  const old = m.oldPrice === '' || m.oldPrice == null ? 0 : int(m.oldPrice, 0, 1e9, 'Ancien prix');
  out.oldPrice = old > out.price ? old : 0;
  out.emoji = str(m.emoji, 8, 'Emoji');
  out.image = checkImage(m.image);
  out.demo = m.demo ? 1 : 0;
  if (kind === 'product') {
    if (!CATS.includes(m.cat)) throw bad('Catégorie invalide');
    out.cat = m.cat;
    out.stock = int(m.stock, 0, 1e6, 'Stock');
    out.minStock = int(m.minStock == null ? 5 : m.minStock, 0, 1e6, 'Stock minimum');
    out.tag = TAGS.includes(m.tag) ? m.tag : null;
    const r = Number(m.rating); out.rating = r >= 0 && r <= 5 ? r : 4.5;
    out.lessons = null; out.color = null;
  } else {
    out.cat = null; out.stock = 999; out.minStock = 0; out.tag = null; out.rating = 4.5;
    out.lessons = l3(m.lessons, 'Contenu', true);
    const c = String(m.color || '#7c3aed'); out.color = /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#7c3aed';
  }
  return out;
}
function writeItem(kind, id, v) {
  const now = new Date().toISOString();
  const vals = [v.cat, JSON.stringify(v.name), JSON.stringify(v.desc), v.lessons ? JSON.stringify(v.lessons) : null, v.price, v.oldPrice, v.stock, v.minStock, v.tag, v.rating, v.emoji, v.color, v.image, v.demo, now];
  if (id) {
    D.run(`UPDATE items SET cat=?,name_json=?,desc_json=?,lessons_json=?,price=?,old_price=?,stock=?,min_stock=?,tag=?,rating=?,emoji=?,color=?,image=?,demo=?,updated_at=? WHERE id=? AND kind=?`, ...vals, id, kind);
    return id;
  }
  return Number(D.run(`INSERT INTO items(cat,name_json,desc_json,lessons_json,price,old_price,stock,min_stock,tag,rating,emoji,color,image,demo,updated_at,kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, kind).lastInsertRowid);
}

// ------------------------------------------------------------ commandes
const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const METHODS = ['card', 'paypal', 'wave', 'orange', 'mtn', 'express', 'cash', 'mobile'];
function orderOut(o, items) {
  return { key: String(o.id), id: 'CMD-' + String(o.id).padStart(5, '0'), date: o.created_at, customerName: o.customer_name || o.email || 'Client',
    email: o.email || '', phone: o.phone || '', address: o.address || '', notes: o.notes || '',
    items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, image: i.image || '' })),
    subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, method: o.method || '', promo: o.promo_code || '',
    status: o.status, reservationId: o.reservation_id || null };
}
function loadOrders(where, ...p) {
  const rows = D.q(`SELECT * FROM orders ${where} ORDER BY id DESC`, ...p);
  const stmt = D.db.prepare('SELECT name,qty,price,image FROM order_items WHERE order_id=? ORDER BY id');
  return rows.map(o => orderOut(o, stmt.all(o.id)));
}
function createOrder(user, b) {
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw bad('Panier vide ou invalide');
  const want = new Map();
  for (const it of b.items) {
    const id = int(it.id != null ? it.id : it.productId, 1, 1e9, 'Article');
    const qty = int(it.qty != null ? it.qty : it.quantity, 1, 99, 'Quantité');
    want.set(id, (want.get(id) || 0) + qty);
  }
  const method = METHODS.includes(b.method) ? b.method : 'cash';
  return D.tx(() => {
    const lines = []; let subtotal = 0;
    for (const [id, qty] of want) {
      const r = D.one('SELECT * FROM items WHERE id=?', id);
      if (!r) throw bad('Un article de votre panier n\'existe plus. Rechargez la page.');
      if (r.kind === 'product' && r.stock < qty) throw new HttpError(409, `Stock insuffisant pour « ${J(r.name_json).fr} » (reste ${r.stock}).`);
      lines.push({ r, qty }); subtotal += r.price * qty;
    }
    let discount = 0, promoCode = '';
    if (b.promoCode) {
      const p = D.one('SELECT * FROM promos WHERE code=? AND active=1', String(b.promoCode).trim().toUpperCase());
      if (!p) throw bad('Code promo invalide');
      promoCode = p.code; discount = Math.round(subtotal * p.discount);
    }
    let shipping = 0, name = user.fullname, phone = user.phone || '', address = '', notes = '';
    if (b.delivery && typeof b.delivery === 'object') {
      const d = b.delivery, set = D.getSettings();
      name = (str(d.firstName, 60) + ' ' + str(d.lastName, 60)).trim() || user.fullname;
      phone = str(d.phone, 40, 'Téléphone'); if (!phone) throw bad('Téléphone obligatoire');
      const addr = str(d.address, 200, 'Adresse'), city = str(d.city, 80, 'Ville');
      if (!addr || !city) throw bad('Adresse et ville obligatoires');
      address = [addr, str(d.district, 80), city, str(d.postal, 20)].filter(Boolean).join(', ');
      notes = str(d.notes, 500, 'Notes');
      shipping = subtotal >= set.freeShippingFrom ? 0 : set.shippingFee;
    }
    let reservationId = null;
    if (b.reservationId) {
      const rv = D.one('SELECT * FROM reservations WHERE id=? AND user_id=?', int(b.reservationId, 1, 1e9), user.id);
      if (!rv || rv.status !== 'active' || rv.expires_at < Date.now()) throw bad('Cette réservation n\'est plus active');
      if (lines.length !== 1 || lines[0].r.id !== rv.item_id) throw bad('Réservation incompatible avec le panier');
      reservationId = rv.id;
    }
    const total = subtotal - discount + shipping;
    const oid = Number(D.run(`INSERT INTO orders(user_id,customer_name,email,phone,address,notes,method,promo_code,subtotal,discount,shipping,total,status,created_at,reservation_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, user.id, name, user.email, phone, address, notes, method, promoCode, subtotal, discount, shipping, total, 'pending', new Date().toISOString(), reservationId).lastInsertRowid);
    for (const { r, qty } of lines) {
      D.run('INSERT INTO order_items(order_id,item_id,name,price,qty,image) VALUES(?,?,?,?,?,?)', oid, r.id, J(r.name_json).fr, r.price, qty, r.image || '');
      if (r.kind === 'product') D.run('UPDATE items SET stock = stock - ? WHERE id=?', qty, r.id);
    }
    if (reservationId) D.run("UPDATE reservations SET status='completed', paid_at=?, pay_method=? WHERE id=?", Date.now(), method, reservationId);
    return loadOrders('WHERE id=?', oid)[0];
  });
}
// Annulation / réactivation : le stock suit
function changeStatus(id, status) {
  return D.tx(() => {
    const o = D.one('SELECT * FROM orders WHERE id=?', id);
    if (!o) throw new HttpError(404, 'Commande introuvable');
    if (o.status !== status) {
      const lines = D.q(`SELECT oi.item_id,oi.qty,i.kind,i.stock,i.name_json FROM order_items oi LEFT JOIN items i ON i.id=oi.item_id WHERE oi.order_id=?`, id);
      if (status === 'cancelled') {
        for (const l of lines) if (l.kind === 'product') D.run('UPDATE items SET stock = stock + ? WHERE id=?', l.qty, l.item_id);
      } else if (o.status === 'cancelled') {
        for (const l of lines) if (l.kind === 'product' && l.stock < l.qty) throw new HttpError(409, `Stock insuffisant pour « ${J(l.name_json).fr} » : impossible de réactiver la commande.`);
        for (const l of lines) if (l.kind === 'product') D.run('UPDATE items SET stock = stock - ? WHERE id=?', l.qty, l.item_id);
      }
      D.run('UPDATE orders SET status=? WHERE id=?', status, id);
    }
    return loadOrders('WHERE id=?', id)[0];
  });
}

// ------------------------------------------------------------ réservations
const resvOut = r => ({ id: r.id, productId: r.item_id, qty: r.qty, durationHours: r.duration_hours, notes: r.notes || '', status: r.status,
  createdAt: r.created_at, expiresAt: r.expires_at, paidAt: r.paid_at || null, payMethod: r.pay_method || null });
const getResv = (id, uid) => { const r = D.one('SELECT * FROM reservations WHERE id=? AND user_id=?', id, uid); if (!r) throw new HttpError(404, 'Réservation introuvable'); return r; };

// ------------------------------------------------------------ upload de photos
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('Image invalide (JPEG, PNG ou WebP)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'Image trop lourde (3 Mo max)');
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const ext = isJpg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
  if (!ext) throw bad('Le fichier n\'est pas une image valide');
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'uploads', name), buf);
  return '/uploads/' + name;
}

// ------------------------------------------------------------ routes
const routes = [];
function route(method, pattern, opts, handler) {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts, handler });
}

// ----- état
route('GET', '/api/health', { public: true }, () => ({ ok: true }));

// ----- authentification
route('POST', '/api/auth/register', { public: true, auth: 'rate' }, async ({ body, req, res }) => {
  const fullname = str(body.fullname, 100, 'Nom'), email = str(body.email, 150).toLowerCase(), phone = str(body.phone, 40);
  const password = String(body.password || '');
  if (!fullname) throw bad('Nom obligatoire');
  if (!EMAIL_RE.test(email)) throw bad('Adresse email invalide');
  if (password.length < 8) throw bad('Le mot de passe doit contenir au moins 8 caractères');
  if (password.length > 200) throw bad('Mot de passe trop long');
  if (email === cfg.ADMIN_EMAIL) throw bad('Cet email est réservé à l\'administrateur. Utilisez « Se connecter ».');
  if (D.one('SELECT id FROM users WHERE email=?', email)) throw new HttpError(409, 'Un compte existe déjà avec cet email');
  const id = Number(D.run('INSERT INTO users(email,fullname,phone,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)',
    email, fullname, phone, await S.hashPassword(password), 'client', new Date().toISOString()).lastInsertRowid);
  return { status: 201, headers: { 'Set-Cookie': startSession(req, res, id, false) }, body: { user: publicUser({ id, fullname, email, phone, role: 'client' }) } };
});
route('POST', '/api/auth/login', { public: true, auth: 'rate' }, async ({ body, req, res }) => {
  const email = str(body.email, 150).toLowerCase(), password = String(body.password || '');
  const u = D.one('SELECT * FROM users WHERE email=?', email);
  const ok = await S.verifyPassword(password, u ? u.pass_hash : S.DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Email ou mot de passe incorrect');
  return { headers: { 'Set-Cookie': startSession(req, res, u.id, !!body.remember) }, body: { user: publicUser(u) } };
});
route('POST', '/api/auth/logout', { public: true }, ({ req }) => {
  const t = parseCookies(req).sid; if (t) D.run('DELETE FROM sessions WHERE token_hash=?', S.sha256(t));
  return { headers: { 'Set-Cookie': clearCookie(req) }, body: { ok: true } };
});
route('GET', '/api/auth/me', ({ user }) => ({ user: publicUser(user) }));
route('POST', '/api/auth/password', async ({ user, body, req }) => {
  const full = D.one('SELECT * FROM users WHERE id=?', user.id);
  if (!(await S.verifyPassword(String(body.current || ''), full.pass_hash))) throw new HttpError(403, 'Mot de passe actuel incorrect');
  const next = String(body.next || '');
  if (next.length < 8 || next.length > 200) throw bad('Le nouveau mot de passe doit contenir au moins 8 caractères');
  D.run('UPDATE users SET pass_hash=? WHERE id=?', await S.hashPassword(next), user.id);
  // on garde la session actuelle, on ferme les autres
  const keep = S.sha256(parseCookies(req).sid || '');
  D.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', user.id, keep);
  return { ok: true };
});

// ----- catalogue (lecture : comptes connectés ; écriture : admin)
route('GET', '/api/products', () => D.q("SELECT * FROM items WHERE kind='product' ORDER BY id").map(itemOut));
route('GET', '/api/training', () => D.q("SELECT * FROM items WHERE kind='training' ORDER BY id").map(itemOut));
for (const [kind, base] of [['product', '/api/products'], ['training', '/api/training']]) {
  route('POST', base, { admin: true }, ({ body }) => {
    const v = validateItem(kind, body); v.demo = 0;
    const id = writeItem(kind, null, v);
    return { status: 201, body: itemOut(D.one('SELECT * FROM items WHERE id=?', id)) };
  });
  route('PUT', base + '/:id', { admin: true }, ({ params, body }) => {
    const id = int(params.id, 1, 1e9);
    const row = D.one('SELECT * FROM items WHERE id=? AND kind=?', id, kind);
    if (!row) throw new HttpError(404, 'Introuvable');
    const old = itemOut(row);
    const v = validateItem(kind, body, old);
    writeItem(kind, id, v);
    if (old.image !== v.image) dropUpload(old.image);
    return itemOut(D.one('SELECT * FROM items WHERE id=?', id));
  });
  route('DELETE', base + '/:id', { admin: true }, ({ params }) => {
    const id = int(params.id, 1, 1e9);
    const row = D.one('SELECT * FROM items WHERE id=? AND kind=?', id, kind);
    if (!row) throw new HttpError(404, 'Introuvable');
    D.run('DELETE FROM items WHERE id=?', id); dropUpload(row.image);
    return { ok: true };
  });
}
route('DELETE', '/api/demo', { admin: true }, () => {
  const rows = D.q('SELECT id,image FROM items WHERE demo=1');
  D.run('DELETE FROM items WHERE demo=1');
  return { removed: rows.length };
});
route('POST', '/api/upload', { admin: true, maxBody: 5 * 1024 * 1024 }, ({ body }) => ({ url: saveImage(body.dataUrl) }));

// ----- promos & réglages
route('GET', '/api/promos/:code', ({ params }) => {
  const p = D.one('SELECT * FROM promos WHERE code=? AND active=1', String(params.code).toUpperCase());
  if (!p) throw new HttpError(404, 'Code promo invalide');
  return { code: p.code, discount: p.discount, label: J(p.label_json) || { fr: '', en: '', ar: '' } };
});
route('GET', '/api/settings', () => D.getSettings());
route('PUT', '/api/settings', { admin: true }, ({ body }) => {
  const v = {};
  for (const k of ['storeName', 'email', 'phone', 'address', 'hours', 'description']) if (body[k] !== undefined) v[k] = str(body[k], k === 'description' ? 1000 : 200, k);
  for (const k of ['shippingFee', 'freeShippingFrom']) if (body[k] !== undefined) v[k] = int(body[k], 0, 1e9, k);
  if (body.deliveryDays !== undefined) v.deliveryDays = int(body.deliveryDays, 1, 365, 'Délai');
  return D.saveSettings(v);
});

// ----- commandes
route('POST', '/api/orders', ({ user, body }) => ({ status: 201, body: createOrder(user, body) }));
route('GET', '/api/orders/mine', ({ user }) => loadOrders('WHERE user_id=?', user.id));
route('GET', '/api/orders', { admin: true }, () => loadOrders(''));
route('PUT', '/api/orders/:id/status', { admin: true }, ({ params, body }) => {
  if (!STATUSES.includes(body.status)) throw bad('Statut invalide');
  return changeStatus(int(params.id, 1, 1e9), body.status);
});
route('POST', '/api/orders/:id/cancel', ({ user, params }) => {
  const id = int(params.id, 1, 1e9);
  const o = D.one('SELECT * FROM orders WHERE id=? AND user_id=?', id, user.id);
  if (!o) throw new HttpError(404, 'Commande introuvable');
  if (!['pending', 'processing'].includes(o.status)) throw bad('Cette commande ne peut plus être annulée');
  return changeStatus(id, 'cancelled');
});

// ----- clients
route('GET', '/api/users', { admin: true }, () =>
  D.q("SELECT id,fullname,email,phone,role,created_at FROM users ORDER BY id").map(u => ({ id: u.id, fullname: u.fullname, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at })));

// ----- réservations (propres à chaque compte)
route('GET', '/api/reservations', ({ user }) => {
  D.run("UPDATE reservations SET status='expired' WHERE user_id=? AND status='active' AND expires_at < ?", user.id, Date.now());
  return D.q('SELECT * FROM reservations WHERE user_id=? ORDER BY id', user.id).map(resvOut);
});
route('POST', '/api/reservations', ({ user, body }) => {
  const itemId = int(body.productId, 1, 1e9, 'Article'), qty = int(body.qty, 1, 99, 'Quantité'), hours = int(body.durationHours, 1, 168, 'Durée');
  if (!D.one('SELECT id FROM items WHERE id=?', itemId)) throw bad('Article introuvable');
  const now = Date.now();
  const id = Number(D.run('INSERT INTO reservations(user_id,item_id,qty,duration_hours,notes,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
    user.id, itemId, qty, hours, str(body.notes, 500, 'Notes'), 'active', now, now + hours * 3600e3).lastInsertRowid);
  return { status: 201, body: resvOut(D.one('SELECT * FROM reservations WHERE id=?', id)) };
});
route('POST', '/api/reservations/:id/cancel', ({ user, params }) => {
  const r = getResv(int(params.id, 1, 1e9), user.id);
  if (r.status === 'active') D.run("UPDATE reservations SET status='cancelled' WHERE id=?", r.id);
  return resvOut(D.one('SELECT * FROM reservations WHERE id=?', r.id));
});
route('POST', '/api/reservations/:id/extend', ({ user, params, body }) => {
  const r = getResv(int(params.id, 1, 1e9), user.id), h = int(body.hours, 1, 168, 'Durée');
  if (r.status !== 'active' || r.expires_at < Date.now()) throw bad('Réservation expirée');
  D.run('UPDATE reservations SET expires_at = expires_at + ?, duration_hours = duration_hours + ? WHERE id=?', h * 3600e3, h, r.id);
  return resvOut(D.one('SELECT * FROM reservations WHERE id=?', r.id));
});

// ------------------------------------------------------------ traitement des requêtes
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };

async function handleApi(req, res, pathname) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    // protection CSRF : JSON obligatoire + même origine
    if (!/^application\/json/i.test(req.headers['content-type'] || '') && Number(req.headers['content-length'] || 0) > 0) throw new HttpError(415, 'Content-Type JSON requis');
    const origin = req.headers.origin;
    if (origin) { let h; try { h = new URL(origin).host; } catch (e) { h = ''; } if (h !== req.headers.host) throw new HttpError(403, 'Origine refusée'); }
  }
  let match = null, params = {};
  let pathMatched = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    match = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break;
  }
  if (!match) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Méthode non autorisée' : 'Route inconnue');
  const o = match.opts;
  let user = null;
  if (!o.public) {
    user = currentUser(req);
    if (!user) throw new HttpError(401, 'Connexion requise');
    if (o.admin && user.role !== 'admin') throw new HttpError(403, 'Accès réservé à l\'administrateur');
  }
  if (o.auth === 'rate' && S.rateLimited(clientIp(req) + ':auth', 15, 60e3)) throw new HttpError(429, 'Trop de tentatives. Réessayez dans une minute.');
  const body = (method === 'GET' || method === 'HEAD') ? {} : await readBody(req, o.maxBody || 1024 * 1024);
  const out = await match.handler({ req, res, params, body, user, query: new URL(req.url, 'http://x').searchParams });
  if (out && out.body !== undefined && (out.status || out.headers)) return send(res, out.status || 200, out.body, out.headers);
  return send(res, 200, out);
}

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': cache || (/\.(html|js|css)$/.test(ext) ? 'no-cache' : 'public, max-age=3600') }, SEC_HEADERS));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function handleStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.includes('\0')) { res.writeHead(400); return res.end(); }
  if (rel.startsWith('/uploads/')) {
    const f = path.join(cfg.DATA_DIR, 'uploads', path.basename(rel));
    return serveFile(req, res, f, 'public, max-age=86400');
  }
  if (rel === '/' ) rel = '/index.html';
  const f = path.normalize(path.join(cfg.PUBLIC_DIR, rel));
  if (!f.startsWith(cfg.PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(req, res, f);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else if (req.method === 'GET' || req.method === 'HEAD') handleStatic(req, res, pathname);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    if (e instanceof HttpError) { if (!res.headersSent) send(res, e.status, Object.assign({ error: e.message }, e.extra || {})); }
    else { console.error('Erreur serveur :', e); if (!res.headersSent) send(res, 500, { error: 'Erreur interne du serveur' }); }
  }
});

async function start() {
  D.seedIfEmpty();
  D.purgeSessions();
  setInterval(D.purgeSessions, 3600e3).unref();
  const admin = await D.ensureAdmin();
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(cfg.PORT, cfg.HOST, ok); });
  const line = '─'.repeat(60);
  console.log('\n' + line + '\n  CARLOS SHOP est en marche\n  → http://localhost:' + cfg.PORT + '\n  Données : ' + cfg.DATA_DIR + '\n' + line);
  if (admin) {
    console.log('  Compte administrateur créé :\n     email        : ' + admin.email + '\n     mot de passe : ' + admin.password +
      (admin.generated ? '\n  ⚠ Notez ce mot de passe maintenant : il ne sera plus affiché.\n    (vous pourrez le changer dans Admin → Paramètres)' : '') + '\n' + line);
  }
}
if (require.main === module) start().catch(e => { console.error(e.code === 'EADDRINUSE' ? 'Le port ' + cfg.PORT + ' est déjà utilisé. Fermez l\'autre application ou changez PORT.' : e); process.exit(1); });
module.exports = { server, start };
