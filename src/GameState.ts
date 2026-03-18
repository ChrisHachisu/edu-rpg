import { Player } from './entities/Player';
import { QuizManager } from './systems/quiz/QuizManager';
import { EncounterManager } from './systems/combat/EncounterManager';
import { SaveManager } from './systems/progression/SaveManager';
import { GradeLevel, HeroColorScheme } from './utils/types';
import { setLocale, getLocale, setKanjiMode } from './i18n/i18n';
import { audioManager } from './systems/audio/AudioManager';

interface NgPlusData {
  inventory: { itemId: string; quantity: number }[];
  equipment: { weapon: string | null; armor: string | null; shield: string | null; helmet: string | null; accessory: string | null };
  gold: number;
  heroName: string;
  heroColor: HeroColorScheme;
}

class GameStateManager {
  player!: Player;
  quizManager!: QuizManager;
  encounterManager!: EncounterManager;
  playtime = 0;
  startTime = 0;
  /** Dev mode: no encounters + 999 ATK. Activate via ?dev=1 in URL. */
  devMode = new URLSearchParams(window.location.search).get('dev') === '1';
  /** Stored NG+ carryover data */
  ngPlusData: NgPlusData | null = null;

  newGame(difficulty: GradeLevel, heroName = 'Hero', heroColor: HeroColorScheme = 'gray'): void {
    // Propagate dev mode to Player (avoids circular import)
    Player.devMode = this.devMode;
    // Preserve current locale selection (set on title screen) before Player reset
    const currentLocale = getLocale();
    this.player = new Player();
    this.player.state.name = heroName;
    this.player.state.heroColor = heroColor;
    this.player.state.locale = currentLocale;
    this.quizManager = new QuizManager();
    this.quizManager.setDifficulty(difficulty);
    this.player.state.quizDifficulty = difficulty;
    this.encounterManager = new EncounterManager();
    this.encounterManager.encounterRateMultiplier = this.getEncounterMultiplier(difficulty);
    this.playtime = 0;
    this.startTime = Date.now();
    setLocale(currentLocale);
  }

  loadGame(): boolean {
    Player.devMode = this.devMode;
    const data = SaveManager.load();
    if (!data) return false;
    this.player = new Player(data.player);
    this.quizManager = new QuizManager();
    this.quizManager.setDifficulty(data.player.quizDifficulty);
    this.quizManager.loadStats(data.quizStats);
    this.encounterManager = new EncounterManager();
    this.encounterManager.encounterRateMultiplier = this.getEncounterMultiplier(data.player.quizDifficulty);
    this.playtime = data.playtime;
    this.startTime = Date.now();
    setLocale(data.player.locale);
    setKanjiMode(data.player.kanjiMode);
    // Restore audio settings
    audioManager.loadSettings(data.player.soundEnabled, data.player.masterVolume);
    return true;
  }

  saveGame(): void {
    this.playtime += (Date.now() - this.startTime) / 1000;
    this.startTime = Date.now();
    SaveManager.save(this.player.state, this.playtime, this.quizManager.getStats());
  }

  /** Auto-save to a separate slot (used before boss fights for quick retry) */
  autoSave(): void {
    this.playtime += (Date.now() - this.startTime) / 1000;
    this.startTime = Date.now();
    SaveManager.autoSave(this.player.state, this.playtime, this.quizManager.getStats());
  }

  /** Load from auto-save slot (retry boss fight) */
  loadAutoSave(): boolean {
    Player.devMode = this.devMode;
    const data = SaveManager.loadAutoSave();
    if (!data) return false;
    this.player = new Player(data.player);
    this.quizManager = new QuizManager();
    this.quizManager.setDifficulty(data.player.quizDifficulty);
    this.quizManager.loadStats(data.quizStats);
    this.encounterManager = new EncounterManager();
    this.encounterManager.encounterRateMultiplier = this.getEncounterMultiplier(data.player.quizDifficulty);
    this.playtime = data.playtime;
    this.startTime = Date.now();
    setLocale(data.player.locale);
    setKanjiMode(data.player.kanjiMode);
    audioManager.loadSettings(data.player.soundEnabled, data.player.masterVolume);
    return true;
  }

