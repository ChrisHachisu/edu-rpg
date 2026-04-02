import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, QUIZ_FEEDBACK_DURATION, FONT_FAMILY, UI_SCALE } from '../utils/constants';
import { t, getLocale } from '../i18n/i18n';
import { gameState } from '../GameState';
import { CombatEngine, CombatResult } from '../systems/combat/CombatEngine';
import { EnemyTier } from '../systems/quiz/QuizManager';
import { MonsterTemplate, QuizQuestion } from '../utils/types';
import { items as itemsData } from '../data/items';
import { audioManager, BgmTrack } from '../systems/audio/AudioManager';

const S = UI_SCALE;

type BattlePhase = 'intro' | 'playerMenu' | 'playerQuiz' | 'enemyQuiz' | 'message' | 'victory' | 'defeat' | 'itemSelect';

export class BattleScene extends Phaser.Scene {
  private engine!: CombatEngine;
  private monster!: MonsterTemplate;
  private phase: BattlePhase = 'intro';
  private menuIndex = 0;
  private messageQueue: CombatResult[] = [];
  private quizQuestion?: QuizQuestion;
  private quizForPlayer = true; // true = player attacking, false = enemy attacking

  // UI elements
  private monsterSprite?: Phaser.GameObjects.Image;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private messageText?: Phaser.GameObjects.Text;
  private messageBox?: Phaser.GameObjects.Rectangle;
  private hpBar?: Phaser.GameObjects.Rectangle;
  private hpBarBg?: Phaser.GameObjects.Rectangle;
  private hpLabel?: Phaser.GameObjects.Text;
  private enemyHpBar?: Phaser.GameObjects.Rectangle;
  private enemyHpBarBg?: Phaser.GameObjects.Rectangle;
  private quizContainer?: Phaser.GameObjects.Container;
  private quizButtons: Phaser.GameObjects.Container[] = [];
  private quizSelectedIndex = 0;
  private itemMenuItems: Phaser.GameObjects.Text[] = [];
  private itemMenuIndex = 0;
  // Timer
  private quizTimerBar?: Phaser.GameObjects.Rectangle;
  private quizTimerBg?: Phaser.GameObjects.Rectangle;
  private quizTimerEvent?: Phaser.Time.TimerEvent;
  private quizTimerTween?: Phaser.Tweens.Tween;
  private quizTimerSeconds = 10;
  private quizTimerBarFullWidth = 0; // For speed bonus calculation
  private currentZone?: string;
  private sceneActive = true;

  constructor() {
    super('BattleScene');
  }

  init(data: { monster: MonsterTemplate; zone?: string }): void {
    this.sceneActive = true;
    // Scale monster stats by grade
    const grade = gameState.player.state.quizDifficulty;
    const mult = ['k', '1', '2'].includes(grade) ? 0.85 : ['5', '6'].includes(grade) ? 1.3 : 1.0;
    if (mult !== 1.0) {
      this.monster = {
        ...data.monster,
        baseHp: Math.round(data.monster.baseHp * mult),
        baseAtk: Math.round(data.monster.baseAtk * mult),
        baseDef: Math.round(data.monster.baseDef * mult),
      };
    } else {
      this.monster = data.monster;
    }
    this.currentZone = data.zone;
  }

