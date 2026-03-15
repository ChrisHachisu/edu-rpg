import { Player } from './entities/Player';
import { QuizManager } from './systems/quiz/QuizManager';
import { EncounterManager } from './systems/combat/EncounterManager';
import { SaveManager } from './systems/progression/SaveManager';
import { GradeLevel } from './utils/types';
import { setLocale, getLocale } from './i18n/i18n';

class GameStateManager {
  player!: Player;
  quizManager!: QuizManager;
  encounterManager!: EncounterManager;
  playtime = 0;
  startTime = 0;

  newGame(difficulty: GradeLevel): void {
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
      coralTunnels: 'coral-tunnels',
      shadowTower: 'shadow-tower',
      frostpeakCavern: 'frostpeak-cavern',
      sunkenRuins: 'sunken-ruins',
      volcanicForge: 'volcanic-forge',
      demonCastle: 'demon-castle',
    };
    return zoneMap[mapId] ?? null;
  }

  getOverworldZone(x: number, y: number): string {
    // Determine zone by position on overworld — aligned with terrain barriers:
    // River ≈ y=27-29, Mountains ≈ y=15-18, Lava ≈ y=7-9
    if (y <= 7) return 'demons-threshold';       // Act 5 — above lava barrier
    if (y <= 15) return 'scorched-wastes';        // Act 3/4 — between mountains and lava
    if (y <= 26) return 'iron-mountains';         // Act 2 — between river and mountains
    // Act 1 — south of river
    if (x < 25 && y > 40) return 'greenhollow-plains'; // Western plains near starting village
    if (x >= 35) return 'crystal-coast';                // Eastern coast near Port Sapphire
    return 'whispering-woods';                          // Forest area between towns
  }
}

export const gameState = new GameStateManager();
