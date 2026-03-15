import { PlayerState, EquipSlot, InventorySlot, GradeLevel, Locale } from '../utils/types';
import { items } from '../data/items';
import { expTable, levelUpGains } from '../data/expTable';
import { MAX_LEVEL, MAX_INVENTORY_SIZE, GOLD_SELL_RATIO } from '../utils/constants';

const DEFAULT_STATE: PlayerState = {
  name: 'Hero',
  level: 1,
  exp: 0,
  expToNext: expTable[2],
  hp: 40,
  maxHp: 40,
  atk: 15,
  def: 5,
  spd: 6,
  equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
  inventory: [{ itemId: 'herb', quantity: 3 }],
  gold: 30,
  position: { mapId: 'greenhollow', x: 8, y: 10 },
  storyFlags: {},
  timerEnabled: true,
  quizDifficulty: '1',
  locale: 'ja',
};

export class Player {
  state: PlayerState;

  constructor(state?: Partial<PlayerState>) {
    this.state = { ...DEFAULT_STATE, ...state };
  }

  get totalAtk(): number {
    let bonus = 0;
    for (const slot of Object.values(this.state.equipment)) {
      if (slot) {
        const item = items[slot];
        if (item?.stats?.atk) bonus += item.stats.atk;
      }
    }
    return this.state.atk + bonus;
  }

  get totalDef(): number {
    let bonus = 0;
    for (const slot of Object.values(this.state.equipment)) {
      if (slot) {
        const item = items[slot];
        if (item?.stats?.def) bonus += item.stats.def;
      }
    }
    return this.state.def + bonus;
  }

  get totalMaxHp(): number {
    let bonus = 0;
    for (const slot of Object.values(this.state.equipment)) {
      if (slot) {
        const item = items[slot];
        if (item?.stats?.maxHp) bonus += item.stats.maxHp;
      }
    }
    return this.state.maxHp + bonus;
  }

  heal(amount: number): number {
    const before = this.state.hp;
    this.state.hp = Math.min(this.state.hp + amount, this.totalMaxHp);
    return this.state.hp - before;
  }

  takeDamage(amount: number): void {
    this.state.hp = Math.max(0, this.state.hp - amount);
  }

  get isAlive(): boolean {
    return this.state.hp > 0;
  }

  addExp(amount: number): { leveled: boolean; newLevel: number } {
    if (this.state.level >= MAX_LEVEL) return { leveled: false, newLevel: this.state.level };
    this.state.exp += amount;
    let leveled = false;
    while (this.state.level < MAX_LEVEL && this.state.exp >= this.state.expToNext) {
      this.state.level++;
      leveled = true;
      const gains = levelUpGains[this.state.level] ?? [5, 2, 2, 1];
      this.state.maxHp += gains[0];
      this.state.atk += gains[1];
      this.state.def += gains[2];
      this.state.spd += gains[3];
      this.state.hp = this.totalMaxHp; // Full heal on level up
      this.state.expToNext = this.state.level < MAX_LEVEL ? expTable[this.state.level + 1] : 99999;
    }
    return { leveled, newLevel: this.state.level };
  }

  equip(itemId: string): string | null {
    const item = items[itemId];
    if (!item) return null;
    const slot = item.type as EquipSlot;
    if (!['weapon', 'armor', 'shield', 'helmet', 'accessory'].includes(slot)) return null;

    // Cannot replace legendary (unsellable) equipment
    const prev = this.state.equipment[slot];
    if (prev && items[prev]?.unsellable) return null;

    this.state.equipment[slot] = itemId;

    // Remove equipped item from inventory
    this.removeItem(itemId, 1);

    // Return previous equipment to inventory
    if (prev) this.addItem(prev, 1);

    return prev;
  }

  unequip(slot: EquipSlot): string | null {
    const itemId = this.state.equipment[slot];
    if (!itemId) return null;
    // Cannot unequip legendary (unsellable) items
    if (items[itemId]?.unsellable) return null;
    this.state.equipment[slot] = null;
    this.addItem(itemId, 1);
    return itemId;
  }

  addItem(itemId: string, quantity: number): boolean {
    const existing = this.state.inventory.find(s => s.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
      return true;
    }
    if (this.state.inventory.length >= MAX_INVENTORY_SIZE) return false;
    this.state.inventory.push({ itemId, quantity });
    return true;
  }

  removeItem(itemId: string, quantity: number): boolean {
    const idx = this.state.inventory.findIndex(s => s.itemId === itemId);
    if (idx === -1) return false;
    this.state.inventory[idx].quantity -= quantity;
    if (this.state.inventory[idx].quantity <= 0) {
      this.state.inventory.splice(idx, 1);
    }
    return true;
  }

  hasItem(itemId: string): boolean {
    return this.state.inventory.some(s => s.itemId === itemId && s.quantity > 0);
  }

  getItemCount(itemId: string): number {
    return this.state.inventory.find(s => s.itemId === itemId)?.quantity ?? 0;
  }

  fullHeal(): void {
    this.state.hp = this.totalMaxHp;
  }
}