  private getEnemyTier(): EnemyTier {
    if (this.monster.id === 'demonKing') return 'finalBoss';
    // Late bosses: Act 4-5 (portal land bosses, flame titan, legendary guardians)
    const lateBosses = ['flameTitan', 'swordWraith', 'celestialGuardian', 'stormSentinel', 'frostMonarch'];
    if (lateBosses.includes(this.monster.id)) return 'lateBoss';
    // Mid bosses: Act 1-3
    const midBosses = ['giantToad', 'serpent', 'giantCrab', 'kraken', 'dragon', 'sandGolem', 'iceWyrm', 'lavaWyrm', 'stormHarpy', 'banditLord', 'lich'];
    if (midBosses.includes(this.monster.id)) return 'midBoss';
    if (this.monster.aiPattern === 'boss') return 'boss';
    const totalStat = this.monster.baseHp + this.monster.baseAtk + this.monster.baseDef;
    if (totalStat < 25) return 'weak';
    if (totalStat < 80) return 'normal';
    return 'strong';
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    this.cameras.main.setBackgroundColor(0x000000);
    this.engine = new CombatEngine(gameState.player, this.monster);
    this.menuIndex = 0;
    this.messageQueue = [];

    // Select and play battle BGM
    let bgm: BgmTrack = 'battle';
    if (this.monster.id === 'demonKing') bgm = 'finalBoss';
    else if (this.monster.aiPattern === 'boss') bgm = 'bossBattle';
    audioManager.playBgm(bgm);

    this.drawBattleBackground();
    this.drawMonster();
    this.drawPlayerStatus();
    this.drawEnemyStatus();
    this.setupInput();

    // Intro — auto-advance after a brief delay
    const result = this.engine.start();
    this.phase = 'intro';

    // If boss has intro ability messages, chain them
    const introMsgs = result.abilityMessages ?? [];
    const showIntro = () => {
      if (introMsgs.length > 0) {
        this.showAbilityMessages(introMsgs, () => {
          this.phase = 'playerMenu';
          this.drawMenu();
        });
      } else {
        this.phase = 'playerMenu';
        this.drawMenu();
      }
    };

    this.showBattleMessage(result.message, showIntro);
    this.time.delayedCall(1200, () => {
      if (this.sceneActive && this.phase === 'intro') {
        this.advanceMessage();
      }
    });
  }

  private drawBattleBackground(): void {
    const g = this.add.graphics();

    // Full black background — matches sprite black backgrounds
    g.fillStyle(0x000000);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Subtle ground plane at bottom so UI panels have contrast
    // Dark charcoal strip below the monster area
    const groundY = GAME_HEIGHT * 0.58;
    g.fillStyle(0x0a0a12);
    g.fillRect(0, groundY, GAME_WIDTH, GAME_HEIGHT - groundY);

    // Thin pixel border separating monster area from UI
    g.fillStyle(0x222244);
    g.fillRect(0, groundY, GAME_WIDTH, Math.round(2 * S));

    // Subtle vignette corners (darkened edges for depth)
    g.fillStyle(0x000000, 0.3);
    g.fillRect(0, 0, Math.round(8 * S), GAME_HEIGHT);
    g.fillRect(GAME_WIDTH - Math.round(8 * S), 0, Math.round(8 * S), GAME_HEIGHT);
  }

  private drawMonster(): void {
    this.monsterSprite = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, this.monster.spriteKey)
      .setScale(Math.round(1.5 * S * 10) / 10)
      .setOrigin(0.5);

