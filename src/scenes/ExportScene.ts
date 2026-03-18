import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ZOOM, COLORS, FONT_FAMILY } from '../utils/constants';
import { mapDefs } from '../data/maps';
import { monsters } from '../data/monsters';
import { items } from '../data/items';
import { shops } from '../data/shops';
import { encounterZones } from '../data/encounterTables';
import { expTable, levelUpGains } from '../data/expTable';
import { enStrings } from '../i18n/locales/en';
import { jaStrings } from '../i18n/locales/ja';

const SCALE = 4; // Scale up sprites for visibility

export class ExportScene extends Phaser.Scene {
  constructor() {
    super('ExportScene');
  }

  shutdown(): void {
    this.input.keyboard?.removeAllListeners();
  }

  create(): void {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setScroll(-GAME_WIDTH * (ZOOM - 1) / 2, -GAME_HEIGHT * (ZOOM - 1) / 2);
    this.cameras.main.setBackgroundColor(0x222222);

    const statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Exporting...', {
      fontSize: '14px', color: COLORS.TEXT_YELLOW, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    const detailText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 'Extracting textures...', {
      fontSize: '10px', color: COLORS.TEXT_WHITE, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);

    // Run export asynchronously to avoid blocking
    this.time.delayedCall(100, () => {
      try {
        const html = this.buildExportHtml();
        detailText.setText('Generating download...');

        this.time.delayedCall(50, () => {
          this.downloadHtml(html);
          statusText.setText('Export Complete!');
          detailText.setText('Press ENTER to return to title.');

          this.input.keyboard?.on('keydown-ENTER', () => {
            this.scene.start('TitleScene');
          });
          this.input.keyboard?.on('keydown-Z', () => {
            this.scene.start('TitleScene');
          });
        });
      } catch (err) {
        statusText.setText('Export failed!');
        detailText.setText(String(err));
      }
    });
  }

  private extractTexture(key: string, frameIndex?: number): string {
    if (!this.textures.exists(key)) return '';
    const tex = this.textures.get(key);
    const source = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;

    let sw: number, sh: number, sx = 0, sy = 0;

    const frames = tex.frames as Record<string, Phaser.Textures.Frame>;
    if (frameIndex !== undefined && frames[String(frameIndex)]) {
      const frame = frames[String(frameIndex)];
      sx = frame.cutX;
      sy = frame.cutY;
      sw = frame.cutWidth;
      sh = frame.cutHeight;
    } else {
      sw = source.width;
      sh = source.height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sw * SCALE;
    canvas.height = sh * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw * SCALE, sh * SCALE);
    return canvas.toDataURL('image/png');
  }

