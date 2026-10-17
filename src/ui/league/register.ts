import { menuExtensions } from '../screens/menuRegistry';
import { t } from '../../i18n';
import { ChallengesScreen } from '../screens/ChallengesScreen';
import { AcademyScreen } from '../screens/AcademyScreen';
import { ClubSetup } from './ClubSetup';
import { UTHub } from '../ut/UTHub';
import { CupSetup } from './CupSetup';
import { FranchiseCreator, resumeSlot, SavesScreen, TeamPickScreen } from './NewGameScreens';

/** Enregistre les modes de jeu dans le menu principal, rangés par catégorie. */
export function registerLeagueModes(): void {
  menuExtensions.tiles.push(
    // Club : l'utilisateur est entraîneur et investisseur
    { id: 'club', category: 'club', icon: '🏟️', label: () => 'Carrière de club', sub: () => 'Reprenez ou créez un club, de la D3 à la D1 : transferts, installations, montées.', open: (app) => app.go(new ClubSetup(app)) },
    { id: 'franchise', category: 'club', icon: '💼', label: () => 'Investisseur', sub: () => 'Créez votre franchise : logo, maillots, budget, stade et installations.', open: (app) => app.go(new FranchiseCreator(app)) },
    { id: 'coach', category: 'club', icon: '📋', label: () => 'Carrière d’entraîneur', sub: () => 'Objectifs de la direction, draft, contrats, offres d’emploi.', open: (app) => app.go(new TeamPickScreen(app, 'coach')) },
    // Compétitions
    { id: 'season', category: 'competitions', icon: '📅', label: () => 'Championnats', sub: () => '7 ligues du monde ou ligue personnalisée.', open: (app) => app.go(new TeamPickScreen(app, 'season')) },
    { id: 'cups', category: 'competitions', icon: '🏆', label: () => 'Coupes de clubs', sub: () => 'Coupes nationales et continentales.', open: (app) => app.go(new CupSetup(app, (c) => c.kind === 'clubs', 'Coupes de clubs')) },
    // Sélections nationales
    { id: 'nationsCup', category: 'national', icon: '🌍', label: () => 'Coupes des Nations', sub: () => 'Sélections nationales : Coupe des Nations, Ligue des Nations, Gold Bowl.', open: (app) => app.go(new CupSetup(app, (c) => c.kind === 'nations' && c.id !== 'worldCupW', 'Sélections nationales')) },
    { id: 'nationsLeague', category: 'national', icon: '🗺️', label: () => 'Championnat des Nations', sub: () => 'Une saison complète avec une sélection nationale.', open: (app) => app.go(new TeamPickScreen(app, 'season', 'nations')) },
    // Femmes
    { id: 'worldCupW', category: 'women', icon: '♀️', label: () => 'Coupe du monde féminine', sub: () => '8 sélections féminines : groupes, demies, finale.', open: (app) => app.go(new CupSetup(app, (c) => c.id === 'worldCupW', 'Football féminin')) },
    { id: 'womenLeague', category: 'women', icon: '🏈', label: () => 'Championnat féminin', sub: () => 'Une saison avec une sélection féminine.', open: (app) => app.go(new TeamPickScreen(app, 'season', 'nationsF')) },
    // Défis
    { id: 'challenges', category: 'challenges', icon: '⚡', label: () => 'Moments décisifs', sub: () => 'Situations de match à renverser par vos appels, défi de la semaine.', open: (app) => app.go(new ChallengesScreen(app)) },
    // Ultimate Team
    { id: 'ut', category: 'ut', icon: '🃏', label: () => 'Ultimate Team', sub: () => 'Cartes, packs, EVO, Journeys, Arena, VS — vous coachez votre équipe de rêve.', open: (app) => UTHub.open(app) },
    // Académie
    { id: 'academyOff', category: 'academy', icon: '⚔️', label: () => 'Tactiques d’attaque', sub: () => 'Courses, passes, feintes : texte, ralenti et question.', open: (app) => app.go(new AcademyScreen(app, 'off')) },
    { id: 'academyDef', category: 'academy', icon: '🛡️', label: () => 'Tactiques de défense', sub: () => 'Zones, individuelles, blitz : texte, ralenti et question.', open: (app) => app.go(new AcademyScreen(app, 'def')) },
  );
  menuExtensions.footer.push({ id: 'resume', icon: '▶️', label: () => 'Reprendre', sub: () => '', open: (app) => {
    const last = app.saves.listSlots().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (last) resumeSlot(app, last.slot);
  } });
  menuExtensions.footer.push({ id: 'saves', icon: '💾', label: () => t('menu.saves'), sub: () => '', open: (app) => app.go(new SavesScreen(app)) });
}
