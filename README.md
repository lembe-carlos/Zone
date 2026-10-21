# CARLOS SHOP — version avec serveur et base de données

Les comptes, le catalogue, les commandes et les réservations sont maintenant stockés **sur le serveur**
(base SQLite dans le dossier `data/`). Tous les appareils voient les mêmes données.

## Démarrer sur votre ordinateur (Windows)

1. Installez **Node.js 22.13 ou plus récent** (version LTS) : https://nodejs.org
2. Décompressez complètement le zip.
3. Double-cliquez sur **start.bat**. Le navigateur s'ouvre sur http://localhost:3000.
4. **Notez le mot de passe administrateur** affiché dans la fenêtre noire au premier démarrage
   (il n'est affiché qu'une fois). Compte : `admin@carlosshop.com`.

Autres systèmes : `npm start` (ou `./start.sh`).
Aucune installation de paquet n'est nécessaire (aucun `npm install`).

## Administrateur

- Connexion avec le compte administrateur → bouton Admin : produits, formations (avec envoi de photos), stock, commandes, clients, paramètres.
- **Changer le mot de passe** : Admin → Paramètres → « Sécurité du compte administrateur ».
- **Mot de passe oublié** : `npm run reset-admin -- NouveauMotDePasse` (sur la machine du serveur).
- Choisir le mot de passe dès le départ : variable `ADMIN_PASSWORD` (voir `.env.example`), avant le premier démarrage.

## Mettre en ligne

Il faut un hébergeur qui exécute Node.js (VPS, Render, Railway, Fly.io…) avec :
- **un disque persistant** monté sur le dossier des données (`DATA_DIR`) — sinon les données disparaissent à chaque redémarrage ;
- **HTTPS** (indispensable : les mots de passe circulent sur le réseau) ;
- les variables `COOKIE_SECURE=true` et `TRUST_PROXY=true` si un proxy gère le HTTPS ;
- `ADMIN_PASSWORD` robuste avant le premier démarrage.
Un `Dockerfile` est fourni (monter un volume sur `/data`). Cette mise en ligne n'a pas été testée sur un hébergeur réel.

## Sauvegarde

Copiez régulièrement le dossier `data/` (base `carlos.db` + `uploads/`), serveur arrêté de préférence.

## Sécurité en place

Mots de passe hachés (scrypt), sessions par cookie HttpOnly, droits admin vérifiés par le serveur,
prix/remises/livraison/stock recalculés côté serveur, limitation des tentatives de connexion,
contrôle d'origine (CSRF), envoi de photos vérifié (JPEG/PNG/WebP).

## Limites connues

- Paiements **simulés** : aucune vraie transaction, aucune donnée de carte n'est envoyée ni stockée.
- Pas d'envoi d'emails ni de « mot de passe oublié » pour les clients.
- Panier conservé dans le navigateur (non partagé entre appareils) ; la page d'accueil et la boutique ont chacune leur panier.
- L'assistant IA de la page d'accueil nécessite une clé/service non fournis (il ne répond pas).
- Les visuels du catalogue d'exemple sont des illustrations, à remplacer par vos photos depuis l'admin.
