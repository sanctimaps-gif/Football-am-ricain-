import { menuExtensions } from '../screens/menuRegistry';
import { t } from '../../i18n';
import { showConfirm } from '../dialog';
import { ChallengesScreen } from '../screens/ChallengesScreen';
import { openTraining } from '../screens/Tutorial';
import { ClubSetup } from './ClubSetup';
import { CupSetup } from './CupSetup';
import { FranchiseCreator, PlayerCreator, SavesScreen, TeamPickScreen } from './NewGameScreens';

/** Enregistre les modes de jeu dans le menu principal. */
export function registerLeagueModes(): void {
  menuExtensions.tiles.push(
    { id: 'club', icon: '🏟️', label: () => 'Carrière de club', sub: () => 'D3 → D1 : 3 joueurs gardés, transferts, montées.', open: (app) => app.go(new ClubSetup(app)) },
    { id: 'player', icon: '⭐', label: () => 'Carrière de joueur', sub: () => 'Créez un joueur, draft, progression.', open: (app) => app.go(new PlayerCreator(app)) },
    { id: 'season', icon: '📅', label: () => 'Championnats', sub: () => '7 ligues ou ligue personnalisée.', open: (app) => app.go(new TeamPickScreen(app, 'season')) },
    { id: 'cups', icon: '🏆', label: () => 'Coupes & tournois', sub: () => 'Coupes nationales, continentales, des Nations.', open: (app) => app.go(new CupSetup(app)) },
    { id: 'challenges', icon: '⚡', label: () => 'Défis & événements', sub: () => 'Moments décisifs et défi de la semaine.', open: (app) => app.go(new ChallengesScreen(app)) },
    { id: 'coach', icon: '📋', label: () => 'Carrière de coach', sub: () => 'Objectifs de la direction, draft, contrats.', open: (app) => app.go(new TeamPickScreen(app, 'coach')) },
    { id: 'franchise', icon: '🛠️', label: () => t('menu.franchise'), sub: () => 'Créez votre club : logo, maillots, budget.', open: (app) => app.go(new FranchiseCreator(app)) },
  );
  menuExtensions.tiles.push({ id: 'training', icon: '🎯', label: () => 'Tutoriel', sub: () => 'Tutoriel guidé et entraînement libre.', open: (app) => {
    if (!app.profile.tutorialDone.includes('all')) return app.go(openTraining(app, true));
    void showConfirm('Refaire le tutoriel guidé ?', 'Tutoriel guidé', 'Entraînement libre').then((guided) => app.go(openTraining(app, guided)));
  } });
  menuExtensions.footer.push({ id: 'saves', icon: '💾', label: () => t('menu.saves'), sub: () => '', open: (app) => app.go(new SavesScreen(app)) });
}
