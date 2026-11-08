import type { ResidentId, ResidentLine, ResidentConversation } from './farmLife';

type Exchange = readonly [string, string];
const SCENES: { place?: RegExp; night?: boolean; lines: readonly Exchange[] }[] = [
  { place: /pond/, lines: [['池边这么安静，你等鱼时会想什么？', '先看水面，没动静时就让脑子歇歇。'], ['一直没鱼来，也愿意等吗？', '会换个位置试试，但不急着怪运气。'], ['那我陪你站一会儿，不催你。', '好，有人陪着，空竿也没那么闷。']] },
  { place: /farm/, lines: [['你喜欢先把活干完，还是做一会儿歇一会儿？', '我想留点余力，免得后面照顾不过来。'], ['那不如各挑一件顺手的小事。', '行，先说好做哪件，不抢着包揽。'], ['忙不过来就喊我，别自己硬撑。', '你也一样，搭把手比客气有用。']] },
  { night: true, lines: [['天晚了，脑子却还不肯停？', '嗯，有些白天没想完的事。'], ['要不要只记一行，剩下明天想？', '这个办法好，省得一直惦记。'], ['那等你记完，我们就慢慢回去。', '好，今晚先不逼自己想出答案。']] },
  { lines: [['如果今天能留一小段时间，你想用来做什么？', '想安安静静做点自己喜欢的事。'], ['要我陪着，还是让你自己待会儿？', '先陪一会儿吧，不说话也行。'], ['行，你想说的时候我再听。', '这样挺好，不用急着把气氛填满。']] },
  { lines: [['有个没做完的点子，你会先给别人看吗？', '会犹豫，总怕别人觉得太粗糙。'], ['我倒愿意先看你最喜欢的那一小段。', '只看一小段，压力好像小多了。'], ['看完我先问你想改哪里，不急着打分。', '好，那我也能把真正的想法说出来。']] },
  { lines: [['同一首歌，你会先记旋律还是先听歌词？', '先记住打动我的那一句。'], ['有时不是唱得多好，是听着很像自己的心情。', '对，不过也不必每句都解释给别人。'], ['那下次你愿意唱时，我认真听。', '好，先让我把想唱的那句练顺。']] },
  { lines: [['故事里的人做错事，你还愿意看他往下走吗？', '愿意，但得看他后来怎么做。'], ['光说一句对不起，好像还不够。', '嗯，下一次遇到同样的事，选择才算数。'], ['我喜欢这种慢慢改过来的角色。', '我也是，变化小一点反而更可信。']] },
  { lines: [['你会把难题放一放，过会儿再回来吗？', '会，有时候卡住只是太累了。'], ['我老怕一停下就再也不想做。', '那先给自己留个最小的下一步。'], ['比如只写下还没想明白的那个条件。', '对，回来时就不用从头找路。']] },
  { place: /house|plaza|bench/, lines: [['一起做饭时，你想负责哪一步？', '我挑自己有把握的，别把厨房越帮越乱。'], ['没把握也可以先问，别憋着。', '那你告诉我标准，我慢慢试。'], ['说好了，做好以后一起收拾。', '这个当然，不能只抢着吃。']] },
  { lines: [['你喜欢别人直接提建议，还是先听你说完？', '先听完吧，不然我会觉得自己没讲清楚。'], ['那我刚才如果插话太快，你提醒我。', '好，我也试着把最在意的先说出来。'], ['我们不用一下子想法完全一样。', '能知道彼此为什么这么想，就够好了。']] },
  { lines: [['你设计的小路，是想让人快点到，还是多看看？', '先让人不迷路，再留一点可以探索的地方。'], ['岔路太多，第一次来的人会犯愁。', '那就把主路画清楚，秘密放在旁边。'], ['等有个小版本，叫我来试着走走。', '好，我想看看哪里会让人犹豫。']] },
  { lines: [['你觉得好用的工具，最该省掉哪一步？', '先省掉每天都要重复的那一步。'], ['但出错以后，也要让人能改回来。', '对，不能为了快，把选择都藏起来。'], ['那先拿一件小事试，别一口气做太大。', '好，试过再决定要不要继续。']] },
];
const PET_SCENES: readonly Exchange[][] = [
  [['要不要在这边坐一会儿，坤坤？', '咕，这里听得到家人的声音。'], ['我不抱你，你想走就自己走。', '咕咕，那我再靠近一点。'], ['好，慢慢来。', '咕，我陪你待着。']],
  [['坤坤，今天想听故事还是晒晒翅膀？', '咕，先听一小段！'], ['那讲一只找回家路的小鸡，好不好？', '咕，要有人在门口等它。'], ['好，就让家人在小窝旁等。', '咕咕，这个结尾暖暖的。']],
  [['坤坤，窝里待着安心吗？', '咕，听见脚步声就安心。'], ['怕的时候不用硬往人多的地方挤。', '咕，我会先看看再过去。'], ['我们都在这儿，你自己选。', '咕，那我先蹲你旁边。']],
];

/** Pair history, rather than the movement animation counter, controls repetition. */
export function ambientConversation(pair: readonly [ResidentId, ResidentId], history: readonly ResidentConversation[], place: string, night: boolean, roll: number): Omit<ResidentLine, 'at'>[] {
  const previous = history.filter(record => record.source === 'encounter' && pair.every(id => record.participants.includes(id)));
  const recent = new Set(previous.slice(-4).map(record => record.lines[0]?.text));
  const pet = pair.includes('chicken');
  const preferences: Partial<Record<ResidentId, number[]>> = { door: [4, 6, 7, 11], gu: [1, 8, 9], xiaoba: [4, 6, 10], yujie: [5, 6, 9], weigang: [0, 7] };
  const candidates = pet ? PET_SCENES : SCENES.flatMap((scene, index) => scene.night !== undefined && scene.night !== night ? [] : [scene.lines, ...(scene.place?.test(place) || scene.night === night ? [scene.lines] : []), ...(pair.some(id => preferences[id]?.includes(index)) ? [scene.lines] : [])]);
  const order = pet && pair[0] === 'chicken' ? [pair[1], pair[0]] : pair;
  const linesFor = (lines: readonly Exchange[]) => lines.flatMap((exchange, round) => pair.map(speaker => ({ speaker, text: pet && pair[0] === 'chicken' && speaker !== 'chicken' ? ['我在这里陪你，想靠近就慢慢来。', '你不用着急，我们慢慢说。', '好，家里一直给你留着位置。'][round] : exchange[order.indexOf(speaker)] })));
  const available = candidates.filter(lines => !recent.has(linesFor(lines)[0].text));
  const pool = available.length ? available : candidates;
  const index = (Math.floor(Math.max(0, Math.min(.999999, roll)) * pool.length) + previous.length) % pool.length;
  return linesFor(pool[index]);
}