  /** Load manual save + merge boss-encountered flags from auto-save (for portal access) */
  loadGameWithPortalFlags(): boolean {
    if (!this.loadGame()) return false;
    const autoData = SaveManager.loadAutoSave();
    if (autoData) {
      for (const [key, val] of Object.entries(autoData.player.storyFlags)) {
        if (key.endsWith('.encountered') && val) {
          this.player.state.storyFlags[key] = true;
        }
      }
    }
    return true;
  }

  prepareNewGamePlus(): void {
    this.ngPlusData = {
      inventory: this.player.state.inventory.map(s => ({ itemId: s.itemId, quantity: s.quantity })),
      equipment: { ...this.player.state.equipment },
      gold: this.player.state.gold,
      heroName: this.player.state.name,
      heroColor: this.player.state.heroColor,
    };
  }

  newGamePlus(difficulty: GradeLevel, heroColor: HeroColorScheme = 'gray'): void {
    if (!this.ngPlusData) return;
    const name = this.ngPlusData.heroName;
    this.newGame(difficulty, name, heroColor);
    // Restore NG+ carryover
    this.player.state.inventory = this.ngPlusData.inventory;
    this.player.state.equipment = this.ngPlusData.equipment;
    this.player.state.gold = this.ngPlusData.gold;
    this.ngPlusData = null;
  }

  getCurrentEncounterZone(): string | null {
    const mapId = this.player.state.position.mapId;
    // Map ID to encounter zone mapping
    const zoneMap: Record<string, string> = {
      overworld: 'greenhollow-plains', // Default, actual zone determined by position
      mistyGrotto: 'misty-grotto',
      sunkenCellar: 'sunken-cellar',
      crystalCave: 'crystal-cave',
      stormNest: 'storm-nest',
      frozenLake: 'frozen-lake',
      shadowCave: 'shadow-cave',
      desertTomb: 'desert-tomb',
      banditHideout: 'bandit-hideout',
      magmaTunnels: 'magma-tunnels',
      volcanicForge: 'volcanic-forge',
      demonCastle: 'demon-castle',
      stormreachIsles: 'stormreach-isles',
      frostfallPeaks: 'frostfall-peaks',
      sunkenTempleIsle: 'sunken-temple',
      twilightRealm: 'twilight-realm',
    };
    return zoneMap[mapId] ?? null;
  }

  /** Encounter rate multiplier based on quiz difficulty — younger kids get fewer fights */
  private getEncounterMultiplier(grade: GradeLevel): number {
    switch (grade) {
      case 'k': return 0.4;   // Preschool: 40% encounter rate, ~2.5× more steps between
      case '1': return 0.55;  // Grade 1: 55% encounter rate
      case '2': return 0.7;   // Grade 2: 70% encounter rate
      case '3': return 0.85;  // Grade 3: 85% encounter rate
      case '5': return 1.1;   // Grade 5: 110% encounter rate
      case '6': return 1.2;   // Grade 6: 120% encounter rate
      default:  return 1.0;   // Grade 4: normal encounter rate
    }
  }

  getOverworldZone(x: number, y: number): string {
    // V2 map: 120×160. River ≈ y=131, Mountains ≈ y=101, Lava ≈ y=71
    if (y <= 70) return 'demons-threshold';       // Act 5 — above lava barrier
    if (y <= 100) return 'scorched-wastes';        // Act 3/4 — between mountains and lava
    if (y <= 130) return 'iron-mountains';         // Act 2 — between river and mountains
    // Act 1 — south of river
    if (x < 35 && y > 145) return 'greenhollow-plains'; // Western plains near starting village
    if (x >= 70) return 'crystal-coast';                  // Eastern coast near Port Sapphire
    return 'whispering-woods';                            // Forest area between towns
  }
}

export const gameState = new GameStateManager();
(window as any).__GAME_STATE__ = gameState;
