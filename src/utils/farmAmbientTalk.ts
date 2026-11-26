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
  { weather: 'rain', lines: [['{to}，这雨下得还挺密，咱先在屋檐下避一会儿吧！', '可不是嘛，刚好菜地省得浇水了，老天爷替咱们干活。'], ['听着雨点打瓦片噼里啪啦的，突然有点想喝热汤。', '走呀，待会儿回屋顺便把窗关紧点，别飘湿了。'], ['行，等雨小点再溜达出去看两眼。', '成，趁现在先偷会儿懒。']] },
  { weather: 'rain', night: false, lines: [['{to}，刚跑过来鞋湿了没？院子里全是水洼。', '沾了一点边，差点一脚踩水坑里溅一身。'], ['哈哈，下雨天正好名正言顺摸会儿鱼！', '那咱俩就在檐下边躲雨边瞎唠两句呗。'], ['等会儿停雨说不定能碰上彩虹呢。', '真出了你喊我一嗓子，别自己偷偷看完！']] },
  { rainbow: true, lines: [['{to}！快抬头看天边，刚才那场雨过后居然出彩虹了！', '哇，颜色好清楚！刚好挂在咱们院子上空。'], ['难得撞见这么亮的彩虹，瞬间精神了。', '赶紧多看两眼，不然待会儿云一飘就没了。'], ['今天这趟雨淋得值啦！', '确实，感觉全院子都亮堂起来了。']] },
  { place: /pond/, weather: 'clear', lines: [['{to}，池边风真凉快，你站这儿看啥呢？', '没啥，看水面上那只小蜻蜓停半天了，挺逗的。'], ['哈哈，你俩大眼瞪小眼呐？', '可不，我刚一抬手它又飞高了，精得很。'], ['那我也蹭会儿树荫，顺便吹吹风。', '来呗，这儿比屋里凉快多了。']] },
  { place: /farm/, weather: 'clear', lines: [['{to}，这片苗今天看着精神不少，你刚收拾过？', '刚顺手拔了点杂草，太阳还没太毒就先干完了。'], ['别啥都一个人包圆啊，留点活儿给我也行。', '那傍晚浇水归你，不许临时溜号。'], ['包在我身上，到时候保证浇得透透的。', '行，这话我可记住了。']] },
  { night: true, lines: [['{to}，这么晚了怎么还在院子里溜达？', '刚吃完饭出来消消食，夜里风吹着挺舒服。'], ['别待太久着凉了，屋里还温着热茶呢。', '知道啦，再转两圈我就回屋。'], ['行，回去顺手把院门插上。', '好嘞，今晚早点睡。']] },
  { lines: [['{to}，今天要是能光明正大偷半天懒，你最想干嘛？', '搬把椅子瘫树荫下吃冰西瓜，啥正事也不想。'], ['那算我一个，我还想顺便配袋瓜子！', '太懂行了，光唠闲嗑不干活，想想就美。'], ['说好了，哪天活少咱真这么干一回。', '拉钩，谁临时勤快起来谁请客！']] },
  { lines: [['{to}，你猜我刚才在院角看见谁偷啃菜叶了？', '八成又是坤坤吧？它每次都装得特无辜。'], ['哈哈猜对了，被我抓个正着还歪头装傻！', '别说它了，昨晚谁偷吃盘子里最后一块饼来着？'], ['咳咳，这个咱就别翻旧账了啊！', '看你心虚的，下回记得给我留一口！']] },
  { lines: [['{to}，今晚晚饭想吃点啥？我感觉有点馋面条了。', '番茄鸡蛋面怎么样？浇头多放点汤汁最香。'], ['太行了，再拌个脆脆的拍黄瓜绝配！', '那咱俩一个洗菜一个切配，省得一个人忙不过来。'], ['成交，谁最后磨蹭谁负责刷碗啊！', '没问题，先把规矩立好！']] },
  { lines: [['{to}，刚才院子吹过来的风带着点青草味，真舒服。', '可比闷在屋里舒服多了，感觉人都松快了。'], ['咱家这院子虽然不大，待久了真舍不得走。', '主要是家里人都在眼皮底下，吵吵闹闹的挺踏实。'], ['走，顺便去瞅瞅坤坤又跑哪儿疯去了。', '哈哈，刚才还听见它在草垛边咕咕叫呢。']] },
  { lines: [['{to}，我刚突然想起来，晾在绳子上的衣服收了没？', '哎呀！差点忘了，幸亏你提了一嘴！'], ['哈哈我就知道，每次都得靠最后关头救场。', '快快快，趁天色没变赶紧收进去，省得被吐槽。'], ['走，我帮你一块抱屋里去。', '够意思，回头请你吃最甜的果子！']] },
  { place: /house|plaza|bench/, lines: [['{to}，刚才好像闻见集市那边飘来烤面包的香味了。', '你也闻见了？害得我肚子立马跟着叫了两声。'], ['要不待会儿去瞅瞅，顺便买点零嘴回来？', '可以呀，买回来别全藏着，分大伙儿尝尝。'], ['放心，还能少了你的份儿不成？', '那我就在院子里坐等投喂啦！']] },
  { lines: [['{to}，你觉不觉得今天天上的云像刚揪下来的棉花糖？', '哈哈被你一说还真有点像，而且越看越饿。'], ['走，咱进屋泡壶热茶顺便垫两口点心？', '正合我意，再唠一会儿我真要喊饿了。'], ['那你去烧水，我去翻翻柜子里的甜饼！', '行，今天这顿下午茶归咱们俩先享用了！']] },
  { lines: [['{to}，刚才我路过篱笆边，看见一只胖麻雀站在木桩上歪头看我。', '哈哈是不是以为你要给它撒谷子呢？'], ['八成是，结果我两手空空，它居然白了我一眼就飞了。', '笑死，连院子里的麻雀都被咱们惯出脾气了。'], ['下回兜里得揣两粒麦子，免得再被它嫌弃。', '行，记得顺便给坤坤留一份，不然它得吃醋。']] },
  { lines: [['{to}，待会儿忙完手上这点活，要不要一起把院子角落那堆工具理一理？', '好呀，上次找个小铲子我都翻了半天。'], ['哈哈那是谁随手塞草垛旁边来着？', '哎呀别拆台嘛，回头我按顺手的位置摆齐整。'], ['成，两分钟就能收拾利索，以后省得满院子找。', '走，顺手把水壶也归位。']] },
];

