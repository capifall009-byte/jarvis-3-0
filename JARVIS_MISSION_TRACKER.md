# JARVIS 3.0 — Suivi de la mission finale

> Document additif créé pour le suivi. Aucune documentation existante n'a été écrasée.
> État : **audit global terminé** — implémentation en cours.
> Aucun test, build ou installation npm n'est exécuté pendant la phase de développement (constraint utilisateur).

---

## 1. Sauvegardes

| Sauvegarde | Rôle | État |
|---|---|---|
| `jarvis_backup` … `jarvis_backup_v14` | Historique | Présentes, non modifiées |
| `jarvis_backup_v15` | État avant Module 7.2.5 | Vérifiée, non modifiée |
| `jarvis_backup_v16` | **Pré-mission finale** | Créée et vérifiée byte-à-byte (84 fichiers, 0 différence de hash) |

Règle : nouvelle sauvegarde versionnée avant chaque grand module ; jamais d'écrasement.

---

## 2. Audit global consolidé (statique)

Légende : **RÉEL** = implémenté et câblé (vérifié statiquement) · **PARTIEL** = présent mais incomplet/non câblé · **ABSENT** = inexistant · **BLOQUÉ** = dépend d'un service externe payant/indisponible.

### 2.1 Noyau / Gemini / conversation
- **RÉEL** : clé `GEMINI_API_KEY` serveur uniquement, client mis en cache, `classifyGeminiError` (429/401/404/503/500), streaming SSE + détection abandon client, fallback modèle, historique 14 tours, prompt déterministe (date Paris, ton `[[TON]]`, mémoire filtrée, mode, style vocal, personnalité, projets, règles d'inférence), extraction `[[MEMOIRE]]` côté client, 9 modes + CRUD modes custom, conversations localStorage, sentiment lexical partagé, moteur offline local.
- **PARTIEL** : pas de function-calling (choix outil = consigne prose), `[[MEMOIRE]]` non nettoyé sur `/api/gemini` (contrairement à `/siri`), erreurs SSE perdent `code`/`status`, `sentiment` calculé deux fois (client + serveur), `modeId` mémoire sans UI, import mémoire court-circuite React, `capabilities`/`personality` des modes ignorés par Gemini, pas d'édition de mode custom dans l'UI.
- **ABSENT** : tool router réel, timeout/retry hors fallback, détection algorithmique des contradictions, synchronisation mémoire multi-appareils, file d'attente offline.
- **RISQUE ÉLEVÉ** : endpoints `/api/gemini`, `/api/tts`, `/api/siri` publics et sans rate limit ; champs client (`mode.instructions`, `vocalStyle.geminiInstruction`, `memories[].fact`, projets) concaténés verbatim dans `systemInstruction` → injection prompt et abus de quota.

### 2.2 Voix / émotions / personnalités
- **RÉEL** : `fr-FR-HenriNeural` via `msedge-tts` (gratuit, aucune clé), 900 caractères/chunk, file sérialisée, `generationId` + `AbortController`, WebAudio/AnalyserNode, déverrouillage iOS, repli `speechSynthesis`, 12 émotions et 7 personnalités présentes, prosodie **réellement appliquée** (`rate/pitch/volume`), persistance localStorage, UI complète, commandes vocales, orb réactif.
- **PARTIEL** : pas de synthèse émotionnelle native (pas de `<mstts:express-as>`/SSML `<break>`), personnalités = prompt uniquement (même timbre), mode auto limité à 5 émotions, `expressiveness` calculé mais non consommé, pas de synchronisation mot à mot, `colerique`→ton neutre.
- **BUG CONFIRMÉ** : `VocalStyleService` arrondit la prosodie à 0,1 (ex. `+7.5Hz`) alors que `ttsRoute.ts` n'accepte que les entiers (`/^[+-]?\d+Hz$/`) → rejet silencieux, émotion perdue en audio à certaines intensités.
- **AUTRE** : `speakPlainText` force le désourdissement (contourne le mute depuis News/WebSearch).

### 2.3 Web 7.1.1–7.2.5 / recherche approfondie
- **RÉEL** : `safeFetchValidatedUrl` massif et effectivement réutilisé (CIDR IPv4/IPv6, hostname ambigus, DNS résolu puis épinglé, redirections revalidées, limites taille/type/timeout) ; `/web/search` (grounding 3,5 s + repli Wikipédia/DDG + synthèse), `/web/inspect` (métadonnées, extraction, analyse structurée), `/web/compare` (2–5 sources, concurrence 2, 1 appel Gemini, validation stricte) ; UI 3 modes + historique centralisé, filtres/tri/sélection/suppression persistée/exports JSON+MD, consultation sans Gemini.
- **ABSENT** : Module 7.3 entier — planificateur, orchestrateur multi-étapes, progression par étape, rapport unifié, reprise/checkpoint, store de tâches.
- **MINEUR** : doublon de fallback `analysisText` dans `/web/inspect` ; `/web/compare` vérifie la clé Gemini après le téléchargement des sources.

### 2.4 News
- **RÉEL** : 4 flux BBC, RSS parsé, tri par date, catégories, historique IDB côté client, TTS de la description.
- **PARTIEL/PROBLÈME** : si `pubDate` invalide → `Date.now()` → **ancien article présenté comme récent** ; flux redondants (doublons), aucune recherche/filtre date/source, historique jamais affiché dans l'UI, libellé « Résumer » = simple TTS de description, **bug de typage `const category: NewsCategory = … : "all"`** (type = `"sport"|"world"`). Aucun score inventé (point positif).

### 2.5 Fichiers
- **RÉEL** : PDF et images envoyés en base64 à Gemini (vision native), TXT/MD/CSV/JSON/XML via `FileReader`, plafonds 60 000 caractères / 16 Mo client.
- **ABSENT** : DOCX / XLSX / PPTX (MIME absents de l'allowlist), OCR dédié, parsing local.
- **INCOHÉRENCE** : message d'erreur « 18 Mo » vs contrôle réel 24 Mo de base64.

### 2.6 Social Hub
- **RÉEL** : OAuth officiel TikTok/Instagram, stats réelles (compteurs sommés, `dataSource` honnête, `followers` TikTok `null` assumé), analyse Gemini, analyse de liens publics via oEmbed, brouillons/historique/calendrier locaux.
- **ABSENT/BLOQUÉ** : **publication non implémentée** (501 explicite) — nécessite API/permissions ; `scheduledAt` non envoyé ; pas de `platformPostId`/`permalink`.
- **RISSES** : `state` OAuth généré mais **jamais vérifié** au callback (CSRF), généré avec `Math.random()` ; `redirect_uri` dérivé du header `Host` ; tokens en clair dans `server/.data/social_tokens.json`.

### 2.7 Studio Vidéo / Studio Vidéo IA
- **RÉEL (mais à ne pas confondre)** : l'ancien Studio Vidéo = **assembleur de diaporamas animés** (images + `zoompan` ffmpeg + voix HenriNeural + SRT + MP4), pas de la vidéo générée ; 16:9 uniquement.
- **RÉEL mais BLOQUÉ** : Studio IA = vraie génération via `@huggingface/inference` (`tencent/HunyuanVideo`), pas un stub, mais exige `HF_TOKEN` payant → 502 sans token. Aucun fournisseur gratuit enregistré.
- **PARTIEL/TROMPEUR** : `aspectRatio` (9:16/16:9/1:1) envoyé mais ignoré par le fournisseur ; mode Image→Vidéo proposé mais unsupported ; `style`, `cameraMotion`, `transitions`, `voiceover` ignorés ; aucun sous-titre/habillage Shorts.
- **BUGS CONFIRMÉS** : contrat de type cassé `GenerationResult` → `VideoGenerationResult` (historique « Invalid Date ») ; `listAiVideoHistory` importé mais inutilisé ; liens de sortie expirent au redémarrage ; `SceneManager` code mort ; 3 storyboards divergents ; modèle codé en dur dans `VideoOrchestrator`.
- **Aucune dépendance vidéo gratuite utilisable identifiée** → ne pas activer de solution payante sans accord.

### 2.8 Projets / Intelligence
- **RÉEL (meilleur module)** : CRUD projets, tâches **récursives**, blocages, liens conversations, import/export JSON, progression recalculée, états de chargement/erreur avec « Réessayer », `confirm()` sur suppressions, profil avec `autoSaveSensitive=false`, journal local.
- **PARTIEL** : pas de génération de « bilan » dédié (juste du contexte Gemini).

### 2.9 UI / design
- **RÉEL** : 10 vues, NavShell unique, sidebar desktop + barre mobile scrollable, HUD, thème OLED, `min-h-[44px]`, safe-area, `prefers-reduced-motion`, design cyan/noir cohérent.
- **PARTIEL** : deux entrées avec la même icône `Film`, `MemoryView` montée deux fois, marquage « 2.0 » résiduel.

### 2.10 Sécurité transversale (hors modules déjà notés)
- Secrets jamais exposés au frontend (`vite.config.ts` sans `define`/`VITE_`) — cohérent.
- `.env.example` incomplet (`HF_TOKEN`, `PORT`, OAuth manquants).
- Validation correcte sur `files/analyze` et `video/analyze`, faible sur images importées du Studio Vidéo.
- IndexedDB : 11 stores, v6, variantes `Required` qui lèvent des erreurs ; aucune confirmation UI sur suppression de souvenirs et de générations IA.

---

## 3. Feuille de route (13 modules)

| # | Module | Priorité | État | Sauvegarde requise |
|---|---|---|---|---|
| 1 | Corrections structurelles & fiabilité (bugs confirmés) | **CRITIQUE** | ✅ **Terminé (statique)** | v17 |
| 2 | Intelligence & mémoire (contradictions, garde-fous import, orphelins mode) | ÉLEVÉE | ✅ **Terminé (partiel, statique)** | v18 |
| 3 | Modes & personnalité (édition, préférences, impact Gemini réel) | ÉLEVÉE | ✅ **Terminé (statique)** | v21 |
| 4 | Voix (prosodie entière, auto 12 émotions, mute respecté) | ÉLEVÉE | ✅ **Terminé (statique)** | v22 |
| 5 | News (fraîcheur honnête, dédup, historique affiché, recherche) | MOYENNE | ✅ **Terminé (statique)** | v23 |
| 6 | Recherche approfondie 7.3 (plan, étapes bornées, rapport, historique) | ÉLEVÉE | ✅ **Terminé (statique)** | v25 |
| 7 | Analyse documentaire (DOCX/XLSX/PPTX sans dépendance ou avec accord) | MOYENNE | À faire | v23 |
| 8 | Studio Vidéo IA (contrat type, honnêteté des options, confirmation) | MOYENNE | ✅ **Terminé (statique, avec limites externes documentées)** | v26 |
| 9 | Social Hub (state OAuth, tokens, publication = bloqué API) | MOYENNE | À faire | v25 |
| 10 | Automatisations & intégrations (API officielles uniquement) | BASSE | À faire | v26 |
| 11 | Interface & expérience (labels, identité visible, doublons explicités) | MOYENNE | ✅ **Terminé (statique)** | v27 |
| 12 | Sécurité transversale (rate limit, auth optionnelle, tokens chiffrés, anti-injection) | **CRITIQUE** | ✅ **Terminé (statique, anticipé en priorité)** | v20 |
| 13 | Bilan global + préparation phase de tests (non exécutée) | HAUTE | ✅ **Bilan produit** | v28 |
| 14 | Identité permanente du créateur (Abdourahmane Fall / Capzo) | HAUTE | ✅ **Terminé (statique)** | v24 |

---

## 4. Décisions nécessitant une autorisation explicite

1. **Toute solution vidéo payante** (HF_TOKEN / autre fournisseur) — ne pas activer.
2. **Ajout d'une authentification** sur les routes API (changement architectural majeur, risque de casser l'usage local) — proposer en module 12, à valider.
3. ** Publication réelle** sur Instagram/TikTok — reste non implémentée sans accord et API officielle autorisée.
4. **Ajout de dépendances** pour DOCX/XLSX/PPTX — à valider (objectif 0 € mais dépendances npm open source).
5. **Toute action destructive ou achat** — toujours confirmée.

---

## 5. Contraintes de vérification

- Aucun test, build, `npm install` ou modification de dépendances pendant le développement.
- Vérification **statique uniquement** : imports, types, signatures, cohérence des flux, chemins de persistance, absence de contournement de sécurité.
- Ne jamais déclarer une fonctionnalité opérationnelle à l'exécution sans test réel.
- Préserver Gemini, `fr-FR-HenriNeural`, conversations, données, modules 1–6.1, 7.1, 7.1.1, 7.2.1–7.2.5, Social Hub, Studio Vidéo, News Center.

---

## 6. Journal d'avancement

| Date | Action | Statut |
|---|---|---|
| Mission — pré-flight | Projet + v15 vérifiés, v16 créée et vérifiée (hash identique) | ✅ |
| Mission — audit | 4 audits parallèles en lecture seule consolidés | ✅ |
| Mission — suivi | Présent document créé | ✅ |
| Module 1 | Corrections structurelles/fiabilité | ✅ terminé (statique) — 15 fichiers modifiés, voir rapport |
| Module 2 | Intelligence & mémoire | ✅ partiel (statique) — détection contradictions indicative, import borné, détachement modes |
| Module 12 (anticipé) | Sécurité API et tokens | ✅ terminé (statique) — middleware auth/rate limit, tokens AES-GCM, prompt gardé, balises MEMOIRE nettoyées |
| Module 3 | Modes & personnalité | ✅ terminé (statique) — édition modes custom, champs de préférences réellement envoyés à Gemini |
| Module 4 | Voix | ✅ terminé (statique) — expressivité appliquée à la prosodie, 12 émotions atteignables en auto, mute respecté, libellés honnêtes |
| Module 5 | News | ✅ terminé (statique) — historique affiché hors ligne, recherche/filtres source et fraîcheur, suppression confirmée, badge « publication ancienne » |
| Module 14 | Identité créateur | ✅ terminé (statique) — config centrale partagée, réponse exacte, héritage tous modes/personnalités, protection contre contenus externes |
| Module 6 | Recherche approfondie 7.3 | ✅ terminé (statique) — planificateur, 4 étapes max/12 sources, recoupement, rapport structuré, 3 appels Gemini max, onglet UI, persistance et export |
| Module 8 | Studio Vidéo IA | ✅ terminé (statique) — historique complet, options non appliquées signalées, image→vidéo bloqué si non supporté, suppression confirmée |
| Module 11 | Interface | ✅ terminé (statique) — identité créateur visible dans Paramètres, doublon mémoire explicité, labels 3.0 cohérents |
| Modules 3–6, 8, 11, 14 | Modes, voix, news, 7.3, vidéo, UI, identité | ✅ terminés (statique) |
| Modules 7, 9, 10 | Documents DOCX/XLSX/PPTX, publication sociale, automatismes externes | ⛔ **BLOQUÉS** — dépendances npm / API officielles et permissions à valider |
| Module 13 | Bilan global et préparation tests | ✅ terminé (tests exécutés — voir §7) |

---

## 7. Phase de validation technique (exécutée)

- Sauvegardes : v28 vérifiée, v29 créée avant correction, v30 finale créée.
- Runtime : Node v26.13.1 / npm 11.20.0 (hors PATH), registre accessible.
- Conflit Vite/esbuild résolu **sans --force** : esbuild 0.25 → 0.28 (aligné sur Vite 8 et tsx) ; `npm install` contrôlé : 213 paquets, `package-lock.json` généré.
- `npm run lint` (tsc --noEmit) : **RÉUSSI** après 19 corrections réelles (regex backtick, imports, types, contrat projets).
- `npm run build` : **RÉUSSI** (1707 modules, 4,14 s ; avertissement chunk > 500 ko non bloquant).
- Serveur local démarré : **OK** (127.0.0.1:3000).
- Routes testées : `/api/health` 200, `/api/tts` 200 audio/mpeg (18 720 octets), `/api/news` 200, `/api/social/config` 200, `/api/web/search` 503 et `/api/web/research` 503 (sans clé, attendu).
- Bug corrigé : `/api/web/compare` renvoyait 404 (client appelait `/web/compare`) → alias ajouté, test 400 attendu **OK**.
- Bug critique corrigé : `lookup` DNS épinglé incompatible Node 20+ (`all:true`) → `safeFetchValidatedUrl` échouait sur toute URL publique ; vérifié : example.com 200, 127.0.0.1/localhost/file:// bloqués.
- Bug corrigé : rate limiting inefficace (`req.path` relatif à `/api`) → `req.originalUrl` ; test 30×400 puis 429 **OK**.
- Auth optionnelle : 401 sans jeton, 200 avec jeton valide, 401 avec jeton invalide **OK**.
- Tokens sociaux : AES-GCM v2, aucun token en clair, lecture/suppression **OK**.
- Repli Web Wikipédia/DDG : 4 sources réelles en 703 ms **OK**.
- Navigateurs : 9 vues sans erreur console ; identité créateur visible ; vue Web avec 4 onglets et état vide **OK**.
- Responsive iPhone 11 : **non vérifié sur appareil** (aucun outil d'émulation de viewport) ; validation statique des classes Tailwind uniquement.
- **BLOQUÉ** (aucune clé/API externe) : Gemini/streaming, recherche approfondie complète, analyse fichiers, Studio Vidéo IA, publication sociale. Aucune simulation.

### 7.1 Compléments de validation (clé Gemini fournie en environnement, non écrite sur disque)

- /api/health : geminiConfigured=true, modèle gemini-3.1-flash-lite.
- /api/gemini non-stream : réponse exacte « Mon créateur est Abdourahmane Fall, également connu sous le pseudonyme Capzo. »
- /api/gemini stream SSE : meta -> delta -> done, tag [[TON]] correctement délivré.
- /api/web/search : 200, 4 sources, réponse avec citations [1,2,4].
- /api/web/research : 200, status=success, 4 étapes, 4 sous-questions, 12 sources, rapport avec références [Sx].
- /api/web/inspect : 200, metadata + extraction + analyse structurée présents.
- /api/web/compare : bug corrigé (User-Agent manquant sur Wikipédia -> 422). Test direct service : 200, 2 sources accessibles, statut success. Aucune protection SSRF modifiée (même safeFetchValidatedUrl + en-têtes).
- Sauvegarde v31 créée avant la refonte UI.

---

## 8. Refonte UI « Stark Interface » + PWA (exécutée)

- Sauvegarde v32 créée avant les modifications de direction artistique.
- Audit UI : 2 audits parallèles (structure App/NavShell et vues/services). Constat : pas de ConversationsView (bloc inline dans App), 6 vues réutilisables telles quelles, handlers/refs critiques à préserver.
- Nouveaux fichiers : `src/components/ChatSidebar.tsx` (sidebar repliable, recherche conversations, historique, renommage, suppression confirmée, accès modules), `src/components/views/HomeView.tsx` (accueil intelligent : date/heure, statut services, suggestions fonctionnelles, accès rapide, derniers projets/conversations, identité créateur), `DEPLOYMENT.md` (guide Web/PWA, **aucun déploiement effectué**).
- Modifiés : `src/App.tsx` (vue `home` par défaut, `sidebarSlot`, `_composerDraft`, handlers renommage/régénération), `src/components/NavShell.tsx` (prop `sidebarSlot`, entrée Accueil), `src/components/ControlDock.tsx` (prop `initialDraft`), `src/components/TranscriptStream.tsx` (copier + régénérer), `src/types/jarvis.ts` (`home`), `src/index.css` (classes Stark additives, GPU-friendly, `prefers-reduced-motion` conservé), `public/manifest.webmanifest` (3.0), `public/sw.js` (cache v2, assets réseau d'abord pour éviter les versions obsolètes).
- PWA : manifest 3.0 valide, icônes 192/512/maskable, `beforeinstallprompt` Android, instructions iOS Safari, guide HTTPS/CPU dans DEPLOYMENT.md.
- Vérifications : `npm run lint` ✅, `npm run build` ✅, navigateur ✅ (accueil rendu, classes Stark présentes, sidebar avec 14 entrées, manifest lié, 0 erreur console), suggestion cliquée → barre de saisie pré-remplie ✅.
- Responsive : cibles 44px, `h-[100dvh]`, safe-area, classes `sm/lg` conservées ; **iPhone 11 réel non testé** (aucun appareil/émulateur disponible).
- Non fait : déploiement Web, hébergement/TLS, publication stores, modules nécessitant des API externes. Aucune clé écrite dans les fichiers (clé Gemini uniquement en variable d'environnement du processus).

---

## 9. Orbe central animé (exécuté)

- Sauvegarde v34 créée avant modification.
- Audit : l'orb existant (src/components/JarvisOrb.tsx) est déjà une vraie animation canvas (anneaux concentriques, ticks, arcs rotatifs, particules, couleurs par état, niveaux audio réels via getInputLevel/getOutputLevel, prefers-reduced-motion, tailles 210/258/292 px). Aucun moteur d'animation réécrit.
- Intégration additive : HomeView affiche désormais l'orb avec halo Stark (.jarvis-voice-ring) lorsque App fournit voiceState et les getters audio réels ; la version conversation reste inchangée.
- src/App.tsx transmet voiceState/getInputLevel/getOutputLevel/onOrbClick à HomeView ; src/types/jarvis.ts déjà compatible (VoiceState).
- Vérifications : lint ✅, build ✅, navigateur ✅ (1 canvas sur l'accueil, animation confirmée par variation des pixels, 1 canvas en conversation après bascule, 0 erreur console). Aucune détection audio simulée.

---

## 10. Publication Web (tunnel gratuit temporaire)

- Sauvegardes v35 (précédente) et v36 (après publication) créées.
- cloudflared installé via winget (gratuit, sans compte) ; tunnel Quick ouvert vers le serveur local.
- URL publique : https://wheels-ministry-sword-ending.trycloudflare.com
- Accès protégé par HTTP Basic (jarvis / mot de passe généré, fourni à l'utilisateur) appliqué à TOUT le site, pas seulement /api.
- Vérifications réelles : page et API 401 sans identifiants, 200 avec ; manifest/sw/icônes 200 ; rendu navigateur public OK, 0 erreur console.
- ite.config.ts : allowedHosts étendu aux domaines Cloudflare Tunnel.
- Limite : URL temporaire, dépend du tunnel et du serveur local ; une URL permanente nécessite hébergement + domaine (documenté dans DEPLOYMENT.md).

---

## 11. Transformation visuelle globale (correction)

- Diagnostic : les changements précédents étaient additifs et limités à l'accueil + sidebar ; l'ancien chrome (HUD, en-têtes, panneaux `jarvis-glass`, bulles, composer) restait inchangé, et un cache service worker pouvait servir l'ancienne version.
- Sauvegarde v37 créée avant correction.
- Modifiés : `NavShell.tsx` (attribut `data-jarvis-ui="stark"` et classe `jarvis-app-shell` sur le shell racine), `index.css` (thème global : panneaux bleu nuit à liseré cyan, sidebar/en-têtes approfondis, champs au focus cyan, bulles `.jarvis-stark-bubble-user/ai`, composer flottant `.jarvis-stark-composer`), `TranscriptStream.tsx` (classes Stark + espacement), `ControlDock.tsx` (composer flottant max-3xl), `JarvisOrb.tsx` (prop `compact` 88/104 px, animation identique conservée), `App.tsx` (scène d'orb monumentale remplacée par un en-tête compact Stark), `apiSecurity.ts` (exemption localhost pour l'auth Basic, tunnel public toujours protégé).
- Vérifications : lint ✅, build ✅, navigateur ✅ (shell Stark, 6 panneaux restylés, sidebar et composer en dégradé confirmés par `getComputedStyle`, orb compact 88 px en conversation, 0 erreur console), URL publique 401 sans identifiants / 200 avec ✅.

---

## 12. Préparation déploiement Render (en attente d'authentification)

- Sauvegarde v39 créée.
- Choix : **Render** (offre gratuite, URL HTTPS permanente `*.onrender.com`) — plus fiable que le tunnel Cloudflare temporaire. Fly.io écarté (payant), hébergeurs statiques incompatibles (secret Gemini côté serveur).
- Fichiers créés : `render.yaml` (Blueprint, plan free, région Francfort, build + start, healthcheck `/api/health`, variables `GEMINI_API_KEY` et `JARVIS_PUBLIC_BASIC_PASS` en `sync: false`), `Dockerfile` (Node 22 Alpine).
- `server/modules/apiSecurity.ts` : `/api/health` exempté d'auth pour la sonde Render.
- CLI Render installé via winget (v2.37.0). `render login` lancé : code d'appareil `DNW0-IM09-4LLG-PNJI`, URL https://dashboard.render.com/device-authorization/DNW0-IM09-4LLG-PNJI — **en attente de validation par l'utilisateur**.
- Après validation : créer le service depuis `render.yaml`, renseigner `GEMINI_API_KEY` et `JARVIS_PUBLIC_BASIC_PASS`, vérifier health + auth. Aucun déploiement effectué à ce stade.
- Tunnel Cloudflare temporaire toujours actif : https://wheels-ministry-sword-ending.trycloudflare.com (401 sans identifiants, 200 avec).
