import { RESIDENTS, type ResidentId, type ResidentLine, type ResidentConversation } from './farmLife';
import type { FarmWeather } from './farmTown';

type Exchange = readonly [string, string];

function callName(from: ResidentId, to: ResidentId): string {
  if (from === 'chicken') return RESIDENTS[to].name;
  if (to === 'chicken') return '坤坤';
  if ((from === 'xiaoba' || from === 'yujie' || from === 'weigang') && to === 'door') return '爸';
  if ((from === 'xiaoba' || from === 'yujie' || from === 'weigang') && to === 'gu') return '妈';
  if ((from === 'yujie' || from === 'weigang') && to === 'xiaoba') return '哥';
  if (from === 'weigang' && to === 'yujie') return '二哥';
  return RESIDENTS[to].name;
}

const SCENES: { place?: RegExp; night?: boolean; weather?: FarmWeather; rainbow?: boolean; lines: readonly Exchange[] }[] = [
  { weather: 'rain', lines: [['{to}，这雨下得还挺密，咱先在屋檐下避一会儿吧！', '嗯，刚好菜地也不用急着浇水了，老天爷帮大忙啦。'], ['听着雨点打在瓦片上，倒觉得院子特别安静。', '就是别淋着风着凉，待会儿回屋喝口热的。'], ['行，等雨势小点咱们再去看一眼嫩苗。', '嗯，这会儿就先在这儿歇口气听听雨。']] },
  { weather: 'rain', night: false, lines: [['{to}，雨天路滑，你刚才跑过来鞋湿了没？', '还好还好，就沾了点水花，赶紧往屋檐底下钻了。'], ['下雨天正好偷个懒，平时总忙得停不下来。', '哈哈，那咱俩就在檐下边躲雨边瞎聊几句呗。'], ['等会儿要是雨过天晴，说不定还能撞见彩虹呢！', '那我可得盯紧天边，一出来就喊大家来看。']] },
  { rainbow: true, lines: [['{to}！快抬头看天边，刚才那场雨过后居然出彩虹了！', '哇，颜色好清楚！刚好挂在咱们菜地和池塘上空。'], ['难得碰上这么漂亮的彩虹，今天的疲惫一下子散了一半。', '我也觉得，站广场上多看两眼再回去干活。'], ['快趁彩虹还没散，多记在心里一会儿！', '嗯，今天这趟雨淋得可太值啦。']] },
  { place: /pond/, weather: 'clear', lines: [['{to}，池边这么静，你盯着水面发呆在想啥呢？', '没想大事，看浮漂不动的时候，脑子也跟着放空一下。'], ['真要一直空竿，你也不嫌闷？', '换个钓位接着蹲呗，总不能鱼不咬钩就先急眼。'], ['那我站旁边陪你吹会儿风，不催你收竿。', '行呀，有人搭话，空军也没那么尴尬。']] },
  { place: /farm/, weather: 'clear', lines: [['{to}，这片地今天看着精神不少，你刚翻过土？', '刚看了一圈，趁太阳还不毒先浇了一轮，省得下午干透。'], ['活儿别全一个人包圆了，留一垄给我干嘛。', '那西边那几株苗交给你盯着，浇水别浇太满。'], ['包在我身上，回头真收了头一茬先给你尝。', '行，这话我可记着呢。']] },
  { night: true, lines: [['{to}，天都黑透了，怎么还没回屋歇着？', '白天还有点零碎事没想顺，顺手在院子里走两步。'], ['别硬撑着在脑子里转圈啦，记一行明早再弄。', '也是，夜里越想越钻牛角尖，睡醒反倒清楚。'], ['走吧，屋里汤还温着，喝一口早点睡。', '嗯，这就回去，今晚不熬了。']] },
  { lines: [['{to}，今天要是能偷半个下午的懒，你最想干嘛？', '找把椅子靠树荫下发会儿呆，啥正事也不想。'], ['要不要我顺手端壶茶过来，咱俩一块偷懒？', '太懂我了，别聊大道理，就安安静静喝茶。'], ['成交，等会儿真偷到懒我喊你。', '说好了，不许临时反悔去干活。']] },
  { lines: [['{to}，我脑子里刚冒出个半成品点子，有点拿不准。', '别捂着呀，说最让你兴奋的那一小截听听。'], ['我就怕说出来太粗糙，被你一眼挑出一堆毛病。', '放心，今天只帮你想怎么更好玩，不给你打分。'], ['那我先画个草图，晚饭后拿来给你参谋。', '行，我等着看你的新花样。']] },
  { lines: [['{to}，你平时听歌是先记住曲子，还是先被哪句歌词戳中？', '经常是某一句刚好撞上那天心情，循环一整晚。'], ['哈哈，我也是，有时副歌跑调也要跟着哼两句。', '哼着玩嘛，又不是上台比赛，自己舒坦最重要。'], ['那改天院子里没人，你给我唱一段拿手的？', '等我把换气那句练顺，到时候不许笑场。']] },
  { lines: [['{to}，看小说的时候，如果主角中途犯了浑，你还会接着看吗？', '看他后来怎么补救呗，真肯改过反而比完美人设鲜活。'], ['就是说，光嘴上说句对不起可糊弄不过去。', '对，下回再遇上同样关口，选不一样的路才算数。'], ['那你最近看的那本，主角后面立住了没？', '立住了，回头借你翻翻，前几章熬过去可上头了。']] },
  { lines: [['{to}，卡在一道难题上时，你会死磕到底还是先放放？', '以前老死磕，后来发现起身倒杯水回来，思路自己就通了。'], ['我就怕一放手，再捡起来又要从头理一遍。', '把卡住的那个条件顺手写纸条上，回来一眼就接得上。'], ['这招靠谱，下次卡壳我也试试不硬熬。', '嗯，脑子跟土地一样，也得歇歇墒。']] },
  { place: /house|plaza|bench/, lines: [['{to}，今晚要是搭伙做顿饭，你认领哪道工序？', '洗菜切配交给我，掌勺还是留给有把握的人，免得炸厨房。'], ['哈哈，其实少放盐、火别太旺，你也完全能上手。', '那你站旁边指挥，我先拿个最简单的菜练手。'], ['行，但说好谁偷吃最多谁最后刷碗。', '这规矩我举双手赞成，先把碗筷分明。']] },
  { lines: [['{to}，刚才院子吹过来的风带着点青草味，挺舒服的。', '嗯，比闷在屋里盯屏幕强多了，眼睛都松快不少。'], ['咱家这小院子虽然不大，待久了倒真舍不得走。', '主要是家里人都在眼皮底下，热闹又踏实。'], ['走，再去菜地边转一圈看看有没有藏虫子。', '行，顺便瞅瞅坤坤又跑哪儿玩去了。']] },
  { lines: [['{to}，要是给农场添一条秘密小路，你想通到哪儿去？', '通到池塘后面那块树荫，摆张小桌子看书钓鱼两不误。'], ['那入口得藏巧妙点，别让人一眼就走岔迷路。', '主路留灯，岔路放几块圆石子当记号，留给细心的人发现。'], ['这主意妙啊，改天咱真按这个思路摆几块石头试试。', '说干就干，下午找几块好看的鹅卵石。']] },
  { lines: [['{to}，你觉得顺手的小工具，最该替人省掉哪一步？', '每天都得重复干、最磨人的那一步，省下来就爽多了。'], ['不过手滑点错的时候，也得让人有后悔药可吃。', '太对了，越顺手越要留个撤回键，才敢放心用。'], ['等回头我真鼓捣出个小玩意，第一个请你当试用官。', '没问题，我保证给你测出最刁钻的边角情况。']] },
];

