// Smooth text helper for pixelArt games.
//
// pixelArt:true forces NEAREST filtering on ALL WebGL textures including
// Text objects (via canvasToTexture). This makes dynamic text unreadable.
// Fix: override each Text object's texture filtering to LINEAR, and
// re-apply after every setText/updateText since Phaser re-uploads the
// texture with NEAREST each time.

import Phaser from 'phaser';

/** Apply LINEAR (smooth) filtering to a Text object's texture. */
function applyLinearFilter(text: Phaser.GameObjects.Text): void {
  const src = text.texture?.source?.[0];
  if (src) {
    src.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

/**
 * Monkey-patch Phaser's text factory so every `this.add.text(...)` call
 * automatically gets LINEAR texture filtering. Also wraps `setText` and
 * `setStyle` so the filter survives re-uploads.
 *
 * Call once in BootScene.create() before any text is created.
 */
export function enableSmoothText(): void {
  const orig = Phaser.GameObjects.GameObjectFactory.prototype.text;

  (Phaser.GameObjects.GameObjectFactory.prototype as any).text = function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number, y: number, text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle
  ): Phaser.GameObjects.Text {
    const obj = orig.call(this, x, y, text, style);
    patchTextObject(obj);
    return obj;
  };
}

/** Patch a single Text object to maintain LINEAR filtering across updates. */
function patchTextObject(text: Phaser.GameObjects.Text): void {
  // Apply immediately
  applyLinearFilter(text);

  // Wrap setText — Phaser calls updateText() internally which re-uploads
  // the canvas texture with NEAREST. We re-apply LINEAR after.
  const origSetText = text.setText.bind(text);
  text.setText = function (value: string | string[]) {
    const result = origSetText(value);
    applyLinearFilter(text);
    return result;
  } as typeof text.setText;

  // Wrap setStyle — also triggers updateText
  const origSetStyle = text.setStyle.bind(text);
  text.setStyle = function (style: object) {
    const result = origSetStyle(style);
    applyLinearFilter(text);
    return result;
  } as typeof text.setStyle;

  // Wrap setColor — triggers canvas re-render
  const origSetColor = text.setColor.bind(text);
  text.setColor = function (color: string) {
    const result = origSetColor(color);
    applyLinearFilter(text);
    return result;
  } as typeof text.setColor;
}
