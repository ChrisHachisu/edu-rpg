import { Player } from './entities/Player';
import { QuizManager } from './systems/quiz/QuizManager';
import { EncounterManager } from './systems/combat/EncounterManager';
import { SaveManager } from './systems/progression/SaveManager';
import { GradeLevel } from './utils/types';
import { setLocale, getLocale } from './i18n/i18n';
import { audioManager } from './systems/audio/AudioManager';

class GameStateManager {
  player!: Player;
  quizManager!: QuizManager;
  encounterManager!: EncounterManager;
  playtime = 0;
  startTime = 0;
  /** Dev mode: no encounters + 999 ATK. Activate via ?dev=1 in URL. */
  devMode = new URLSearchParams(window.location.search).get('dev') === '1';

  newGame(difficulty: GradeLevel): void {
    // Propagate dev mode to Player (avoids circular import)
    Player.devMode = this.devMode;
    // Preserve current locale selection (set on title screen) before Player reset
    const currentLocale = getLocale();
    this.player = new Player();
    this.player.state.locale = currentLocale;
    this.quizManager = new QuizManager();
    this.quizManager.setDifficulty(difficulty);
    this.player.state.quizDifficulty = difficulty;
    this.encounterManager = new EncounterManager();
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
    this.playtime = data.playtime;
    this.startTime = Date.now();
    setLocale(data.player.locale);
    // Restore audio settings
    audioManager.loadSettings(data.player.soundEnabled, data.player.masterVolume);
    return true;
  }

  saveGame(): void {
    this.playtime += (Date.now() - this.startTime) / 1000;
    this.startTime = Date.now();
    SaveManager.save(this.player.state, this.playtime, this.quizManager.getStats());
  }

  getCurrentEncounterZone(): string | null {
    const mapId = this.player.state.position.mapId;
    // Map ID to encounter zone mapping
    const zoneMap: Record<string, string> = {
      overworld: 'greenhollow-plains', // Default, actual zone determined by position
      mistyGrotto: 'misty-grotto',
      crystalCave: 'crystal-cave',
      shadowCave: 'shadow-cave',
      volcanicForge: 'volcanic-forge',
      demonCastle: 'demon-castle',
      sealedSanctum: 'sealed-sanctum',
      celestialVault: 'celestial-vault',
    };
    return zoneMap[mapId] ?? null;
  }

  getOverworldZone(x: number, y: number): string {
    // Determine zone by position on overworld — aligned with terrain barriers:
    // Map: 80×120. River ≈ y=98, Mountains ≈ y=80, Lava ≈ y=62
    if (y <= 61) return 'demons-threshold';       // Act 5 — above lava barrier
    if (y <= 79) return 'scorched-wastes';        // Act 3/4 — between mountains and lava
    if (y <= 97) return 'iron-mountains';         // Act 2 — between river and mountains
    // Act 1 — south of river
    if (x < 25 && y > 102) return 'greenhollow-plains'; // Western plains near starting village
    if (x >= 28) return 'crystal-coast';                 // Eastern coast near Port Sapphire
    return 'whispering-woods';                           // Forest area between towns
  }
}

export const gameState = new GameStateManager();