const PET_SCENES: readonly { night?: boolean; weather?: FarmWeather; rainbow?: boolean; lines: readonly Exchange[] }[] = [
  { weather: 'rain', lines: [['坤坤，外面下雨啦，快缩回干稻草里别淋湿羽毛！', '咕咕！雨点嗒嗒响，{to}陪着我就一点都不怕！'], ['对，乖乖在窝边避雨，等雨停了再出去找虫子。', '咕，淋湿翅膀会变重，坤坤听话躲雨！'], ['真乖，待会儿雨停给你抓把干爽的谷粒。', '咕咕！那我先抖抖羽毛等雨停！']] },
  { rainbow: true, night: false, lines: [['坤坤快看天上，雨停出大彩虹啦！', '咕咕！红橙黄绿像彩色的大虫子挂在天上！'], ['哈哈，那是彩虹不是虫子，今天空气多舒服呀。', '咕！我要在草地上转两圈晒干羽毛！'], ['去吧去吧，别跑太远哦。', '咕咕！太阳和彩虹都在陪坤坤玩！']] },
  { weather: 'clear', night: false, lines: [['坤坤，别老蹲角落，过来晒晒太阳？', '咕，{to}在旁边的话，我就往前挪两步！'], ['放心，我不突然抱你，你想走随时走。', '咕咕，那我把翅膀摊开晒暖和点。'], ['行，你就安心眯一会儿，我在这儿看着。', '咕，太阳暖暖的，真舒服呀。']] },
  { lines: [['坤坤，今天想听故事还是去菜地边找虫子？', '咕，先听一小段故事，听完再去抓大虫！'], ['好，那讲一只认得家人脚步声的小鸡，行不行？', '咕，结尾要有一大碗香喷喷的米粒！'], ['当然有，满满一碗摆在鸡窝门口。', '咕咕，{to}讲的故事最好听啦！']] },
  { lines: [['坤坤，昨晚窝里稻草铺得够不够软？', '咕，软乎乎的！风一吹进来也不冷。'], ['那白天胆子大一点，别一听见响动就钻草堆。', '咕，听出是{to}的脚步我才不躲呢！'], ['哈哈，真机灵，走，给你抓把谷粒去。', '咕咕！坤坤跑得可快啦！']] },
];

