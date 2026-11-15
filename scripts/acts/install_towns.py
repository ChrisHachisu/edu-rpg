#!/usr/bin/env python3
"""Install the Acts 2-5 hi-fi towns beside Act 1's, under public/act1-hifi/town/.

    python3 scripts/acts/install_towns.py <towns root>      # then scripts/build_acts_hifi_manifest.py

<towns root>/town/ holds, per town, <id>-screen.png, <id>-walkable.json, <id>-town.json and
npc/<id>-<npc>-4x3-64.png (the Act 1 layout: act1-hifi/town.html reads ./town/<id>-town.json).
This copies them and writes public/acts-hifi/towns.json, which the index builder folds into
public/acts-hifi/manifest.json: the list of installed towns, and the EN / kana / kanji texts of a
town the frozen bundle has no map for.

The overworld half of each town's exit (town.json exit.toX/toY) is NOT taken from the package:
scripts/build_acts_hifi_manifest.py writes it from the door's exit cell in the installed art.

CINDERWATCH has no map, shop or text in the bundle. It is entered as its host town's engine map
(HOST below: the other Act 4 town, so stock, prices and healer are Act 4's), and only its plate,
people and exit are its own. Its three townspeople speak from STRINGS; healer and shopkeeper use
the bundle's keys like every other town.
"""
import glob, json, os, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DST = os.path.join(ROOT, 'public/act1-hifi/town')
OUT = os.path.join(ROOT, 'public/acts-hifi/towns.json')
ACT1 = {'greenhollow', 'millbrook', 'portSapphire'}
HOST = {'cinderwatch': 'embersRest'}
# Keep the three columns in step (AGENTS.md rule 8). Kana and kanji follow the bundle's spacing.
STRINGS = {
    'map.cinderwatch': {'en': 'Cinderwatch', 'ja': 'シンダーウォッチ', 'jaKanji': 'シンダーウォッチ'},
    'npc.watchCaptain.name': {'en': 'Watch Captain', 'ja': 'みはりたいちょう', 'jaKanji': '見張り隊長'},
    'npc.watchCaptain': {
        'en': 'This watchtower keeps an eye on the fire mountain. The Volcanic Forge lies far to the west. Rest here before you go.',
        'ja': 'この みはりだいは ひのやまを みはっている。かざんのかじばは はるか にしだ。たびだつ まえに ここで やすんでいけ。',
        'jaKanji': 'この 見張り台は 火の山を 見張っている。火山の鍛冶場は はるか 西だ。旅立つ 前に ここで 休んでいけ。'},
    'npc.ashScout.name': {'en': 'Ash Scout', 'ja': 'はいのせっこう', 'jaKanji': '灰の斥候'},
    'npc.ashScout': {
        'en': 'I scout the ash fields. The Ember Mines are to the east. The monsters there are tough, so stock up first!',
        'ja': 'はいの げんやを ていさつ しているんだ。ひのこのこうざんは ひがしに ある。まものが てごわいから、じゅんびを わすれるなよ！',
        'jaKanji': '灰の 原野を 偵察しているんだ。火の粉の鉱山は 東に ある。魔物が 手ごわいから、準備を 忘れるなよ！'},
    'npc.cinderVillager.name': {'en': 'Villager', 'ja': 'むらびと', 'jaKanji': '村人'},
    'npc.cinderVillager': {
        'en': 'Ash falls here like snow. We sweep it every morning, and by night it is back!',
        'ja': 'ここでは はいが ゆきみたいに ふるの。まいあさ はいても、よるには もとどおりよ！',
        'jaKanji': 'ここでは 灰が 雪みたいに 降るの。毎朝 掃いても、夜には 元どおりよ！'},
}
# Directions in the bundle's own text that the new map moved (E3 playthrough): acts-runtime.js shows
# `geo.<bundle key>` instead of the bundle's text for that key, in the player's language.
STRINGS.update({
    'geo.dungeon.shadowCave.locked': {
        'en': 'A dark barrier seals the cave entrance... Perhaps a crystal shard from the Storm Nest far to the south could break it.',
        'ja': 'やみの けっかいが みちを ふさいでいる…あらしのすの かけらが ひつようだ。',
        'jaKanji': '闇の 結界が 道を 塞いでいる…嵐の巣の 欠片が 必要だ。'},
    'geo.npc.gordo.questReminder': {
        'en': 'Still need 3 Iron Ore! Head west to the Iron Mine dungeon. The beasts inside drop ore when defeated. Good ore makes a good blade, remember?',
        'ja': 'てつこうせき 3つ、まだかのう？にしの てつこうざんダンジョンへ いくんじゃ。なかの けものを たおせば こうせきが てにはいるぞ！いい こうせきは いい けんを つくる！',
        'jaKanji': '鉄鉱石 3つ、まだかのう？西の 鉄鉱山ダンジョンへ 行くんじゃ。中の 獣を 倒せば 鉱石が 手に入るぞ！いい 鉱石は いい 剣を 作る！'},
    'geo.npc.soldier': {
        'en': 'Fierce winds howl through the mountain pass to the east. No one can get through! Maybe if someone stopped whatever is causing those storms...',
        'ja': 'ひがしの やまみちを はげしい かぜが ふきあれている。だれも とおれん！あらしの げんいんを とめれば とおれるかもしれんが…',
        'jaKanji': '東の 山道を 激しい 風が 吹き荒れている。誰も 通れん！嵐の 原因を 止めれば 通れるかもしれんが…'},
    'geo.npc.blacksmith': {
        'en': 'The Iron Mine is west of town. And that Storm Nest to the south? The harpy there controls the winds blocking the mountain pass.',
        'ja': 'てつのこうざんは まちの にしにある。みなみの あらしのす？あそこの ハーピーが やまみちの かぜを あやつっているんだ。',
        'jaKanji': '鉄の鉱山は 町の 西にある。南の 嵐の巣？あそこの ハーピーが 山道の 風を 操っているんだ。'},
    'geo.npc.frostElder': {
        'en': 'The frozen lake lies just south of here. Be careful, the ice can be treacherous. The haunted forest to the northeast is thick and dark.',
        'ja': 'みなみに こおりのみずうみが ある。きをつけろ、こおりは あぶないぞ。ほくとうの おばけのもりは うっそうと くらい。',
        'jaKanji': '南に 氷の湖が ある。気をつけろ、氷は 危ないぞ。北東の お化けの森は 鬱蒼と 暗い。'},
    'geo.npc.frostGuard': {
        'en': "The frozen lake to the south is treacherous. Watch your step on the ice. Once you start sliding, you can't stop!",
        'ja': 'みなみの こおりのみずうみは あぶないぞ。こおりの うえを すべりだしたら とまれない！',
        'jaKanji': '南の 氷の湖は 危ないぞ。氷の上を 滑り出したら 止まれない！'},
    'geo.npc.mountaineer': {
        'en': 'Enter the haunted forest from the south side and find your way through. Ravenhollow awaits on the other side, and beyond it, the Shadow Cave.',
        'ja': 'みなみから おばけのもりに はいって ぬけるんだ。むこうがわに レイヴンホロウが あって、そのさきに かげのどうくつが あるぞ。',
        'jaKanji': '南から お化けの森に 入って 抜けるんだ。向こう側に レイヴンホロウが あって、その先に 影の洞窟が あるぞ。'},
    'geo.npc.hauntedElder': {
        'en': 'Welcome to Ravenhollow... We live in the shadow of the haunted forest. The Shadow Cave lies to the west. Only the brave dare enter.',
        'ja': 'レイヴンホロウへ ようこそ…わしらは おばけのもりの かげに すんでおる。にしに かげのどうくつが ある。ゆうきある ものだけが はいれるぞ。',
        'jaKanji': 'レイヴンホロウへ ようこそ…わしらは お化けの森の 影に 住んでおる。西に 影の洞窟が ある。勇気ある 者だけが 入れるぞ。'},
    'geo.npc.hauntedVillager': {
        'en': 'The haunted forest stretches to the east, twisted trees and fell creatures. But coming out this side means you made it through!',
        'ja': 'ひがしに おばけのもりが ひろがっている。ねじれた きと おそろしい まもの…でも こっちがわに でてきたなら ぬけた しょうこだ！',
        'jaKanji': '東に お化けの森が 広がっている。捻れた 木と 恐ろしい 魔物…でも こちら側に 出てきたなら 抜けた 証拠だ！'},
    'geo.npc.oasisElder': {
        'en': 'The Desert Tomb to the north holds an ancient guardian. Defeat it, and the way to the volcanic region will open!',
        'ja': 'きたの さばくのはかには いにしえの ばんにんが いる。たおせば かざんちたいへの みちが ひらけるぞ！',
        'jaKanji': '北の 砂漠の墓には 古の 番人が いる。倒せば 火山地帯への 道が 開けるぞ！'},
    'geo.npc.explorer': {
        'en': 'Follow the highland corridor north all the way to reach the Volcanic Forge. The Flame Titan guards passage to the demon realm!',
        'ja': 'こうちのかいろうを きたに すすめば かざんのかじばに たどりつくぞ。ほのおのきょじんが まおうの りょうどへの みちを ふさいでいる！',
        'jaKanji': '高地の 回廊を 北に 進めば 火山の鍛冶場に たどり着くぞ。炎の巨人が 魔王の 領土への 道を 塞いでいる！'},
    'geo.npc.priestess': {
        'en': 'The Aegis of Dawn is in the Celestial Vault to the south. But you need Excalibur first to break its seal!',
        'ja': 'あけぼののイージスは みなみの てんくうのほこらに あるわ。でも ふういんを とくには エクスカリバーが いるの。',
        'jaKanji': '暁のイージスは 南の 天空の祠に あるわ。でも 封印を 解くには エクスカリバーが いるの。'},
    'geo.npc.veteran': {
        'en': 'Your grandmother used Excalibur and the Aegis of Dawn to seal Malachar. Find them before facing him! Excalibur is in a sanctum far to the southwest.',
        'ja': 'むかし ばあさんが エクスカリバーと あけぼののイージスで まおうを ふういんしたぞ。なんせいの せいいきに エクスカリバーが ねむっている。',
        'jaKanji': '昔 ばあさんが エクスカリバーと 暁のイージスで 魔王を 封印したぞ。南西の 聖域に エクスカリバーが 眠っている。'},
})


