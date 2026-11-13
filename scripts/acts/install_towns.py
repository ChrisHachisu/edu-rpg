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