/** Pair history, rather than the movement animation counter, controls repetition. */
export function ambientConversation(
  pair: readonly [ResidentId, ResidentId],
  history: readonly ResidentConversation[],
  place: string,
  night: boolean,
  roll: number,
  weather: FarmWeather = 'clear',
  rainbow = false,
): Omit<ResidentLine, 'at'>[] {
  const previous = history.filter(record => record.source === 'encounter' && pair.every(id => record.participants.includes(id)));
  const recent = new Set(previous.slice(-4).map(record => record.lines[0]?.text));
  const pet = pair.includes('chicken');
  const preferences: Partial<Record<ResidentId, number[]>> = { door: [7, 9, 10, 14], gu: [4, 11, 12], xiaoba: [7, 9, 13], yujie: [8, 9, 12], weigang: [3, 10] };
  const candidates = pet
    ? PET_SCENES.flatMap(scene => {
        if (scene.night !== undefined && scene.night !== night) return [];
        if (scene.weather && scene.weather !== weather) return [];
        if (scene.rainbow && !rainbow) return [];
        const weatherHit = (scene.weather === 'rain' && weather === 'rain') || (scene.rainbow && rainbow);
        return weatherHit ? [scene.lines, scene.lines, scene.lines] : [scene.lines];
      })
    : SCENES.flatMap((scene, index) => {
        if (scene.night !== undefined && scene.night !== night) return [];
        if (scene.weather && scene.weather !== weather) return [];
        if (scene.rainbow && !rainbow) return [];
        const weatherHit = (scene.weather === 'rain' && weather === 'rain') || (scene.rainbow && rainbow);
        return [
          scene.lines,
          ...(weatherHit ? [scene.lines, scene.lines] : []),
          ...(scene.place?.test(place) || scene.night === night ? [scene.lines] : []),
          ...(pair.some(id => preferences[id]?.includes(index)) ? [scene.lines] : []),
        ];
      });
  const order = pet && pair[0] === 'chicken' ? [pair[1], pair[0]] : pair;
  const renderLine = (text: string, speaker: ResidentId, partner: ResidentId) =>
    text.replaceAll('{to}', callName(speaker, partner));
  const linesFor = (lines: readonly Exchange[]) => lines.flatMap((exchange, round) =>
    pair.map(speaker => {
      const partner = speaker === pair[0] ? pair[1] : pair[0];
      const raw = pet && pair[0] === 'chicken' && speaker !== 'chicken'
        ? (weather === 'rain'
            ? ['坤坤快进窝避雨，我在这儿陪着你呢。', '外面在下雨，先把羽毛抖干别着凉。', '乖，等雨停了再一起出去玩。'][round]
            : night
              ? ['坤坤慢慢来，夜里风凉我就在这儿陪着你呢。', '不用急，先在窝边暖暖羽毛再歇着。', '好，家里随时给你留着最暖和的位置。'][round]
              : ['坤坤慢慢来，我就在这儿陪着你呢。', '不用急，咱们晒会儿太阳再说。', '好，家里随时给你留着最暖和的位置。'][round])
        : exchange[order.indexOf(speaker)];
      return { speaker, text: renderLine(raw, speaker, partner) };
    }),
  );
  const available = candidates.filter(lines => !recent.has(linesFor(lines)[0].text));
  const pool = available.length ? available : candidates;
  const index = (Math.floor(Math.max(0, Math.min(0.999999, roll)) * pool.length) + previous.length) % pool.length;
  return linesFor(pool[index]);
}