  private buildExportHtml(): string {
    const sections: string[] = [];

    // CSS
    const css = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #1a1a2e; color: #e0e0e0; font-family: 'Courier New', monospace; padding: 20px; max-width: 1200px; margin: 0 auto; }
      h1 { color: #ffd700; text-align: center; margin: 20px 0; font-size: 28px; }
      h2 { color: #87ceeb; border-bottom: 2px solid #334; padding-bottom: 8px; margin: 30px 0 15px; font-size: 20px; }
      h3 { color: #98fb98; margin: 20px 0 10px; font-size: 16px; }
      table { border-collapse: collapse; width: 100%; margin: 10px 0 20px; }
      th, td { border: 1px solid #445; padding: 6px 10px; text-align: left; font-size: 13px; }
      th { background: #2a2a4a; color: #ffd700; }
      tr:nth-child(even) { background: #1e1e3a; }
      tr:nth-child(odd) { background: #16162e; }
      img.sprite { image-rendering: pixelated; margin: 4px; vertical-align: middle; }
      .sprite-gallery { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
      .sprite-card { background: #2a2a4a; padding: 8px; border-radius: 4px; text-align: center; border: 1px solid #445; }
      .sprite-card .name { color: #ffd700; font-size: 11px; margin-top: 4px; }
      .sprite-card .stats { color: #aaa; font-size: 10px; margin-top: 2px; }
      .toc { background: #2a2a4a; padding: 16px 24px; border-radius: 8px; margin: 20px 0; }
      .toc a { color: #87ceeb; text-decoration: none; display: block; padding: 3px 0; }
      .toc a:hover { color: #ffd700; }
      p { line-height: 1.6; margin: 8px 0; }
      .dialog-box { background: #16162e; border: 1px solid #445; padding: 10px; margin: 6px 0; border-radius: 4px; }
      .dialog-label { color: #ffd700; font-weight: bold; }
      .dialog-ja { color: #98fb98; }
      a { color: #87ceeb; }
      .map-ascii { background: #111; padding: 12px; font-size: 11px; line-height: 1.2; white-space: pre; overflow-x: auto; border: 1px solid #334; border-radius: 4px; }
    `;

    // Table of contents
    sections.push(`
      <h1>Quest of Knowledge — Game Data Export</h1>
      <p style="text-align:center;color:#aaa;">Generated ${new Date().toISOString().slice(0, 10)}</p>
      <div class="toc">
        <h3 style="margin-top:0;">Table of Contents</h3>
        <a href="#hero">1. Hero Sprites</a>
        <a href="#npcs">2. NPC Gallery</a>
        <a href="#monsters">3. Monster Bestiary</a>
        <a href="#items">4. Items & Equipment</a>
        <a href="#shops">5. Shop Inventories</a>
        <a href="#maps">6. World Maps & Dungeons</a>
        <a href="#encounters">7. Encounter Zones</a>
        <a href="#story">8. Story & Dialogue</a>
        <a href="#tiles">9. Tileset Gallery</a>
        <a href="#mechanics">10. Game Mechanics</a>
      </div>
    `);

    // 1. Hero Sprites
    sections.push(this.buildHeroSection());
    // 2. NPC Gallery
    sections.push(this.buildNpcSection());
    // 3. Monster Bestiary
    sections.push(this.buildMonsterSection());
    // 4. Items & Equipment
    sections.push(this.buildItemsSection());
    // 5. Shop Inventories
    sections.push(this.buildShopsSection());
    // 6. Maps & Dungeons
    sections.push(this.buildMapsSection());
    // 7. Encounter Zones
    sections.push(this.buildEncountersSection());
    // 8. Story & Dialogue
    sections.push(this.buildStorySection());
    // 9. Tileset Gallery
    sections.push(this.buildTilesetSection());
    // 10. Mechanics
    sections.push(this.buildMechanicsSection());

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quest of Knowledge — Game Data Export</title>
<style>${css}</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
  }

  private buildHeroSection(): string {
    let html = '<h2 id="hero">1. Hero Sprites</h2>';
    html += '<p>32×32 pixel sprites, shown at 2× scale. 4 directions × 3 animation frames = 12 frames.</p>';
    html += '<div class="sprite-gallery">';
    const dirs = ['Down', 'Left', 'Right', 'Up'];
    for (let dir = 0; dir < 4; dir++) {
      for (let anim = 0; anim < 3; anim++) {
        const frameIdx = dir * 3 + anim;
        const img = this.extractTexture('hero-walk', frameIdx);
        if (img) {
          html += `<div class="sprite-card">
            <img class="sprite" src="${img}" width="64" height="64">
            <div class="name">${dirs[dir]} #${anim}</div>
          </div>`;
        }
      }
    }
    html += '</div>';
    return html;
  }

  private buildNpcSection(): string {
    let html = '<h2 id="npcs">2. NPC Gallery</h2>';

    // Extract NPC sprites
    const npcImg = this.extractTexture('npc');
    const npcfImg = this.extractTexture('npc-f');
    const saveImg = this.extractTexture('save-point');
    const shopkeeperImg = this.extractTexture('shopkeeper');

    html += '<div class="sprite-gallery">';
    if (npcImg) html += `<div class="sprite-card"><img class="sprite" src="${npcImg}" width="64" height="64"><div class="name">Male NPC</div></div>`;
    if (npcfImg) html += `<div class="sprite-card"><img class="sprite" src="${npcfImg}" width="64" height="64"><div class="name">Female NPC</div></div>`;
    if (saveImg) html += `<div class="sprite-card"><img class="sprite" src="${saveImg}" width="64" height="64"><div class="name">Save Point</div></div>`;
    if (shopkeeperImg) html += `<div class="sprite-card"><img class="sprite" src="${shopkeeperImg}" width="64" height="64"><div class="name">Shopkeeper</div></div>`;
    html += '</div>';

    // NPC dialogues
    html += '<h3>NPC Dialogues</h3>';
    html += '<table><tr><th>NPC</th><th>English</th><th>Japanese</th></tr>';
    const npcKeys = Object.keys(enStrings).filter(k => k.startsWith('npc.') && !k.includes('savePoint'));
    for (const key of npcKeys) {
      const en = enStrings[key] || '';
      const ja = jaStrings[key] || '';
      html += `<tr><td>${key.replace('npc.', '')}</td><td>${this.escapeHtml(en)}</td><td class="dialog-ja">${this.escapeHtml(ja)}</td></tr>`;
    }
    html += '</table>';

    return html;
  }

  private buildMonsterSection(): string {
    let html = '<h2 id="monsters">3. Monster Bestiary</h2>';
    html += '<table><tr><th>Sprite</th><th>Name (EN)</th><th>Name (JA)</th><th>HP</th><th>ATK</th><th>DEF</th><th>SPD</th><th>EXP</th><th>Gold</th><th>AI</th><th>Drops</th></tr>';

    const sortedMonsters = Object.values(monsters).sort((a, b) => a.baseHp - b.baseHp);
    for (const m of sortedMonsters) {
      const img = this.extractTexture(m.spriteKey);
      const imgTag = img ? `<img class="sprite" src="${img}" width="48" height="48">` : '';
      const en = enStrings[m.nameKey] || m.id;
      const ja = jaStrings[m.nameKey] || '';
      const drops = m.drops.map(d => {
        const itemName = enStrings[items[d.itemId]?.nameKey] || d.itemId;
        return `${itemName} (${Math.round(d.chance * 100)}%)`;
      }).join(', ') || '—';

      html += `<tr>
        <td>${imgTag}</td>
        <td>${this.escapeHtml(en)}</td>
        <td class="dialog-ja">${this.escapeHtml(ja)}</td>
        <td>${m.baseHp}</td><td>${m.baseAtk}</td><td>${m.baseDef}</td><td>${m.baseSpd}</td>
        <td>${m.expReward}</td><td>${m.goldReward}</td><td>${m.aiPattern}</td>
        <td>${this.escapeHtml(drops)}</td>
      </tr>`;
    }
    html += '</table>';
    return html;
  }

  private buildItemsSection(): string {
    let html = '<h2 id="items">4. Items & Equipment</h2>';

    // Consumables
    html += '<h3>Consumables</h3>';
    html += '<table><tr><th>Name (EN)</th><th>Name (JA)</th><th>Effect</th><th>Buy</th><th>Sell</th></tr>';
    for (const item of Object.values(items)) {
      if (item.type !== 'consumable') continue;
      const en = enStrings[item.nameKey] || item.id;
      const ja = jaStrings[item.nameKey] || '';
      const effect = item.effect ? `${item.effect.type}: ${item.effect.value}` : '—';
      html += `<tr><td>${this.escapeHtml(en)}</td><td class="dialog-ja">${this.escapeHtml(ja)}</td><td>${effect}</td><td>${item.buyPrice}G</td><td>${item.sellPrice}G</td></tr>`;
    }
    html += '</table>';

    // Equipment
    const equipTypes = ['weapon', 'armor', 'shield', 'helmet'] as const;
    for (const eType of equipTypes) {
      html += `<h3>${eType.charAt(0).toUpperCase() + eType.slice(1)}s</h3>`;
      html += '<table><tr><th>Name (EN)</th><th>Name (JA)</th><th>ATK</th><th>DEF</th><th>MaxHP</th><th>Buy</th><th>Sell</th><th>Special</th></tr>';
      for (const item of Object.values(items)) {
        if (item.type !== eType) continue;
        const en = enStrings[item.nameKey] || item.id;
        const ja = jaStrings[item.nameKey] || '';
        html += `<tr>
          <td>${this.escapeHtml(en)}</td><td class="dialog-ja">${this.escapeHtml(ja)}</td>
          <td>${item.stats?.atk || '—'}</td><td>${item.stats?.def || '—'}</td><td>${item.stats?.maxHp || '—'}</td>
          <td>${item.buyPrice}G</td><td>${item.sellPrice}G</td>
          <td>${item.unsellable ? 'Legendary' : ''}</td>
        </tr>`;
      }
      html += '</table>';
    }

    return html;
  }

  private buildShopsSection(): string {
    let html = '<h2 id="shops">5. Shop Inventories</h2>';

    for (const [shopId, shop] of Object.entries(shops)) {
      const shopName = enStrings[shop.nameKey] || shopId;
      html += `<h3>${this.escapeHtml(shopName)}</h3>`;
      html += '<table><tr><th>Item</th><th>Buy Price</th><th>Stats</th></tr>';
      for (const itemId of shop.items) {
        const item = items[itemId];
        if (!item) continue;
        const name = enStrings[item.nameKey] || itemId;
        const stats = item.stats
          ? Object.entries(item.stats).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')
          : '—';
        html += `<tr><td>${this.escapeHtml(name)}</td><td>${item.buyPrice}G</td><td>${stats}</td></tr>`;
      }
      html += '</table>';
    }

    return html;
  }

  private buildMapsSection(): string {
    let html = '<h2 id="maps">6. World Maps & Dungeons</h2>';

    // Towns
    html += '<h3>Towns</h3>';
    html += '<table><tr><th>Town</th><th>Size</th><th>Shop</th><th>NPCs</th><th>Save Point</th></tr>';
    for (const [id, def] of Object.entries(mapDefs)) {
      if (def.type !== 'town') continue;
      html += `<tr>
        <td>${id}</td><td>${def.width}×${def.height}</td>
        <td>${def.shopId || '—'}</td>
        <td>${def.npcs.length}</td>
        <td>${def.savePoint ? 'Yes' : 'No'}</td>
      </tr>`;
    }
    html += '</table>';

    // Dungeons
    html += '<h3>Dungeons</h3>';
    html += '<table><tr><th>Dungeon</th><th>Floors</th><th>Size</th><th>Boss</th><th>Encounter Zone</th></tr>';
    for (const [id, def] of Object.entries(mapDefs)) {
      if (def.type !== 'dungeon') continue;
      const bossName = def.bossId ? (enStrings[monsters[def.bossId]?.nameKey] || def.bossId) : '—';
      html += `<tr>
        <td>${id}</td><td>${def.floors ?? 1}</td><td>${def.width}×${def.height}</td>
        <td>${this.escapeHtml(bossName)}</td><td>${def.encounterZone || '—'}</td>
      </tr>`;
    }
    html += '</table>';

    return html;
  }

  private buildEncountersSection(): string {
    let html = '<h2 id="encounters">7. Encounter Zones</h2>';

    for (const [zoneId, zone] of Object.entries(encounterZones)) {
      html += `<h3>${zoneId}</h3>`;
      html += `<p>Encounter rate: ${zone.encounterRate} | Min steps between: ${zone.minStepsBetween}</p>`;
      html += '<table><tr><th>Monster</th><th>Weight</th></tr>';
      const totalWeight = zone.monsters.reduce((a, b) => a + b.weight, 0);
      for (const m of zone.monsters) {
        const name = enStrings[monsters[m.monsterId]?.nameKey] || m.monsterId;
        const pct = Math.round(m.weight / totalWeight * 100);
        html += `<tr><td>${this.escapeHtml(name)}</td><td>${m.weight} (${pct}%)</td></tr>`;
      }
      html += '</table>';
    }

    return html;
  }

  private buildStorySection(): string {
    let html = '<h2 id="story">8. Story & Dialogue</h2>';

    // Intro
    html += '<h3>Introduction</h3>';
    for (let i = 1; i <= 3; i++) {
      const key = `intro.elder${i}`;
      html += `<div class="dialog-box">
        <div class="dialog-label">Elder:</div>
        <div>${this.escapeHtml(enStrings[key] || '')}</div>
        <div class="dialog-ja">${this.escapeHtml(jaStrings[key] || '')}</div>
      </div>`;
    }

    // Dungeon stories
    html += '<h3>Dungeon Stories</h3>';
    const dungeonIds = Object.keys(mapDefs).filter(k => mapDefs[k].type === 'dungeon');
    for (const id of dungeonIds) {
      html += `<h3 style="color:#ffaa55;">${id}</h3>`;
      const dialogKeys = [
        `dungeon.${id}.boss.dialog1`,
        `dungeon.${id}.boss.dialog2`,
        `dungeon.${id}.boss.dialog3`,
        `dungeon.${id}.boss.defeat`,
        `dungeon.${id}.victory`,
      ];
      for (const key of dialogKeys) {
        if (!enStrings[key]) continue;
        const label = key.split('.').pop() || '';
        html += `<div class="dialog-box">
          <div class="dialog-label">${label}:</div>
          <div>${this.escapeHtml(enStrings[key])}</div>
          <div class="dialog-ja">${this.escapeHtml(jaStrings[key] || '')}</div>
        </div>`;
      }
    }

    return html;
  }

  private buildTilesetSection(): string {
    let html = '<h2 id="tiles">9. Tileset Gallery</h2>';

    const tilesets = [
      { prefix: 'ow', name: 'Overworld', count: 8, labels: ['Grass', 'Path', 'Water', 'Tree', 'Mountain', 'Bridge', 'Town', 'Cave'] },
      { prefix: 'town', name: 'Town', count: 13, labels: ['Floor', 'Wall', 'Roof', 'Grass', 'Water', 'Path', 'Save', 'Exit', 'Awning', 'HouseWall', 'Door', 'ShopWindow', 'Counter'] },
      { prefix: 'dng', name: 'Dungeon', count: 11, labels: ['Floor', 'Wall', 'CrackedWall', 'Archway', 'Chest', 'Lava', 'StairsUp', 'Boss', 'OpenedChest', 'StairsDown', 'BossPortal'] },
    ];

    for (const set of tilesets) {
      html += `<h3>${set.name} Tiles</h3>`;
      html += '<div class="sprite-gallery">';
      for (let i = 0; i < set.count; i++) {
        const key = `${set.prefix}-${i}`;
        const img = this.extractTexture(key);
        if (img) {
          html += `<div class="sprite-card">
            <img class="sprite" src="${img}" width="64" height="64">
            <div class="name">${set.labels[i] || `Tile ${i}`}</div>
          </div>`;
        }
      }
      html += '</div>';
    }

    return html;
  }

  private buildMechanicsSection(): string {
    let html = '<h2 id="mechanics">10. Game Mechanics</h2>';

    // EXP table
    html += '<h3>EXP Table</h3>';
    html += '<table><tr><th>Level</th><th>EXP Required</th><th>+HP</th><th>+ATK</th><th>+DEF</th><th>+SPD</th></tr>';
    for (let lv = 1; lv <= 30; lv++) {
      const gains = levelUpGains[lv] ?? [0, 0, 0, 0];
      html += `<tr><td>${lv}</td><td>${expTable[lv]}</td><td>+${gains[0]}</td><td>+${gains[1]}</td><td>+${gains[2]}</td><td>+${gains[3]}</td></tr>`;
    }
    html += '</table>';

    // Damage formula
    html += '<h3>Damage Formula</h3>';
    html += '<p>Player Attack Damage = max(1, ATK - DEF/2) × (0.85 to 1.15 random)</p>';
    html += '<p>Enemy Attack Damage = max(1, Enemy ATK - Player DEF/2) × (0.85 to 1.15 random)</p>';
    html += '<p>Correct quiz answer = full damage. Incorrect/timeout = damage halved (attack) or damage doubled (defense).</p>';

    // Game progression
    html += '<h3>Progression</h3>';
    html += '<p>Act 1 (Lv 1-6): Greenhollow → Misty Grotto → Crystal Cave (gate to Act 2)</p>';
    html += '<p>Act 2 (Lv 7-12): Port Sapphire → Ironkeep → Shadow Cave (gate to Act 3)</p>';
    html += '<p>Act 3/4 (Lv 13-24): Ruins Camp → Volcanic Forge (gate to Act 5)</p>';
    html += '<p>Act 5 (Lv 25-30): Last Bastion → Sealed Sanctum + Celestial Vault → Demon Castle → Final Boss</p>';

    // Starting stats
    html += '<h3>Starting Stats</h3>';
    html += '<p>HP: 40 | ATK: 15 | DEF: 5 | SPD: 6 | Gold: 30 | Starting items: 3× Herb</p>';

    return html;
  }

  private downloadHtml(html: string): void {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quest-of-knowledge-export.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
