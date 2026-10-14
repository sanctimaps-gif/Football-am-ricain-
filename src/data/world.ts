import type { LogoShape } from './types';
import { TEAM_TEMPLATES, type TeamTemplate } from './teams';

/**
 * Monde du jeu : ligues régionales, clubs et sélections nationales.
 *
 * Aucun club n'est sous licence. Comme dans les jeux de sport sans licences officielles, les clubs portent un nom de
 * remplacement « Ville + couleur » (ex. « Kansas City Red ») : seuls la ville et une couleur dominante sont repris.
 * Aucun surnom officiel, logo, police, stade ou nom de joueur réel n'est utilisé : logos vectoriels génériques
 * (forme + initiales), stades génériques, joueurs générés aléatoirement.
 */

export interface LeagueDef {
  id: string;
  name: string;
  short: string;
  region: string;
  flag: string;
  conferenceNames: [string, string];
  defaultWeeks: number;
  teams: TeamTemplate[];
}

type Row = [abbr: string, city: string, label: string, primary: string, secondary: string, accent: string, shape: LogoShape, glyph: string, tier: number, conf: 0 | 1, capacity: number];

const STADIUM_SUFFIX = ['Stadium', 'Field', 'Dome', 'Park', 'Arena', 'Bowl'];

function build(prefix: string, rows: Row[]): TeamTemplate[] {
  return rows.map(([abbr, city, label, primary, secondary, accent, shape, glyph, tier, conf, capacity], i) => ({
    id: `${prefix}-${abbr.toLowerCase()}`,
    city,
    name: label,
    abbr,
    conference: conf,
    primary,
    secondary,
    accent,
    logoShape: shape,
    glyph,
    stadium: `${city} ${STADIUM_SUFFIX[i % STADIUM_SUFFIX.length]}`,
    capacity,
    tier,
  }));
}

