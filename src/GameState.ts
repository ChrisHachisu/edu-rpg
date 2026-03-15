import { Player } from './entities/Player';
import { QuizManager } from './systems/quiz/QuizManager';
import { EncounterManager } from './systems/combat/EncounterManager';
import { SaveManager } from './systems/progression/SaveManager';
import { GradeLevel } from './utils/types';
import { setLocale } from './i18n/i18n';

class GameStateManager {
  player!: Player;
  quizManager!: QuizManager;
  encounterManager!: EncounterManager;
  playtime = 0;
  startTime = 0;

  newGame(difficulty: GradeLevel): void {
    this.player = new Player();
    this.quizManager = new QuizManager();
    this.quizManager.setDifficulty(difficulty);
    this.player.state.quizDifficulty = difficulty;
    this.encounterManager = new EncounterManager();
    this.playtime = 0;
    this.startTime = Date.now();
    setLocale(this.player.state.locale);
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
      crystalCave: 'crystal-cave',
      shadowTower: 'shadow-tower',
      demonCastle: 'demon-castle',
    };
    return zoneMap[mapId] ?? null;
  }

  getOverworldZone(x: number, y: number): string {
    // Determine zone by position on overworld
    // Extended greenhollow-plains so the path to first town stays in the easy zone
    if (y > 35) {
      if (x < 35) return 'greenhollow-plains';
      if (x < 42) return 'crystal-coast';
      return 'crystal-coast';
    }
    if (y > 22) {
      if (x < 35) return 'whispering-woods';
      return 'iron-mountains';
    }
    if (y > 12) {
      if (x > 45) return 'iron-mountains';
      return 'scorched-wastes';
    }
    return 'scorched-wastes';
  }
}

export const gameState = new GameStateManager();
