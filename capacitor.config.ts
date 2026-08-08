import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.chalkmap.questofknowledge',
  appName: 'Quest of Knowledge',
  webDir: 'dist',
  // The WKWebView's own background, visible ONLY while the web content is not painting.
  // Capacitor defaults it to UIColor.systemBackground (CAPBridgeViewController.swift:319), i.e.
  // WHITE. That is the white screen the owner reported on 2026-08-08 when iOS terminated the web
  // content process mid-encounter and Capacitor reloaded: the flash is this colour showing through
  // the gap before the reloaded page paints. It is not a game surface -- html/body are #0a0a14,
  // #qok-ui is #15161c and the Phaser clear colour is #111111, so nothing in the content is white.
  // This does not fix the termination; it stops the gap being a white flash on a dark game.
  backgroundColor: '#0a0a14'
};

export default config;