const USA: Row[] = [
  ['BUF', 'Buffalo', 'Blue', '#00338D', '#C60C30', '#FFFFFF', 'shield', 'B', 1.07, 0, 71000],
  ['MIA', 'Miami', 'Aqua', '#008E97', '#FC4C02', '#FFFFFF', 'circle', 'M', 0.99, 0, 65000],
  ['NEN', 'New England', 'Navy', '#002244', '#C60C30', '#B0B7BC', 'shield', 'NE', 0.94, 0, 66000],
  ['NYG', 'New York', 'Green', '#125740', '#FFFFFF', '#000000', 'hexagon', 'NY', 0.95, 0, 82000],
  ['BAL', 'Baltimore', 'Purple', '#241773', '#9E7C0C', '#000000', 'shield', 'B', 1.07, 0, 71000],
  ['CIN', 'Cincinnati', 'Orange', '#FB4F14', '#000000', '#FFFFFF', 'diamond', 'C', 1.02, 0, 65000],
  ['CLE', 'Cleveland', 'Brown', '#311D00', '#FF3C00', '#FFFFFF', 'square', 'C', 0.94, 0, 67000],
  ['PIT', 'Pittsburgh', 'Gold', '#101820', '#FFB612', '#FFFFFF', 'diamond', 'P', 1.0, 0, 68000],
  ['HOU', 'Houston', 'Navy', '#03202F', '#A71930', '#FFFFFF', 'star', 'H', 1.02, 0, 72000],
  ['IND', 'Indianapolis', 'Blue', '#002C5F', '#A2AAAD', '#FFFFFF', 'circle', 'I', 0.98, 0, 67000],
  ['JAX', 'Jacksonville', 'Teal', '#006778', '#D7A22A', '#101820', 'hexagon', 'J', 0.96, 0, 67000],
  ['TEN', 'Tennessee', 'Navy', '#0C2340', '#4B92DB', '#C8102E', 'star', 'T', 0.92, 0, 69000],
  ['DEN', 'Denver', 'Orange', '#FB4F14', '#002244', '#FFFFFF', 'shield', 'D', 1.0, 0, 76000],
  ['KCR', 'Kansas City', 'Red', '#E31837', '#FFB81C', '#FFFFFF', 'circle', 'KC', 1.09, 0, 76000],
  ['LVS', 'Las Vegas', 'Silver', '#000000', '#A5ACAF', '#FFFFFF', 'shield', 'LV', 0.95, 0, 65000],
  ['LAS', 'Los Angeles', 'Sky', '#0080C6', '#FFC20E', '#FFFFFF', 'diamond', 'LA', 1.02, 0, 70000],
  ['DAL', 'Dallas', 'Silver', '#003594', '#869397', '#FFFFFF', 'star', 'D', 1.02, 1, 80000],
  ['NYB', 'New York', 'Blue', '#0B2265', '#A71930', '#FFFFFF', 'square', 'NY', 0.93, 1, 82000],
  ['PHI', 'Philadelphia', 'Green', '#004C54', '#A5ACAF', '#FFFFFF', 'shield', 'P', 1.07, 1, 69000],
  ['WAS', 'Washington', 'Burgundy', '#5A1414', '#FFB612', '#FFFFFF', 'circle', 'W', 1.01, 1, 67000],
  ['CHI', 'Chicago', 'Navy', '#0B162A', '#C83803', '#FFFFFF', 'circle', 'C', 0.97, 1, 61000],
  ['DET', 'Detroit', 'Blue', '#0076B6', '#B0B7BC', '#FFFFFF', 'hexagon', 'D', 1.07, 1, 65000],
  ['GBG', 'Green Bay', 'Green', '#203731', '#FFB612', '#FFFFFF', 'circle', 'G', 1.04, 1, 81000],
  ['MIN', 'Minnesota', 'Purple', '#4F2683', '#FFC62F', '#FFFFFF', 'shield', 'M', 1.03, 1, 66000],
  ['ATL', 'Atlanta', 'Black', '#101820', '#A71930', '#A5ACAF', 'diamond', 'A', 0.98, 1, 71000],
  ['CAR', 'Carolina', 'Blue', '#0085CA', '#101820', '#BFC0BF', 'hexagon', 'C', 0.92, 1, 74000],
  ['NOG', 'New Orleans', 'Gold', '#101820', '#D3BC8D', '#FFFFFF', 'shield', 'NO', 0.96, 1, 73000],
  ['TBR', 'Tampa Bay', 'Red', '#D50A0A', '#34302B', '#FF7900', 'diamond', 'TB', 0.99, 1, 65000],
  ['ARI', 'Arizona', 'Red', '#97233F', '#FFFFFF', '#000000', 'star', 'A', 0.97, 1, 63000],
  ['LAR', 'Los Angeles', 'Royal', '#003594', '#FFA300', '#FFFFFF', 'circle', 'LA', 1.01, 1, 70000],
  ['SFR', 'San Francisco', 'Red', '#AA0000', '#B3995D', '#FFFFFF', 'hexagon', 'SF', 1.06, 1, 68000],
  ['SEA', 'Seattle', 'Navy', '#002244', '#69BE28', '#A5ACAF', 'shield', 'S', 1.0, 1, 68000],
];

const CANADA: Row[] = [
  ['TOR', 'Toronto', 'Blue', '#0A2240', '#5F8FB4', '#FFFFFF', 'shield', 'T', 0.97, 0, 27000],
  ['MTA', 'Montréal', 'White', '#F4F4F4', '#00205B', '#C8102E', 'circle', 'M', 0.96, 0, 24000],
  ['OTT', 'Ottawa', 'Red', '#C8102E', '#000000', '#FFFFFF', 'square', 'O', 0.92, 0, 24000],
  ['HAM', 'Hamilton', 'Gold', '#000000', '#FFB819', '#FFFFFF', 'diamond', 'H', 0.94, 0, 24000],
  ['WPG', 'Winnipeg', 'Blue', '#041E42', '#B9975B', '#FFFFFF', 'shield', 'W', 0.99, 1, 33000],
  ['SSK', 'Saskatchewan', 'Green', '#00573F', '#FFFFFF', '#000000', 'hexagon', 'S', 0.96, 1, 33000],
  ['CGY', 'Calgary', 'Red', '#C8102E', '#000000', '#FFFFFF', 'star', 'C', 0.95, 1, 35000],
  ['EDM', 'Edmonton', 'Green', '#2C5234', '#FFB81C', '#FFFFFF', 'circle', 'E', 0.93, 1, 56000],
  ['VAN', 'Vancouver', 'Orange', '#F15D22', '#000000', '#FFFFFF', 'diamond', 'V', 0.95, 1, 54000],
];

