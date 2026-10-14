# Portage Unity — Gridiron Dynasty

Ce dossier contient le **port C# du moteur de règles** (`Assets/Game/Scripts/Rules`) et ses **tests NUnit EditMode**
(`Assets/Game/Tests/EditMode`). Il n'a **pas pu être compilé** dans l'environnement de développement (ni Unity ni .NET
disponibles) : la logique est une traduction directe de `src/rules/engine.ts`, couvert par 43 tests Vitest.

## Mise en place

1. Unity Hub → Unity **6 LTS** (6000.0.x) avec modules Android Build Support (+ OpenJDK, SDK/NDK).
2. Nouveau projet **Universal 3D (URP)**.
3. Copier `Assets/Game` dans `Assets/` du projet.
4. Créer `Assets/Game/Scripts/Rules/GridironDynasty.Rules.asmdef` (aucune référence, `noEngineReferences: true`)
   et `Assets/Game/Tests/EditMode/GridironDynasty.Tests.asmdef` (références : `GridironDynasty.Rules`,
   `UnityEngine.TestRunner`, `UnityEditor.TestRunner` ; plateforme Editor ; `overrideReferences` + `nunit.framework.dll`).
5. Window → General → Test Runner → EditMode → Run All.
6. Player Settings : orientation **Landscape Left/Right** uniquement, Input System activé.

## Étapes suivantes du portage

Voir le tableau de correspondance dans `../ARCHITECTURE.md` : `sim/` (agents, ballon) en C# pur appelé depuis
`FixedUpdate`, rendu en prefabs URP + Animator, commandes avec l'Input System (On-Screen Controls), UI avec Safe Area,
données en ScriptableObjects.
