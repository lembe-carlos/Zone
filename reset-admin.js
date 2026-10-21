'use strict';
// Réinitialise le mot de passe de l'administrateur :
//   npm run reset-admin -- NouveauMotDePasse
const crypto = require('crypto');
const D = require('./db');
const { hashPassword } = require('./security');
const cfg = require('./config');
(async () => {
  const pwd = process.argv[2] || crypto.randomBytes(9).toString('base64url');
  if (pwd.length < 8) { console.error('Le mot de passe doit contenir au moins 8 caractères.'); process.exit(1); }
  const admin = D.one("SELECT id,email FROM users WHERE role='admin' LIMIT 1");
  if (!admin) {
    D.run('INSERT INTO users(email,fullname,phone,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)', cfg.ADMIN_EMAIL, 'Administrateur', '', await hashPassword(pwd), 'admin', new Date().toISOString());
    console.log('Compte administrateur créé : ' + cfg.ADMIN_EMAIL);
  } else {
    D.run('UPDATE users SET pass_hash=? WHERE id=?', await hashPassword(pwd), admin.id);
    D.run('DELETE FROM sessions WHERE user_id=?', admin.id);
    console.log('Mot de passe de ' + admin.email + ' réinitialisé.');
  }
  console.log('Nouveau mot de passe : ' + pwd);
})();