const EUROPE: Row[] = [
  ['LON', 'London', 'Royal', '#1D428A', '#FFFFFF', '#C8102E', 'shield', 'L', 0.94, 0, 60000],
  ['PAR', 'Paris', 'Blue', '#002654', '#E1000F', '#FFFFFF', 'circle', 'P', 0.92, 0, 48000],
  ['MAD', 'Madrid', 'White', '#F4F4F4', '#5B2C83', '#C9A227', 'shield', 'M', 0.95, 0, 55000],
  ['BCN', 'Barcelona', 'Maroon', '#7A1E3A', '#1F3F8F', '#F5C400', 'diamond', 'B', 0.94, 0, 52000],
  ['MIL', 'Milan', 'Red', '#C8102E', '#111111', '#FFFFFF', 'hexagon', 'M', 0.91, 0, 45000],
  ['AMS', 'Amsterdam', 'Orange', '#F36C21', '#1E2A5A', '#FFFFFF', 'square', 'A', 0.88, 0, 40000],
  ['BER', 'Berlin', 'Black', '#111111', '#E30613', '#FFFFFF', 'shield', 'B', 0.95, 1, 50000],
  ['HAM', 'Hamburg', 'Navy', '#0A2240', '#FFFFFF', '#C8102E', 'circle', 'H', 0.93, 1, 46000],
  ['FRA', 'Frankfurt', 'Purple', '#4B1E78', '#9BD3F2', '#FFFFFF', 'star', 'F', 0.96, 1, 51000],
  ['MUN', 'Munich', 'Sky', '#2B7BBF', '#FFFFFF', '#0A2240', 'diamond', 'M', 0.94, 1, 52000],
  ['VIE', 'Vienna', 'Gold', '#E5B80B', '#3B1E5A', '#FFFFFF', 'hexagon', 'V', 0.97, 1, 42000],
  ['PRG', 'Prague', 'Silver', '#7D8590', '#B0102E', '#FFFFFF', 'square', 'P', 0.87, 1, 30000],
];

const ASIA: Row[] = [
  ['TKY', 'Tokyo', 'Red', '#C8102E', '#FFFFFF', '#111111', 'circle', 'T', 0.92, 0, 48000],
  ['OSK', 'Osaka', 'Blue', '#00539B', '#F2B705', '#FFFFFF', 'shield', 'O', 0.9, 0, 40000],
  ['YOK', 'Yokohama', 'Navy', '#0A2240', '#4CC9F0', '#FFFFFF', 'hexagon', 'Y', 0.88, 0, 38000],
  ['KOB', 'Kobe', 'Black', '#111111', '#C0C0C0', '#E63946', 'diamond', 'K', 0.87, 0, 34000],
  ['SEO', 'Seoul', 'White', '#F4F4F4', '#003478', '#C60C30', 'circle', 'S', 0.86, 1, 45000],
  ['SHA', 'Shanghai', 'Gold', '#B8860B', '#8B0000', '#FFFFFF', 'star', 'S', 0.84, 1, 50000],
  ['SYD', 'Sydney', 'Sky', '#4CC9F0', '#0A2240', '#FFFFFF', 'shield', 'S', 0.89, 1, 42000],
  ['MNL', 'Manila', 'Royal', '#0038A8', '#FCD116', '#CE1126', 'square', 'M', 0.83, 1, 30000],
];

const LATAM: Row[] = [
  ['MEX', 'Mexico City', 'Green', '#006847', '#FFFFFF', '#CE1126', 'shield', 'MX', 0.9, 0, 60000],
  ['MTY', 'Monterrey', 'Navy', '#0A2240', '#C0C0C0', '#FFFFFF', 'diamond', 'M', 0.89, 0, 50000],
  ['GDL', 'Guadalajara', 'Red', '#C8102E', '#0A2240', '#FFFFFF', 'circle', 'G', 0.87, 0, 45000],
  ['TIJ', 'Tijuana', 'Black', '#111111', '#E63946', '#FFFFFF', 'hexagon', 'T', 0.85, 0, 30000],
  ['SAO', 'São Paulo', 'Red', '#B00020', '#111111', '#FFFFFF', 'star', 'SP', 0.86, 1, 55000],
  ['RIO', 'Rio', 'Gold', '#F5C400', '#009C3B', '#002776', 'circle', 'R', 0.84, 1, 50000],
  ['BUE', 'Buenos Aires', 'Sky', '#75AADB', '#FFFFFF', '#0A2240', 'shield', 'BA', 0.84, 1, 45000],
  ['BOG', 'Bogotá', 'Blue', '#003893', '#FCD116', '#CE1126', 'square', 'B', 0.82, 1, 36000],
];

