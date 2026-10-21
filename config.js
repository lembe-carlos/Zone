'use strict';
// Configuration : variables d'environnement, ou fichier .env à la racine du projet.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (e) { /* pas de fichier .env : valeurs par défaut */ }

const env = process.env;
module.exports = {
  ROOT,
  PORT: parseInt(env.PORT, 10) || 3000,
  HOST: env.HOST || '0.0.0.0',
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DATA_DIR: path.resolve(ROOT, env.DATA_DIR || 'data'),
  ADMIN_EMAIL: (env.ADMIN_EMAIL || 'admin@carlosshop.com').trim().toLowerCase(),
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  // 'true' derrière HTTPS (cookie « Secure »), 'false' en local, 'auto' = selon la requête
  COOKIE_SECURE: (env.COOKIE_SECURE || 'auto').toLowerCase(),
  // À mettre sur 'true' derrière un proxy HTTPS (Render, Railway, Nginx…)
  TRUST_PROXY: (env.TRUST_PROXY || 'false').toLowerCase() === 'true'
};