const PET_SCENES: readonly { night?: boolean; weather?: FarmWeather; rainbow?: boolean; lines: readonly Exchange[] }[] = [
  { weather: 'rain', lines: [['坤坤，外面下雨啦，快钻回干稻草里别淋成落汤鸡！', '咕咕！雨点嗒嗒响，{to}陪着我就一点都不怕！'], ['乖，在窝边避雨，雨停了再出去撒欢。', '咕，淋湿翅膀飞不起来，坤坤听话躲雨！'], ['真机灵，待会儿给你抓把干爽的谷粒。', '咕咕！那我先抖抖羽毛等着！']] },
  { rainbow: true, night: false, lines: [['坤坤快看天上，出大彩虹啦！', '咕咕！红橙黄绿像彩色的大虫子挂在天上！'], ['哈哈，那是彩虹不是虫子，馋猫劲儿又犯了。', '咕！我要在草地上转两圈晒干羽毛！'], ['去吧去吧，别跑太远哦。', '咕咕！太阳和彩虹都在陪坤坤玩！']] },
  { weather: 'clear', night: false, lines: [['坤坤，别蹲角落发呆啦，过来晒晒太阳？', '咕，{to}在旁边的话，我就溜达过去！'], ['放心，不折腾你，你想眯会儿就眯会儿。', '咕咕，那我把翅膀摊开晒暖和点。'], ['行，太阳这么好，我也沾点光歇会儿。', '咕，暖烘烘的真舒服呀。']] },
  { lines: [['坤坤，刚在菜地边转悠啥呢，又想偷啄嫩叶？', '咕！坤坤才没有，坤坤是在帮忙抓大虫子！'], ['哈哈还嘴硬，嘴边还沾着草屑呢。', '咕咕！抓完虫子顺便尝一口不算偷吃！'], ['行行行，算你立功，来吃把正经谷粒吧。', '咕咕！{to}最好啦！']] },
  { lines: [['坤坤，昨晚窝里稻草铺得够不够软？', '咕，软乎乎的！风一吹进来也不冷。'], ['那白天胆子大一点，别一听见响动就钻草堆。', '咕，听出是{to}的脚步我才不躲呢！'], ['哈哈真机灵，走，给你拿点吃的去。', '咕咕！坤坤跑得可快啦！']] },
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
  const preferences: Partial<Record<ResidentId, number[]>> = { door: [5, 6, 9], gu: [4, 8, 10], xiaoba: [5, 7, 9], yujie: [6, 7, 11], weigang: [3, 8, 11] };
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
            ? ['坤坤快进窝避雨，我就在旁边陪着你。', '外面在下雨，先把羽毛抖干别着凉。', '乖，雨停了咱们再一块儿出去玩。'][round]
            : night
              ? ['坤坤慢点走，夜里风凉我陪你回窝。', '不用急，暖暖羽毛早点歇着。', '好啦，窝里稻草软乎乎的，放心睡吧。'][round]
              : ['坤坤慢慢来，太阳这么好一块儿晒会儿。', '别慌，没人跟你抢米粒。', '哈哈，真会挑暖和地方待着。'][round])
        : exchange[order.indexOf(speaker)];
      return { speaker, text: renderLine(raw, speaker, partner) };
    }),
  );
  const available = candidates.filter(lines => !recent.has(linesFor(lines)[0].text));
  const pool = available.length ? available : candidates;
  const index = (Math.floor(Math.max(0, Math.min(0.999999, roll)) * pool.length) + previous.length) % pool.length;
  return linesFor(pool[index]);
}
