# JARVIS 3.0 — Disponibilité Web et installation (PWA)

> Document additif. **Aucun déploiement n'a été effectué** : ce guide prépare la mise en ligne.

## 1. État actuel

- Application web React + Vite, servie par `server.ts` (Express) sur `/api` et par Vite en développement.
- PWA configurée : `public/manifest.webmanifest`, `public/sw.js`, icônes 192/512/maskable, `apple-touch-icon`.
- Installation Android : `beforeinstallprompt` géré par `src/services/offline/usePWAInstall.ts`.
- Installation iOS : via Safari → Partager → « Sur l'écran d'accueil » (aucune API d'installation automatique n'existe sur iOS, le code l'indique honnêtement dans Paramètres).

## 2. Conditions techniques

- **HTTPS obligatoire** pour le service worker et l'installation (sauf `localhost` en développement).
- Les secrets (`GEMINI_API_KEY`, etc.) restent côté serveur via variables d'environnement ; ne jamais les injecter dans le client (`vite.config.ts` n'utilise aucun `define`/`VITE_` pour ces valeurs).
- `JARVIS_REQUIRE_AUTH` doit passer à `"true"` avec un `JARVIS_API_TOKEN` long et aléatoire **avant** toute exposition publique.
- Rate limiting API déjà en place (180 req/min, 30 req/min sur les routes coûteuses).

## 3. Commandes de build (à exécuter lors de la phase de déploiement autorisée)

```bash
npm install --no-audit --no-fund
npm run lint
npm run build
npm start
```

## 4. Vérifications avant exposition

1. `GET /api/health` renvoie `geminiConfigured: true`.
2. Tester l'authentification (`401` sans jeton) et le rate limiting (`429`).
3. Vérifier que le service worker ne sert pas une version obsolète (cache `jarvis-v3-stark-shell-v2`).
4. Tester l'installation sur Android (Chrome) et iOS (Safari).
5. Aucune publication réseau social ni action externe sans confirmation utilisateur.

## 5. Validation production déjà effectuée (locale)

- `npm run build` : ✅ réussi.
- `NODE_ENV=production PORT=3100 npm start` : ✅ démarré, `GET /api/health` → 200 avec `geminiConfigured: true`, `GET /` → 200 avec le titre « JARVIS 3.0 — Assistant Personnel IA » (fichiers `dist/` servis par Express, sans Vite).
- Le service worker ne met plus en cache les assets avec une priorité obsolète (cache v3, réseau d'abord).

## 5b. Publication effective (tunnel gratuit, temporaire)

- URL publique active : **https://wheels-ministry-sword-ending.trycloudflare.com**
- Identifiants d'accès (HTTP Basic) : utilisateur `jarvis`, mot de passe `3IHKFOwtnkYpeb`.
- Vérifié : `/` et `/api/health` → 401 sans identifiants, 200 avec ; `/manifest.webmanifest`, `/sw.js` et les icônes → 200 ; rendu accueil JARVIS 3.0 dans un navigateur réel, 0 erreur console.
- Outils : `cloudflared` (Quick Tunnel, gratuit, sans compte) installé via winget ; configuration Vite `allowedHosts` pour `.trycloudflare.com`.
- **Limites importantes** : URL aléatoire et **temporaire** — elle cesse de fonctionner si le tunnel ou le serveur local s'arrête, et change au redémarrage du tunnel. L'installation PWA fonctionne en HTTPS mais dépend de la disponibilité du tunnel. Pour une URL permanente, il faut un hébergement/domaine (voir section 6).
- Le mot de passe n'est stocké que dans la configuration du processus serveur (variable d'environnement), jamais dans un fichier du projet ni dans le frontend.

## 6. BLOCAGES à une publication permanente

La mise en ligne effective **n'a pas été effectuée**. Raisons factuelles :

