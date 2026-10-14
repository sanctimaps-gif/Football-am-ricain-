# Feuille de route

État au 0.1.0. ✅ fait · 🟡 partiel · ⬜ à faire

## Phase 0 — Audit et conception ✅
## Phase 1 — Prototype 3D jouable ✅
## Phase 2 — Fondations sportives ✅
## Phase 3 — IA et tactiques ✅ (équilibrage à poursuivre)
- 🟡 Équilibrage (mesuré sur 300 passes IA) : ≈65 % de réussite, ≈9 yards en l'air + ≈6 après réception,
  sacks présents ; courses très variables (beaucoup de gains courts, quelques grandes percées). À affiner sur téléphone.
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
Onside kick, coups de pied contrés, challenge vidéo, retours de field goal manqué, safety sur coup de pied, safeties
« momentum », conversion défensive à 2 points sur retour, chrono de 25 s après temps mort, portage C# des règles 0.2.0
(`unity-port/` reflète encore la prolongation et les pénalités de la 0.1.0).
(Implémentés en 0.2.0 : two-minute warning, roughing the passer, intentional grounding, interférence offensive,
holding défensif, retard de jeu, antisportif, quart-temps de 15 min, prolongation NFL actuelle.)
