/* ============================================================
   CARLOS SHOP — Catalogue, commandes, réglages (client du serveur)
   Toutes les données viennent de l'API : partagées entre appareils.
   Nécessite js/auth.js (objet API) chargé avant.
   ============================================================ */
(function () {
  'use strict';
  // Traductions : si EN / AR sont vides, on reprend le français
  function L3(o) {
    o = o || {};
    const fr = o.fr || o.en || o.ar || '';
    return { fr: fr, en: o.en || fr, ar: o.ar || fr };
  }
  function normalize(it) {
    it.name = L3(it.name);
    if (it.lessons !== undefined) it.lessons = L3(it.lessons);
    if (it.desc !== undefined) it.desc = L3(it.desc);
    it.price = Number(it.price) || 0;
    it.oldPrice = Number(it.oldPrice) > it.price ? Number(it.oldPrice) : it.price;
    it.stock = Number.isFinite(Number(it.stock)) ? Number(it.stock) : 0;
    return it;
  }

  const A = () => window.API;
  async function saveItem(kind, it) {
    it = Object.assign({}, it);
    if (/^data:image\//.test(it.image || '')) it.image = (await A().post('/upload', { dataUrl: it.image })).url;
    const base = kind === 'product' ? '/products' : '/training';
    const r = it.id ? await A().put(base + '/' + it.id, it) : await A().post(base, it);
    return normalize(r);
  }
  const Catalog = {
    async ensureSeeded() {},
    isDemo(it) { return it.demo === true; },
    removeDemo() { return A().del('/demo').then(r => (r && r.removed) || 0); },
    async getProducts() { return (await A().get('/products')).map(normalize); },
    async getTraining() { return (await A().get('/training')).map(normalize); },
    saveProduct(p)  { return saveItem('product', p); },
    saveTraining(t) { return saveItem('training', t); },
    removeProduct(id)  { return A().del('/products/' + id); },
    removeTraining(id) { return A().del('/training/' + id); },
    async nextId() { return 0; },
    normalize,
    nm(o, lang) { o = o || {}; return o[lang] || o.fr || o.en || o.ar || ''; },
    cssUrl(u) { return String(u || '').replace(/["'()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); },
    // Photo choisie par l'admin → image réduite (max 700 px) stockée dans la base
    fileToDataURL(file, max) {
      max = max || 700;
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(fr.error);
        fr.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('Image illisible'));
          img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.82));
          };
          img.src = fr.result;
        };
        fr.readAsDataURL(file);
      });
    }
  };

  const METHODS = { card: 'Carte bancaire', paypal: 'PayPal', wave: 'Wave', cash: 'Espèces', mobile: 'Mobile money',
                    orange: 'Orange Money', mtn: 'MTN MoMo', express: 'Express Union' };


  Catalog.METHODS = METHODS;
  Catalog.orders = {
    getAll: () => A().get('/orders'),
    forUser: () => A().get('/orders/mine'),
    create: payload => A().post('/orders', payload),
    setStatus: (key, status) => A().put('/orders/' + key + '/status', { status }),
    cancel: key => A().post('/orders/' + key + '/cancel')
  };
  Catalog.users = { getAll: () => A().get('/users') };
  Catalog.settings = { get: () => A().get('/settings'), save: v => A().put('/settings', v) };
  Catalog.promos = { get: code => A().get('/promos/' + encodeURIComponent(code)) };
  Catalog.reservations = {
    list: () => A().get('/reservations'),
    create: b => A().post('/reservations', b),
    cancel: id => A().post('/reservations/' + id + '/cancel'),
    extend: (id, hours) => A().post('/reservations/' + id + '/extend', { hours })
  };
  window.Catalog = Catalog;
})();