const AFRICA: Row[] = [
  ['LAG', 'Lagos', 'Green', '#008751', '#FFFFFF', '#111111', 'shield', 'L', 0.85, 0, 45000],
  ['ACC', 'Accra', 'Orange', '#F36C21', '#111111', '#FCD116', 'diamond', 'A', 0.83, 0, 40000],
  ['KIN', 'Kinshasa', 'Blue', '#007FFF', '#F7D618', '#CE1021', 'star', 'K', 0.82, 0, 50000],
  ['NBO', 'Nairobi', 'Black', '#111111', '#BB0000', '#006600', 'hexagon', 'N', 0.82, 0, 35000],
  ['CAI', 'Cairo', 'Red', '#CE1126', '#FFFFFF', '#111111', 'circle', 'C', 0.86, 1, 60000],
  ['TUN', 'Tunis', 'Red', '#E70013', '#F4F4F4', '#111111', 'square', 'T', 0.83, 1, 38000],
  ['JNB', 'Johannesburg', 'Gold', '#FFB612', '#007749', '#111111', 'shield', 'J', 0.87, 1, 55000],
  ['CPT', 'Cape Town', 'Navy', '#002395', '#FFB612', '#FFFFFF', 'diamond', 'CT', 0.85, 1, 48000],
];

export const LEAGUES: LeagueDef[] = [
  { id: 'usa', name: 'Ligue Pro Américaine', short: 'USA', region: 'Amérique du Nord', flag: '🇺🇸', conferenceNames: ['Conférence Américaine', 'Conférence Nationale'], defaultWeeks: 17, teams: build('us', USA) },
  { id: 'can', name: 'Ligue Canadienne', short: 'CAN', region: 'Amérique du Nord', flag: '🇨🇦', conferenceNames: ['Division Est', 'Division Ouest'], defaultWeeks: 8, teams: build('ca', CANADA) },
  { id: 'eur', name: 'Ligue Européenne', short: 'EUR', region: 'Europe', flag: '🇪🇺', conferenceNames: ['Conférence Ouest', 'Conférence Est'], defaultWeeks: 11, teams: build('eu', EUROPE) },
  { id: 'fra', name: 'Ligue Francophone', short: 'FRA', region: 'Europe · Afrique · Amérique', flag: '⚜️', conferenceNames: ['Conférence Atlantique', 'Conférence Horizon'], defaultWeeks: 10, teams: TEAM_TEMPLATES },
  { id: 'asi', name: 'Ligue Asie-Pacifique', short: 'ASI', region: 'Asie · Océanie', flag: '🌏', conferenceNames: ['Conférence Nord', 'Conférence Sud'], defaultWeeks: 7, teams: build('as', ASIA) },
  { id: 'lat', name: 'Ligue Latino-Américaine', short: 'LAT', region: 'Amérique latine', flag: '🌎', conferenceNames: ['Conférence Nord', 'Conférence Sud'], defaultWeeks: 7, teams: build('la', LATAM) },
  { id: 'afr', name: 'Ligue Africaine', short: 'AFR', region: 'Afrique', flag: '🌍', conferenceNames: ['Conférence Ouest', 'Conférence Est'], defaultWeeks: 7, teams: build('af', AFRICA) },
];