# The package stands the Forgemaster (who gives flameCloak, the Ember Mines' story gate) on the
# lava ledge: the ground south of him, where town.html's talk band is, is lava, leaving a strip
# a few px tall to talk to him from. He stands on the paving just north of the ledge instead
# (scripts/check_town_talkable.py: 114 -> 1258 reachable px).
NPC_CELL = {('embersRest', 'forgemaster'): [38.59, 16.0]}


def main(src_root):
    src = os.path.join(src_root, 'town')
    ids = sorted(os.path.basename(p)[:-len('-town.json')] for p in glob.glob(os.path.join(src, '*-town.json')))
    assert ids and not (set(ids) & ACT1), ids
    os.makedirs(os.path.join(DST, 'npc'), exist_ok=True)
    files = 0
    for tid in ids:
        t = json.load(open(os.path.join(src, f'{tid}-town.json')))
        assert t['id'] == tid and t['screen'] == f'town/{tid}-screen.png' and t['walkable'] == f'town/{tid}-walkable.json', tid
        if tid in HOST:
            t['shopId'] = HOST[tid]
            t['_hostNote'] = (f'No map in the frozen bundle: entered as the engine map {HOST[tid]} (acts-hifi/acts-runtime.js, '
                              'index `virtual`); shopId is the host\'s. Texts: acts-hifi/manifest.json `strings`.')
            for n in t['npcs']:
                s = STRINGS.get(n.get('dialogueKey'))
                if s: n['text'] = s['en']; n.pop('_proposal', None)
                s = STRINGS.get(n.get('nameKey'))
                if s: n['name'] = s['en']
        for n in t['npcs']:
            if (tid, n['id']) in NPC_CELL: n['cell'] = NPC_CELL[(tid, n['id'])]
            sheet = os.path.join(src_root, n['sheet'])
            assert os.path.isfile(sheet), sheet
            shutil.copy(sheet, os.path.join(DST, 'npc', os.path.basename(sheet))); files += 1
        for suffix in ('screen.png', 'walkable.json'):
            shutil.copy(os.path.join(src, f'{tid}-{suffix}'), os.path.join(DST, f'{tid}-{suffix}')); files += 1
        json.dump(t, open(os.path.join(DST, f'{tid}-town.json'), 'w'), indent=1, ensure_ascii=False); files += 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'towns': ids, 'hosts': HOST, 'strings': STRINGS}, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(f'installed {len(ids)} towns ({files} files) -> {DST}; wrote {OUT}')


if __name__ == '__main__':
    main(sys.argv[1])
