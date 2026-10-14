import { menuExtensions } from '../screens/menuRegistry';
import { t } from '../../i18n';
import { openTraining } from '../screens/Tutorial';
import { FranchiseCreator, PlayerCreator, SavesScreen, TeamPickScreen } from './NewGameScreens';

/** Enregistre les modes de jeu dans le menu principal. */
export function registerLeagueModes(): void {
  menuExtensions.tiles.push(
    { id: 'season', icon: '📅', label: () => t('menu.season'), sub: () => 'Calendrier, classement, playoffs et finale.', open: (app) => app.go(new TeamPickScreen(app, 'season')) },
    { id: 'coach', icon: '📋', label: () => t('menu.coach'), sub: () => 'Effectif, draft, contrats, objectifs de la direction.', open: (app) => app.go(new TeamPickScreen(app, 'coach')) },
    { id: 'franchise', icon: '🏟️', label: () => t('menu.franchise'), sub: () => 'Créez votre club : logo, maillots, budget, échanges.', open: (app) => app.go(new FranchiseCreator(app)) },
    { id: 'player', icon: '⭐', label: () => t('menu.player'), sub: () => 'Créez un joueur, draft, progression, récompenses.', open: (app) => app.go(new PlayerCreator(app)) },
  );
  menuExtensions.tiles.push({ id: 'training', icon: '🎯', label: () => t('menu.training'), sub: () => 'Tutoriel guidé puis entraînement libre.', open: (app) => app.go(openTraining(app, !app.profile.tutorialDone.includes('all') || confirm('Refaire le tutoriel guidé ? (Annuler = entraînement libre)'))) });
  menuExtensions.footer.push({ id: 'saves', icon: '💾', label: () => t('menu.saves'), sub: () => '', open: (app) => app.go(new SavesScreen(app)) });
}