const NATION_ROWS: Row[] = [
  ['USA', 'États-Unis', '', '#0A3161', '#B31942', '#FFFFFF', 'shield', 'US', 1.12, 0, 82000],
  ['CAN', 'Canada', '', '#D80621', '#FFFFFF', '#111111', 'shield', 'CA', 1.0, 0, 54000],
  ['GER', 'Allemagne', '', '#111111', '#DD0000', '#FFCE00', 'shield', 'DE', 0.97, 1, 75000],
  ['MEX', 'Mexique', '', '#006847', '#CE1126', '#FFFFFF', 'shield', 'MX', 0.96, 0, 87000],
  ['JPN', 'Japon', '', '#F4F4F4', '#BC002D', '#111111', 'circle', 'JP', 0.95, 1, 68000],
  ['AUT', 'Autriche', '', '#C8102E', '#FFFFFF', '#111111', 'shield', 'AT', 0.93, 1, 50000],
  ['GBR', 'Royaume-Uni', '', '#012169', '#C8102E', '#FFFFFF', 'shield', 'GB', 0.92, 1, 90000],
  ['FRA', 'France', '', '#002395', '#ED2939', '#FFFFFF', 'shield', 'FR', 0.92, 1, 80000],
  ['FIN', 'Finlande', '', '#F4F4F4', '#002F6C', '#111111', 'circle', 'FI', 0.9, 1, 40000],
  ['ITA', 'Italie', '', '#0066B3', '#FFFFFF', '#009246', 'shield', 'IT', 0.9, 1, 70000],
  ['SWE', 'Suède', '', '#006AA7', '#FECC02', '#FFFFFF', 'circle', 'SE', 0.88, 1, 50000],
  ['AUS', 'Australie', '', '#00843D', '#FFCD00', '#FFFFFF', 'shield', 'AU', 0.9, 0, 100000],
  ['BRA', 'Brésil', '', '#FEDF00', '#009C3B', '#002776', 'diamond', 'BR', 0.87, 0, 78000],
  ['ESP', 'Espagne', '', '#AA151B', '#F1BF00', '#FFFFFF', 'shield', 'ES', 0.87, 1, 80000],
  ['NED', 'Pays-Bas', '', '#F36C21', '#21468B', '#FFFFFF', 'circle', 'NL', 0.86, 1, 55000],
  ['KOR', 'Corée du Sud', '', '#F4F4F4', '#C60C30', '#003478', 'hexagon', 'KR', 0.85, 0, 66000],
];

/** Sélections nationales (Coupe des Nations, Gold Bowl…). */
export const NATIONS: TeamTemplate[] = build('nt', NATION_ROWS).map((t) => ({ ...t, stadium: `Stade national (${t.city})` }));

export const ALL_CLUBS: TeamTemplate[] = LEAGUES.flatMap((l) => l.teams);

export const leagueDef = (id: string): LeagueDef => LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];

export function templateById(id: string): TeamTemplate | undefined {
  return ALL_CLUBS.find((t) => t.id === id) ?? NATIONS.find((t) => t.id === id);
}

/** Ligue d'origine d'un club. */
export const leagueOfTeam = (teamId: string): LeagueDef | undefined => LEAGUES.find((l) => l.teams.some((t) => t.id === teamId));

/** Nom affiché d'une équipe (les sélections nationales n'ont pas de suffixe). */
export const displayName = (t: { city: string; name: string }): string => (t.name ? `${t.city} ${t.name}` : t.city);