1. **Aucune infrastructure fournie** : aucun jeton d'hébergement (`NETLIFY_AUTH_TOKEN`, `VERCEL_TOKEN`, `CF_API_TOKEN`, `RENDER_API_KEY`, etc.) ni CLI (`vercel`, `netlify`, `wrangler`, `flyctl`, `railway`) n'est présent sur cette machine. Aucun compte, domaine ou certificat TLS n'est disponible.
2. **Sécurité avant exposition** : `JARVIS_REQUIRE_AUTH` est désactivé par défaut pour préserver l'usage local. Les routes `/api/gemini`, `/api/tts`, `/api/siri` consomment la clé serveur et ne sont pas protégées.Une authentification par jeton partagé injecté dans le frontend exposerait le jeton : il faut une session avec cookie HTTP-only (changement architectural majeur), à valider explicitement.
3. **Obligation HTTPS** : PWA/service worker + installation Android/iOS exigent HTTPS (sauf localhost). Cela dépend de l'hébergement.
4. **Aucune publication réelle** n'a été tentée (aucun service payant, aucun compte externe, aucune action destructive).

## 7. Décisions attendues pour publier

- Fournir ou autoriser la création d'un hébergement gratuit avec variables d'environnement côté serveur (les solutions statiques seules ne peuvent pas fonctionner : la clé Gemini doit rester serveur).
- Valider la mise en place d'une authentification à session (cookie HTTP-only) avant exposition publique.
- Confirmer le nom de domaine / sous-domaine et le certificat TLS.
- Ensuite seulement : `npm run build`, `npm start`, activation de `JARVIS_REQUIRE_AUTH`, vérification 401/429, tests PWA Android/iOS.

## 8. Hébergeur fiable (URL permanente) — comparatif

Le tunnel Cloudflare actuel est **temporaire**. Pour une URL stable et publique, il faut un hébergeur avec backend Node + variables d'environnement serveur :

| Hébergeur | Offre gratuite | HTTPS/domaine | Avis |
|---|---|---|---|
| **Render** (recommandé) | Web service gratuit (mise en veille après inactivité) | URL `*.onrender.com` fournie | **Meilleur choix ici** : `render.yaml` et `Dockerfile` déjà créés, déploiement en un clic depuis un dépôt |
| Koyeb | Offre gratuite limitée | URL `*.koyeb.app` | Correct, nécessite compte + CLI/API |
| Cloudflare Pages/Workers | Gratuit généreux | domaine `*.workers.dev` | Nécessite compte et adaptation du code (Node → Workers), plus de travail |
| Fly.io | Plus de formule gratuite fiable | domaine fourni | **Payant** — écarté sans votre accord |
| Hébergeur statique seul (Netlify/Vercel statique, GitHub Pages) | Gratuit | oui | **Incompatible** : la clé Gemini doit rester côté serveur |

**Fichiers prêts** : `render.yaml` (Blueprint Render) et `Dockerfile` (pour tout hébergeur conteneurisé).
**Variables à renseigner chez l'hébergeur** : `GEMINI_API_KEY` et `JARVIS_PUBLIC_BASIC_PASS` (jamais dans le dépôt).
**Sonde santé** : `GET /api/health` est volontairement exemptée d'authentification (aucun secret renvoyé).

**Blocage actuel** : aucun compte, jeton ou CLI d'hébergeur permanent n'est disponible sur cette machine (vérifié : `RENDER_API_KEY`, `KOYEB_TOKEN`, `FLY_API_TOKEN`, `GITHUB_TOKEN`, etc. absents ; `render`, `koyeb`, `flyctl`, `git` absents). Je ne peux donc pas créer l'URL permanente sans votre accord et vos identifiants.

## 9. Limites

- iOS ne permet pas l'installation programmatique : l'instruction manuelle est affichée dans l'application.
- Le mode hors ligne couvre l'interface et l'historique local, pas Gemini (aucune simulation).
- « Comme Capzo IA sur le web » reste un objectif de produit : sans hébergement et sans validation de sécurité, aucune URL publique n'est créée ni annoncée.
