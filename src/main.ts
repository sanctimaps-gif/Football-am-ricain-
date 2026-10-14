import './ui/styles.css';
import { App } from './ui/App';
import { SplashScreen } from './ui/screens/SplashScreen';
import { registerLeagueModes } from './ui/league/register';

registerLeagueModes();

const app = new App(document.getElementById('ui')!, document.getElementById('game') as HTMLCanvasElement);
app.go(new SplashScreen(app));
// accès de diagnostic pour les tests automatisés
(window as unknown as { __gd: App }).__gd = app;