/** Villes secondaires utilisées pour générer les clubs des divisions inférieures. */
const LOWER_CITIES: Record<string, string[]> = {
  usa: ['Austin', 'San Antonio', 'Portland', 'Salt Lake City', 'Oklahoma City', 'Memphis', 'Louisville', 'Sacramento', 'Omaha', 'Albuquerque', 'Birmingham', 'Orlando', 'Raleigh', 'Richmond', 'Boise', 'Tulsa', 'El Paso', 'Hartford', 'Columbus', 'San Diego', 'St. Louis', 'Milwaukee', 'Honolulu', 'Anchorage'],
  can: ['Halifax', 'Québec', 'Victoria', 'Saskatoon', 'Kingston', 'London', 'Windsor', 'Sherbrooke', 'Moncton', 'Kelowna', 'Red Deer', 'Thunder Bay', 'Guelph', 'Laval', 'Gatineau', 'Trois-Rivières', 'Lethbridge', 'Kamloops', 'St. John\'s', 'Sudbury'],
  eur: ['Lisbon', 'Porto', 'Valencia', 'Seville', 'Turin', 'Rome', 'Naples', 'Brussels', 'Zurich', 'Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'Warsaw', 'Wroclaw', 'Budapest', 'Dublin', 'Glasgow', 'Manchester', 'Leeds', 'Cologne', 'Stuttgart', 'Düsseldorf', 'Leipzig'],
  fra: ['Avignon', 'Grenoble', 'Dijon', 'Tours', 'Rouen', 'Caen', 'Brest', 'Metz', 'Nancy', 'Reims', 'Angers', 'Limoges', 'Pau', 'Perpignan', 'Annecy', 'Liège', 'Namur', 'Lausanne', 'Sherbrooke', 'Lomé', 'Yaoundé', 'Douala', 'Rabat', 'Tunis'],
  asi: ['Nagoya', 'Fukuoka', 'Sapporo', 'Kyoto', 'Busan', 'Incheon', 'Taipei', 'Hong Kong', 'Singapore', 'Bangkok', 'Melbourne', 'Brisbane', 'Perth', 'Auckland', 'Beijing', 'Shenzhen', 'Kawasaki', 'Sendai', 'Hiroshima', 'Daegu'],
  lat: ['Puebla', 'León', 'Querétaro', 'Mérida', 'Cancún', 'Chihuahua', 'Santiago', 'Lima', 'Montevideo', 'Asunción', 'Quito', 'Caracas', 'Medellín', 'Cali', 'Curitiba', 'Porto Alegre', 'Belo Horizonte', 'Recife', 'Córdoba', 'Rosario'],
  afr: ['Abuja', 'Kumasi', 'Durban', 'Pretoria', 'Alexandria', 'Rabat', 'Marrakech', 'Algiers', 'Oran', 'Addis Ababa', 'Kampala', 'Dar es Salaam', 'Luanda', 'Lusaka', 'Harare', 'Maputo', 'Douala', 'Yaoundé', 'Bamako', 'Kigali'],
};

const COLORS: [string, string][] = [
  ['Red', '#C8102E'], ['Blue', '#1D428A'], ['Navy', '#0A2240'], ['Green', '#1E7B3C'], ['Gold', '#D4A017'], ['Black', '#151515'],
  ['Orange', '#F36C21'], ['Purple', '#5B2C83'], ['Sky', '#4A9FD8'], ['Silver', '#8A9199'], ['Maroon', '#7A1E3A'], ['Teal', '#00807F'],
];
const SECONDARY = ['#FFFFFF', '#F2B705', '#111111', '#C0C0C0', '#E63946', '#4CC9F0'];
const SHAPES: LogoShape[] = ['shield', 'circle', 'diamond', 'hexagon', 'star', 'square'];

/**
 * Club fictif de division inférieure (« Ville + couleur »), déterministe pour une graine donnée.
 * `taken` évite les doublons d'identifiant et de ville.
 */
export function generateClubTemplate(leagueId: string, seed: number, tier: number, taken: Set<string>): TeamTemplate {
  const cities = LOWER_CITIES[leagueId] ?? LOWER_CITIES.usa;
  let h = (seed >>> 0) || 1;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
  let city = cities[Math.floor(next() * cities.length)];
  for (let i = 0; i < cities.length && taken.has(`city:${city}`); i++) city = cities[(cities.indexOf(city) + 1) % cities.length];
  if (taken.has(`city:${city}`)) city = `${city} ${taken.size}`;
  taken.add(`city:${city}`);
  const [label, primary] = COLORS[Math.floor(next() * COLORS.length)];
  let secondary = SECONDARY[Math.floor(next() * SECONDARY.length)];
  if (secondary === primary) secondary = '#FFFFFF';
  const letters = city.normalize('NFD').replace(/[^A-Za-z ]/g, '').toUpperCase();
  const words = letters.split(' ').filter(Boolean);
  let abbr = (words.length > 1 ? words[0][0] + words[1].slice(0, 2) : letters.replace(/ /g, '').slice(0, 3)).padEnd(3, 'X');
  let id = `gen-${leagueId}-${abbr.toLowerCase()}`;
  for (let i = 2; taken.has(id); i++) {
    abbr = abbr.slice(0, 2) + String(i % 10);
    id = `gen-${leagueId}-${abbr.toLowerCase()}`;
  }
  taken.add(id);
  return {
    id, city, name: label, abbr, conference: 0, primary, secondary, accent: '#FFFFFF',
    logoShape: SHAPES[Math.floor(next() * SHAPES.length)], glyph: words.length > 1 ? words[0][0] + words[1][0] : letters[0],
    stadium: `${city} ${STADIUM_SUFFIX[Math.floor(next() * STADIUM_SUFFIX.length)]}`,
    capacity: Math.round((8000 + next() * 22000) * (tier > 0.85 ? 1.6 : 1) / 500) * 500,
    tier,
  };
}

/** Groupe (ligue ou « nations ») d'une équipe. */
export function groupOfTeam(id: string): string {
  if (NATIONS.some((t) => t.id === id)) return 'nations';
  return leagueOfTeam(id)?.id ?? 'fra';
}