    // Entrance animation
    this.monsterSprite.setAlpha(0);
    this.tweens.add({
      targets: this.monsterSprite,
      alpha: 1,
      duration: 400,
    });
  }

  private drawPlayerStatus(): void {
    const y = GAME_HEIGHT - Math.round(132 * S);
    // Outer glow border
    this.add.rectangle(GAME_WIDTH - Math.round(130 * S), y, Math.round(244 * S), Math.round(52 * S), 0x333366, 0.4);
    this.add.rectangle(GAME_WIDTH - Math.round(130 * S), y, Math.round(240 * S), Math.round(48 * S), 0x0c0c1e, 0.92)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa);

    const p = gameState.player;
    this.add.text(GAME_WIDTH - Math.round(240 * S), y - Math.round(20 * S), `${p.state.name}  Lv${p.state.level}`, {
      fontSize: `${Math.round(16 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    });

    // HP bar
    this.hpBarBg = this.add.rectangle(GAME_WIDTH - Math.round(180 * S), y + Math.round(6 * S), Math.round(120 * S), Math.round(10 * S), 0x1a1a2e).setOrigin(0, 0.5);
    const hpRatio = p.state.hp / p.totalMaxHp;
    this.hpBar = this.add.rectangle(GAME_WIDTH - Math.round(180 * S), y + Math.round(6 * S), Math.round(120 * S) * hpRatio, Math.round(10 * S), this.hpBarColor(hpRatio)).setOrigin(0, 0.5);
    this.hpLabel = this.add.text(GAME_WIDTH - Math.round(240 * S), y + Math.round(2 * S), `HP ${p.state.hp}/${p.totalMaxHp}`, {
      fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    });
  }

  private drawEnemyStatus(): void {
    const y = Math.round(28 * S);
    // Outer glow border for retro RPG feel
    this.add.rectangle(Math.round(140 * S), y, Math.round(244 * S), Math.round(46 * S), 0x333366, 0.4);
    this.add.rectangle(Math.round(140 * S), y, Math.round(240 * S), Math.round(42 * S), 0x0c0c1e, 0.92)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa);
    this.add.text(Math.round(32 * S), y - Math.round(16 * S), t(this.monster.nameKey), {
      fontSize: `${Math.round(16 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    });
    this.enemyHpBarBg = this.add.rectangle(Math.round(32 * S), y + Math.round(10 * S), Math.round(120 * S), Math.round(8 * S), 0x1a1a2e).setOrigin(0, 0.5);
    this.enemyHpBar = this.add.rectangle(Math.round(32 * S), y + Math.round(10 * S), Math.round(120 * S), Math.round(8 * S), this.hpBarColor(1)).setOrigin(0, 0.5);
  }

  private hpBarColor(ratio: number): number {
    if (ratio <= 0.2) return 0xcc2222;      // red
    if (ratio <= 0.5) return 0xddaa22;      // orange-yellow
    return 0x22cc44;                          // green
  }

  private updateHpBars(): void {
    const p = gameState.player;
    const hpRatio = Math.max(0, p.state.hp / p.totalMaxHp);
    this.hpBar?.setSize(Math.round(120 * S) * hpRatio, Math.round(10 * S));
    this.hpBar?.setFillStyle(this.hpBarColor(hpRatio));
    this.hpLabel?.setText(`HP ${p.state.hp}/${p.totalMaxHp}`);

    const enemyRatio = Math.max(0, this.engine.monsterHp / this.monster.baseHp);
    this.enemyHpBar?.setSize(Math.round(120 * S) * enemyRatio, Math.round(8 * S));
    this.enemyHpBar?.setFillStyle(this.hpBarColor(enemyRatio));
  }

  private drawMenu(): void {
    this.clearMenu();
    this.phase = 'playerMenu';
    this.menuIndex = 0;

    const boxY = GAME_HEIGHT - Math.round(80 * S);
    // Outer glow
    this.add.rectangle(GAME_WIDTH / 4, boxY + Math.round(32 * S), GAME_WIDTH / 2 - Math.round(12 * S), Math.round(76 * S), 0x333366, 0.4)
      .setData('isMenu', true);
    this.add.rectangle(GAME_WIDTH / 4, boxY + Math.round(32 * S), GAME_WIDTH / 2 - Math.round(16 * S), Math.round(72 * S), 0x0c0c1e, 0.95)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa)
      .setData('isMenu', true);

    const actions = [
      { key: 'battle.attack', action: 'attack' },
      { key: 'battle.defend', action: 'defend' },
      { key: 'battle.item', action: 'item' },
      { key: 'battle.flee', action: 'flee' },
    ];

    actions.forEach((act, i) => {
      const x = Math.round(32 * S) + (i % 2) * Math.round(120 * S);
      const y = boxY + Math.round(12 * S) + Math.floor(i / 2) * Math.round(28 * S);
      const txt = this.add.text(x, y, t(act.key), {
        fontSize: `${Math.round(12 * S)}px`,
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setData('action', act.action).setData('isMenu', true);
      this.menuItems.push(txt);
    });

    this.updateMenuSelection();
  }

  private clearMenu(): void {
    // Remove menu items
    this.menuItems.forEach(item => item.destroy());
    this.menuItems = [];
    // Remove menu boxes
    this.children.list
      .filter(c => c.getData('isMenu'))
      .forEach(c => c.destroy());
  }

  private updateMenuSelection(): void {
    this.menuItems.forEach((item, i) => {
      item.setColor(i === this.menuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
  }

  private setupInput(): void {
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.phase === 'playerMenu') {
        this.menuIndex = Math.max(0, this.menuIndex - 2);
        this.updateMenuSelection();
      } else if (this.phase === 'playerQuiz' || this.phase === 'enemyQuiz') {
        this.quizSelectedIndex = Math.max(0, this.quizSelectedIndex - 1);
        this.updateQuizSelection();
      } else if (this.phase === 'itemSelect') {
        this.itemMenuIndex = Math.max(0, this.itemMenuIndex - 1);
        this.updateItemSelection();
      }
    });

    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.phase === 'playerMenu') {
        this.menuIndex = Math.min(3, this.menuIndex + 2);
        this.updateMenuSelection();
      } else if (this.phase === 'playerQuiz' || this.phase === 'enemyQuiz') {
        this.quizSelectedIndex = Math.min((this.quizQuestion?.answers.length ?? 4) - 1, this.quizSelectedIndex + 1);
        this.updateQuizSelection();
      } else if (this.phase === 'itemSelect') {
        this.itemMenuIndex = Math.min(this.itemMenuItems.length - 1, this.itemMenuIndex + 1);
        this.updateItemSelection();
      }
    });

    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.phase === 'playerMenu') {
        this.menuIndex = Math.max(0, this.menuIndex - 1);
        this.updateMenuSelection();
      }
    });

    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.phase === 'playerMenu') {
        this.menuIndex = Math.min(3, this.menuIndex + 1);
        this.updateMenuSelection();
      }
    });

    const confirm = () => {
      if (this.phase === 'playerMenu') this.confirmMenuAction();
      else if (this.phase === 'playerQuiz' || this.phase === 'enemyQuiz') this.confirmQuizAnswer();
      else if (this.phase === 'message') this.advanceMessage();
      else if (this.phase === 'itemSelect') {
        if (this.itemMenuItems.length === 0) { this.clearItemMenu(); this.drawMenu(); }
        else this.confirmItemSelection();
      }
    };

    this.input.keyboard?.on('keydown-Z', confirm);
    this.input.keyboard?.on('keydown-ENTER', confirm);
    this.input.keyboard?.on('keydown-SPACE', confirm);

    this.input.keyboard?.on('keydown-X', () => {
      if (this.phase === 'itemSelect') {
        this.clearItemMenu();
        this.drawMenu();
      }
    });
  }

  private confirmMenuAction(): void {
    const action = this.menuItems[this.menuIndex]?.getData('action');
    if (!action) return;
    audioManager.playSfx('menu_select');

    if (action === 'item') {
      this.showItemMenu();
      return;
    }

    this.clearMenu();
    const result = this.engine.selectAction(action);

    if (result === 'quiz') {
      this.quizForPlayer = true;
      this.showQuiz(t('quiz.answerToAttack'));
    } else {
      this.handleCombatResult(result);
    }
  }

  private showItemMenu(): void {
    this.clearMenu();
    this.phase = 'itemSelect';
    this.itemMenuIndex = 0;
    this.itemMenuItems = [];

    const allItems = itemsData;
    const consumables = gameState.player.state.inventory.filter(s => allItems[s.itemId]?.type === 'consumable');

    const maxVisible = 4;
    const visibleCount = Math.min(consumables.length, maxVisible);
    const boxHeight = Math.max(Math.round(60 * S), visibleCount * Math.round(24 * S) + Math.round(24 * S));
    const boxY = GAME_HEIGHT - boxHeight - Math.round(20 * S);
    this.add.rectangle(GAME_WIDTH / 2, boxY + boxHeight / 2, GAME_WIDTH - Math.round(32 * S), boxHeight, 0x0c0c1e, 0.95)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa)
      .setData('isMenu', true);

    if (consumables.length === 0) {
      this.add.text(GAME_WIDTH / 2, boxY + boxHeight / 2, t('menu.noItems'), {
        fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_GRAY, fontFamily: FONT_FAMILY,
      }).setOrigin(0.5).setData('isMenu', true);
      return;
    }

    consumables.slice(0, maxVisible).forEach((slot, i) => {
      const item = allItems[slot.itemId];
      const txt = this.add.text(Math.round(32 * S), boxY + Math.round(12 * S) + i * Math.round(24 * S), `${t(item.nameKey)} x${slot.quantity}`, {
        fontSize: `${Math.round(16 * S)}px`,
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setData('itemId', slot.itemId).setData('isMenu', true);
      this.itemMenuItems.push(txt);
    });
  }

  private clearItemMenu(): void {
    this.itemMenuItems.forEach(item => item.destroy());
    this.itemMenuItems = [];
    this.children.list.filter(c => c.getData('isMenu')).forEach(c => c.destroy());
  }

  private updateItemSelection(): void {
    this.itemMenuItems.forEach((item, i) => {
      item.setColor(i === this.itemMenuIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
  }

  private confirmItemSelection(): void {
    const itemId = this.itemMenuItems[this.itemMenuIndex]?.getData('itemId');
    if (!itemId) return;
    this.clearItemMenu();
    audioManager.playSfx('heal');
    const result = this.engine.selectAction('item', itemId);
    if (result !== 'quiz') {
      this.handleCombatResult(result);
    }
  }

  private showQuiz(headerText: string): void {
    const isBoss = this.monster.aiPattern === 'boss';
    this.quizQuestion = gameState.quizManager.getQuestion(this.currentZone, isBoss);
    this.quizSelectedIndex = 0;
    this.phase = this.quizForPlayer ? 'playerQuiz' : 'enemyQuiz';

    // Calculate timer based on enemy tier and difficulty
    this.quizTimerSeconds = gameState.quizManager.getTimerSeconds(this.getEnemyTier());

    this.quizContainer = this.add.container(0, 0).setDepth(50);

    // Overlay background
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5);
    this.quizContainer.add(overlay);

    // Quiz box
    const boxW = GAME_WIDTH - Math.round(32 * S);
    const boxH = Math.round(350 * S);
    const boxX = GAME_WIDTH / 2;
    const boxY = GAME_HEIGHT / 2;
    const box = this.add.rectangle(boxX, boxY, boxW, boxH, 0x0c0c1e, 0.96)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa);
    this.quizContainer.add(box);

    const timerBarW = boxW - Math.round(60 * S);
    const timerY = boxY - Math.round(156 * S);
    const timerOn = gameState.player.state.timerEnabled;

    if (timerOn) {
      // Timer bar at top of quiz box
      this.quizTimerBarFullWidth = timerBarW;
      this.quizTimerBg = this.add.rectangle(boxX, timerY, timerBarW, Math.round(10 * S), 0x333344).setDepth(51);
      this.quizTimerBar = this.add.rectangle(boxX - timerBarW / 2, timerY, timerBarW, Math.round(10 * S), COLORS.CORRECT_GREEN).setOrigin(0, 0.5).setDepth(51);
      this.quizContainer.add(this.quizTimerBg);
      this.quizContainer.add(this.quizTimerBar);

      // Timer text
      const timerText = this.add.text(boxX + timerBarW / 2 + Math.round(8 * S), timerY, `${this.quizTimerSeconds}s`, {
        fontSize: `${Math.round(9 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0.5).setDepth(51);
      this.quizContainer.add(timerText);

      // Animate timer bar shrinking
      this.quizTimerTween = this.tweens.add({
        targets: this.quizTimerBar,
        displayWidth: 0,
        duration: this.quizTimerSeconds * 1000,
        ease: 'Linear',
        onUpdate: () => {
          if (!this.quizTimerBar) return;
          const ratio = this.quizTimerBar.displayWidth / timerBarW;
          if (ratio > 0.5) {
            this.quizTimerBar.setFillStyle(COLORS.CORRECT_GREEN);
          } else if (ratio > 0.25) {
            this.quizTimerBar.setFillStyle(COLORS.GOLD);
          } else {
            this.quizTimerBar.setFillStyle(COLORS.INCORRECT_RED);
          }
          const remaining = Math.ceil(ratio * this.quizTimerSeconds);
          timerText.setText(`${remaining}s`);
        },
      });

      // Auto-fail when timer runs out
      this.quizTimerEvent = this.time.delayedCall(this.quizTimerSeconds * 1000, () => {
        if (this.phase === 'playerQuiz' || this.phase === 'enemyQuiz') {
          this.onQuizTimeout();
        }
      });
    }

    // Header
    const header = this.add.text(boxX, boxY - Math.round(130 * S), headerText, {
      fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    this.quizContainer.add(header);

    // Question
    const locale = getLocale();
    const qText = this.quizQuestion.questionText[locale];
    const question = this.add.text(boxX, boxY - Math.round(88 * S), qText, {
      fontSize: `${Math.round(16 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
      wordWrap: { width: boxW - Math.round(20 * S) },
    }).setOrigin(0.5);
    this.quizContainer.add(question);

    // Answer buttons
    this.quizButtons = [];
    this.quizQuestion.answers.forEach((answer, i) => {
      const btnY = boxY - Math.round(28 * S) + i * Math.round(44 * S);
      const btnContainer = this.add.container(boxX, btnY);

      const btnBg = this.add.rectangle(0, 0, boxW - Math.round(48 * S), Math.round(36 * S), 0x16163a, 0.9)
        .setStrokeStyle(Math.round(1 * S), i === 0 ? COLORS.GOLD : 0x4444aa);
      const btnText = this.add.text(0, 0, answer.text[locale], {
        fontSize: `${Math.round(14 * S)}px`,
        color: i === 0 ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE,
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);

      btnContainer.add([btnBg, btnText]);
      btnContainer.setData('bg', btnBg);
      btnContainer.setData('text', btnText);
      this.quizContainer!.add(btnContainer);
      this.quizButtons.push(btnContainer);
    });
  }

  private updateQuizSelection(): void {
    this.quizButtons.forEach((btn, i) => {
      const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
      const txt = btn.getData('text') as Phaser.GameObjects.Text;
      bg.setStrokeStyle(Math.round(1 * S), i === this.quizSelectedIndex ? COLORS.GOLD : 0x4444aa);
      txt.setColor(i === this.quizSelectedIndex ? COLORS.TEXT_YELLOW : COLORS.TEXT_WHITE);
    });
  }

  private stopQuizTimer(): void {
    this.quizTimerEvent?.remove();
    this.quizTimerEvent = undefined;
    this.quizTimerTween?.stop();
    this.quizTimerTween = undefined;
  }

  private onQuizTimeout(): void {
    // Time ran out — treat as incorrect answer
    // Guard against double-processing (race with confirmQuizAnswer)
    if (this.phase !== 'playerQuiz' && this.phase !== 'enemyQuiz') return;
    this.phase = 'message'; // Lock phase immediately
    this.stopQuizTimer();
    if (!this.quizQuestion) return;

    gameState.quizManager.recordAnswer(this.quizQuestion.category, false);

    // Flash the timer bar red
    const feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + Math.round(140 * S), '⏱ ' + t('quiz.incorrect'), {
      fontSize: `${Math.round(16 * S)}px`,
      color: '#cc2244',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);

    // Highlight correct answer
    this.quizButtons.forEach((btn, i) => {
      const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
      if (this.quizQuestion!.answers[i].isCorrect) {
        bg.setFillStyle(COLORS.CORRECT_GREEN, 0.8);
      }
    });

    this.time.delayedCall(QUIZ_FEEDBACK_DURATION, () => {
      if (!this.sceneActive) return;
      feedbackText.destroy();
      this.quizContainer?.destroy();
      this.quizContainer = undefined;

      let result: CombatResult;
      if (this.quizForPlayer) {
        result = this.engine.resolvePlayerAttack(false);
      } else {
        result = this.engine.resolveEnemyAttack(false, 0);
      }
      this.handleCombatResult(result);
    });
  }

  private confirmQuizAnswer(): void {
    if (!this.quizQuestion) return;
    // Guard against double-processing (race with onQuizTimeout)
    if (this.phase !== 'playerQuiz' && this.phase !== 'enemyQuiz') return;
    this.phase = 'message'; // Lock phase immediately

    // Capture remaining time ratio for speed bonus before stopping timer
    let timeRatio = 0;
    if (this.quizTimerBar && this.quizTimerBarFullWidth > 0) {
      timeRatio = this.quizTimerBar.displayWidth / this.quizTimerBarFullWidth;
    }

    // Stop the timer
    this.stopQuizTimer();

    const answer = this.quizQuestion.answers[this.quizSelectedIndex];
    const correct = answer.isCorrect;

    gameState.quizManager.recordAnswer(this.quizQuestion.category, correct);

    // Show feedback
    this.quizButtons.forEach((btn, i) => {
      const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
      const a = this.quizQuestion!.answers[i];
      if (a.isCorrect) {
        bg.setFillStyle(COLORS.CORRECT_GREEN, 0.8);
      } else if (i === this.quizSelectedIndex && !correct) {
        bg.setFillStyle(COLORS.INCORRECT_RED, 0.8);
      }
    });

    // Show correct/incorrect text
    const feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + Math.round(140 * S), correct ? t('quiz.correct') : t('quiz.incorrect'), {
      fontSize: `${Math.round(16 * S)}px`,
      color: correct ? '#22cc44' : '#cc2244',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);

    this.time.delayedCall(QUIZ_FEEDBACK_DURATION, () => {
      if (!this.sceneActive) return;
      feedbackText.destroy();
      this.quizContainer?.destroy();
      this.quizContainer = undefined;

      // Resolve combat based on quiz result
      let result: CombatResult;
      if (this.quizForPlayer) {
        result = this.engine.resolvePlayerAttack(correct, timeRatio);
      } else {
        result = this.engine.resolveEnemyAttack(correct, timeRatio);
      }

      this.handleCombatResult(result);
    });
  }

  private handleCombatResult(result: CombatResult): void {
    this.updateHpBars();

    // Monster hit animation + SFX
    if (result.damage && result.damage > 0 && this.quizForPlayer) {
      audioManager.playSfx('attack_hit');
      this.tweens.add({
        targets: this.monsterSprite,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 2,
      });
    }

    // Player hit animation + SFX
    if (result.damage && result.damage > 0 && !this.quizForPlayer) {
      audioManager.playSfx('damage_taken');
      this.cameras.main.shake(150, 0.01);
    }

    // Miss SFX (no damage dealt and not a special state)
    if (result.damage === 0 && result.state !== 'fled' && result.state !== 'victory' && result.state !== 'defeat') {
      audioManager.playSfx('attack_miss');
    }

    if (result.state === 'victory') {
      this.showVictory(result);
    } else if (result.state === 'defeat') {
      audioManager.playSfx('defeat');
      this.showBattleMessage(result.message, () => {
        this.scene.stop();
        this.scene.start('GameOverScene');
      });
    } else if (result.state === 'fled') {
      audioManager.playSfx('flee');
      this.showBattleMessage(result.message, () => this.endBattle());
    } else if (result.state === 'enemyResolve') {
      // Show rage activation message before damage, then process turn abilities
      const preMessages = result.abilityMessages ?? [];
      const showDamageAndAbilities = () => {
        this.showBattleMessage(result.message, () => {
          const abilityMsgs = this.engine.processTurnAbilities();
          this.updateHpBars();

          // Check if poison killed the player
          if (this.engine.isPlayerDefeatedByPoison()) {
            this.showAbilityMessages(abilityMsgs, () => {
              this.updateHpBars();
              this.showBattleMessage(
                t('battle.defeated', { name: gameState.player.state.name }),
                () => {
                  audioManager.playSfx('defeat');
                  this.scene.stop();
                  this.scene.start('GameOverScene');
                },
              );
            });
            return;
          }

          if (abilityMsgs.length > 0) {
            this.showAbilityMessages(abilityMsgs, () => {
              this.updateHpBars();
              this.drawMenu();
            });
          } else {
            this.drawMenu();
          }
        });
      };

      if (preMessages.length > 0) {
        this.showAbilityMessages(preMessages, showDamageAndAbilities);
      } else {
        showDamageAndAbilities();
      }
    } else if (result.state === 'playerResolve') {
      // After player resolves, enemy's turn with quiz
      this.showBattleMessage(result.message, () => {
        this.quizForPlayer = false;
        this.engine.startEnemyTurn();
        this.showQuiz(t('quiz.answerToDefend'));
      });
    }
  }

  private showVictory(result: CombatResult): void {
    // Mark boss as defeated
    if (this.monster.aiPattern === 'boss') {
      gameState.player.state.storyFlags[`boss.${this.monster.id}.defeated`] = true;
    }

    // Quest progress: monster defeated
    const readyQuests = gameState.questManager.updateProgress(gameState.player.state, 'defeat', this.monster.id, 1);

    audioManager.playSfx('victory_fanfare');

    // Monster death animation
    this.tweens.add({
      targets: this.monsterSprite,
      alpha: 0,
      scaleX: 0,
      scaleY: 0,
      duration: 500,
    });

    let msg = result.message;
    if (result.expGain) msg += '\n' + t('battle.expGain', { exp: result.expGain });
    if (result.goldGain) msg += '\n' + t('battle.goldGain', { gold: result.goldGain });
    if (result.levelUp) {
      msg += '\n' + t('battle.levelUp', { name: gameState.player.state.name, level: result.levelUp.newLevel });
      // Delayed level up SFX after victory fanfare
      this.time.delayedCall(600, () => { if (this.sceneActive) audioManager.playSfx('level_up'); });
    }

    // Quest progress: item drops collected
    if (result.drops) {
      for (const itemId of result.drops) {
        const dropReady = gameState.questManager.updateProgress(gameState.player.state, 'collect', itemId, 1);
        for (const qId of dropReady) {
          if (!readyQuests.includes(qId)) readyQuests.push(qId);
        }
      }
    }

    // Notify player if quest objectives became ready
    if (readyQuests.length > 0) {
      msg += '\n' + t('quest.objectivesComplete');
    }

    // Check if this was the demon king
    if (this.monster.id === 'demonKing') {
      // Combine 5 crystal shards into Crystal of Math Knowledge
      const shardCount = gameState.player.getItemCount('shadowCrystal');
      if (shardCount >= 5) {
        gameState.player.removeItem('shadowCrystal', shardCount);
        gameState.player.addItem('crystalOfKnowledge', 1);
        msg += '\n' + t('crystal.combined');
      }
      this.showBattleMessage(msg, () => {
        this.scene.stop();
        this.scene.start('VictoryScene');
      });
      return;
    }

    this.showBattleMessage(msg, () => this.endBattle());
  }

  private showBattleMessage(text: string, callback: () => void): void {
    this.phase = 'message';
    this.clearMenu();

    const y = GAME_HEIGHT - Math.round(72 * S);
    this.messageBox?.destroy();
    this.messageText?.destroy();

    this.messageBox = this.add.rectangle(GAME_WIDTH / 2, y + Math.round(24 * S), GAME_WIDTH - Math.round(16 * S), Math.round(64 * S), 0x0c0c1e, 0.95)
      .setStrokeStyle(Math.round(2 * S), 0x4444aa).setDepth(40);
    this.messageText = this.add.text(Math.round(24 * S), y, text, {
      fontSize: `${Math.round(12 * S)}px`, color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
      wordWrap: { width: GAME_WIDTH - Math.round(48 * S) },
    }).setDepth(41);

    this._messageCallback = callback;

    // Auto-advance after a brief delay (longer for multi-line messages)
    const lines = text.split('\n').length;
    const delay = Math.min(1200 + lines * 600, 3000);
    this._autoAdvanceTimer?.remove();
    this._autoAdvanceTimer = this.time.delayedCall(delay, () => {
      if (this.phase === 'message') {
        this.advanceMessage();
      }
    });
  }

  private _messageCallback?: () => void;
  private _autoAdvanceTimer?: Phaser.Time.TimerEvent;

  private advanceMessage(): void {
    this._autoAdvanceTimer?.remove();
    this._autoAdvanceTimer = undefined;
    this.messageBox?.destroy();
    this.messageText?.destroy();
    if (this._messageCallback) {
      const cb = this._messageCallback;
      this._messageCallback = undefined;
      cb();
    }
  }

  shutdown(): void {
    this.sceneActive = false;
    this.input.keyboard?.removeAllListeners();
    this.stopQuizTimer();
    this._autoAdvanceTimer?.remove();
  }

  /** Show a queue of ability messages one by one, then call callback */
  private showAbilityMessages(messages: string[], callback: () => void): void {
    if (messages.length === 0) {
      callback();
      return;
    }
    const [first, ...rest] = messages;
    this.showBattleMessage(first, () => {
      this.updateHpBars();
      this.showAbilityMessages(rest, callback);
    });
  }

  private endBattle(): void {
    this.scene.stop();
    this.scene.resume('WorldMapScene');
    const worldScene = this.scene.get('WorldMapScene') as any;
    worldScene.wake?.();
  }
}
