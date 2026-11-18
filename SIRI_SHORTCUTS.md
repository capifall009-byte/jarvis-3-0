# Déclencher JARVIS avec les Raccourcis Siri (iPhone / iOS)

Sur iOS, Safari et WebKit ne prennent pas en charge les `WebIntent` Android (`intent://`). Les méthodes officielles et compatibles sur iPhone sont :
1. **La navigation par URL HTTPS avec paramètres** (action *Ouvrir l'URL* dans l'app **Raccourcis** d'Apple).
2. **L'appel API direct depuis Siri** (action *Obtenir le contenu de l'URL* vers `/api/siri` pour un mode 100 % mains libres, même écran verrouillé).

---

## Méthode 1 : Raccourci Siri avec ouverture de l'interface JARVIS

Idéal pour lancer l'orbe cyan et voir/entendre la réponse dans Safari :

1. Ouvrez l'application **Raccourcis** sur votre iPhone et créez un nouveau raccourci nommé **« Parler à Jarvis »** (Siri le déclenchera lorsque vous direz *« Dis Siri, Parler à Jarvis »*).
2. Ajoutez l'action **Dicter du texte** (langue : *Français*) — ou **Demander une entrée**.
3. Ajoutez l'action **Encoder l'URL** avec en entrée le *Texte dicté*.
4. Ajoutez l'action **Texte** contenant :
   ```
   https://VOTRE_URL_JARVIS/?q=[URL encodée]&new=1
   ```
5. Ajoutez l'action **Ouvrir l'URL** avec le texte précédent.

### Paramètres d'URL reconnus par JARVIS

| Paramètre | Effet |
| --- | --- |
| `/?q=Bonjour+Jarvis` | Envoie immédiatement la requête à Gemini et lit la réponse à voix haute (touchez le bouton « Écouter » si Safari bloque l'autoplay sans geste préalable). |
| `/?action=listen` | Prépare JARVIS en mode écoute vocale (un bouton tactile permet de déverrouiller le micro Safari en un geste). |
| `&new=1` | Démarre une nouvelle session dans l'historique avant d'exécuter la requête. |
| `&mute=1` | Exécute la requête en mode silencieux (texte uniquement). |

---

## Méthode 2 : Mode 100 % mains libres via Siri (sans ouvrir Safari)

Idéal en voiture, avec des AirPods ou iPhone verrouillé :

1. Créez un raccourci nommé **« Demander à Jarvis »**.
2. Ajoutez **Dicter du texte** (Français).
3. Ajoutez **Obtenir le contenu de l'URL** :
   * **URL** : `https://VOTRE_URL_JARVIS/api/siri`
   * **Méthode** : `POST`
   * **En-têtes** : `Content-Type` = `application/json`
   * **Corps de la requête (JSON)** : clé `query` = *Texte dicté*
4. Ajoutez **Obtenir la valeur du dictionnaire** -> Clé : `spokenText`.
5. Ajoutez **Énoncer le texte** avec la valeur obtenue.

---

## Astuce iPhone 11 : Accès rapide depuis l'écran d'accueil

1. Ouvrez JARVIS dans **Safari**.
2. Touchez le bouton **Partager** (carré avec flèche vers le haut).
3. Choisissez **Sur l'écran d'accueil**.
4. Vous pouvez aussi associer votre raccourci Siri à **Toucher le dos de l'appareil** (*Réglages > Accessibilité > Toucher > Toucher le dos de l'appareil*).
