# Feuille de route

État au 0.1.0. ✅ fait · 🟡 partiel · ⬜ à faire

## Phase 0 — Audit et conception ✅
## Phase 1 — Prototype 3D jouable ✅
## Phase 2 — Fondations sportives ✅
## Phase 3 — IA et tactiques ✅ (équilibrage à poursuivre)
- 🟡 Équilibrage : passes ≈ 55 % de réussite, yards par réception élevés (≈20), courses très variables
  (beaucoup de gains nuls, quelques grandes percées), peu de sacks. À affiner avec des sessions sur téléphone.
- ⬜ Audibles et ajustements avant le snap, motion pré-snap, double couverture ciblée.

## Phase 4 — Présentation et animations 🟡
- ✅ Joueurs articulés procéduraux, animations clés, caméra, survol, célébrations, audio synthétisé.
- ⬜ Modèles riggés glTF (licence libre ou commande) + animations de capture de mouvement ; LOD.
- ⬜ Fusion des maillages rigides par joueur (réduction des appels de rendu de ~550 à ~50).
- ⬜ Ralenti / replay des actions décisives, commentaires.

## Phase 5 — Modes de jeu ✅
- ⬜ Événements/défis, compétitions personnalisées.
- ⬜ Multijoueur en ligne (non commencé : serveur autoritaire, synchronisation à pas fixe, reconnexion).
- ⬜ Match local à deux sur le même appareil.

## Phase 6 — Équipes, personnalisation, sauvegardes ✅
- ⬜ Éditeur de joueurs de l'effectif, renommage d'équipes existantes, plus de motifs de maillots.
- ⬜ Import/export de sauvegarde (fichier).

## Phase 7 — QA et optimisation 🟡
- ✅ Tests unitaires, intégration, e2e multi-résolutions.
- ⬜ Mesure des FPS sur de vrais téléphones (impossible ici : pas de GPU ni d'appareil).
- ⬜ Build APK via Capacitor (procédure dans le README) et test sur appareil.
- ⬜ Unity : compiler `unity-port/` dans Unity 6 LTS, porter `sim/` puis le rendu (voir ARCHITECTURE.md).

## Règles non implémentées
Two-minute warning, onside kick, coups de pied contrés, challenge vidéo, roughing the passer, intentional grounding,
pass interference offensive, retours de field goal manqué, safety sur coup de pied, safeties « momentum ».
