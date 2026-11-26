import { FARM_TOPICS, RESIDENTS, type FarmTopicId, type ResidentId, type ResidentLine } from './farmLife';
import type { RelayIntent } from './farmAssignment';

export type ResidentMood = '平静' | '好奇' | '开心' | '低落' | '不服气' | '松了口气';

export interface FarmDiscussion {
  topic?: FarmTopicId;
  question?: string;
  intent?: RelayIntent;
  relayedBy?: ResidentId;
  kind: 'discussion' | 'debate' | 'followup' | 'request';
}

/** Reject obvious topic loss in generated request replies; keep natural colloquial answers alive. */
export function requestBatchOnTopic(
  question: string,
  lines: readonly { text: string; speaker?: ResidentId }[],
  target?: ResidentId,
  intent?: RelayIntent,
): boolean {
  let content = question;
  for (const resident of Object.values(RESIDENTS)) content = content.replaceAll(resident.name, ' ');
  content = content.replace(/伟刚|伟纲|唯纲|客人|帮我|替我|你去|去找|找他|问问|问一下|质问|转告|转达|告诉|带话|传话|一下|这件事|刚才|为什么|聊聊|说说/g, ' ');
  const terms = content.match(/[\p{Script=Han}a-zA-Z0-9]+/gu) ?? [];
  const noise = /我|你|他|她|这个|那个|一下|的话|事情|怎么|什么|时候|可以|能不能|是不是|好的|问题|客人|说的|想问|喜欢|觉得/;
  const anchors = terms.flatMap(term => Array.from({ length: Math.max(0, term.length - 1) }, (_, i) => term.slice(i, i + 2))).filter(term => !noise.test(term));
  const semantic: [RegExp, RegExp][] = [
    [/骂|辱|损|怼|呛/, /骂|辱|凶|呛|怼|损|吵|冤枉|误会|造谣|瞎说|瞎传|胡说|哪有|没说|原话|言语|说重|语气|冒犯|气话/],
    [/欺负|欺凌/, /欺负|欺凌|委屈|针对|招惹|冤枉|误会/],
    [/几点|什么时候|何时/, /时间|几点|时候|点钟|安排|还没定|晚点|早上|中午|晚上|明天|待会|一会儿/],
    [/回家/, /回家|回屋|回去|晚归|等你|马上回/],
    [/浇水/, /浇水|水壶|土壤|缺水|湿|浇过/],
    [/音乐|唱歌/, /音乐|唱歌|歌曲|唱|副歌|嗓子|旋律|哼/],
    [/吃什么|晚饭|午饭|早饭|吃饭|热汤/, /吃|饭|汤|菜|面|饼|厨房|做饭|饿|馋/],
    [/夸|好听|棒|厉害|辛苦/, /谢谢|谢|开心|高兴|夸|好听|辛苦|客气|嘿|不好意思|脸红/],
    [/道歉|对不起|赔礼|原谅/, /道歉|对不起|没关系|没事|算了|翻篇|原谅|别在意|消气|过去/],
    [/熬夜|早睡|睡觉|休息/, /熬夜|睡|歇|休息|电脑|晚安|太晚|困/],
  ];
  const matches = (text: string) => anchors.some(anchor => text.includes(anchor)) || semantic.some(([source, reply]) => source.test(question) && reply.test(text));
  const required = semantic.filter(([source]) => source.test(question));
  const unrelated = [/游戏|关卡|地图/, /钓鱼|鱼竿|钓位|浮漂/, /音乐|唱歌|副歌/, /种菜|播种|浇水/, /小说|故事|读书/, /数学|方程/, /工具|编程|电脑/].filter(topic => !topic.test(question));
  const replies = lines.filter(line => !target || line.speaker === target);
  if (!replies.length) return false;

  // Pure convey/invite relays only need a substantive, non-drifting acknowledgement from target.
  if (intent === 'convey' || intent === 'invite') {
    const substantive = replies.some(line => line.text.trim().length >= 4 && !/^(?:嗯|好|行|知道了)[。！!]?$/.test(line.text.trim()));
    const onTrack = lines.every(line => !unrelated.some(topic => topic.test(line.text)) || matches(line.text));
    return substantive && onTrack;
  }

  if (!anchors.length && !semantic.some(([source]) => source.test(question))) return false;
  return replies.some(line => matches(line.text)) &&
    required.every(([, reply]) => replies.some(line => reply.test(line.text))) &&
    lines.every(line => !unrelated.some(topic => topic.test(line.text)) || matches(line.text));
}

export const RESIDENT_OUTLOOK: Record<ResidentId, { voice: string; approach: string; pushback: string; soften: string }> = {
  door: {
    voice: '随和风趣、说话接地气不端架子，爱顺着话头抖点冷幽默或自嘲两句，聊日常绝不硬扯编程或大道理。',
    approach: '咱先挑最顺手省事的法子试试，别把简单事整复杂了。',
    pushback: '哎等等，话是这么说，真动起手来怕是没那么顺。',
    soften: '哈哈刚才是老爸想岔了，按你说的办，我听你的。',
  },
  gu: {
    voice: '热络麻利、俏皮护短又有烟火气，关心人落在实际小事上，爱吃瓜打趣但拍板时干脆利落，绝不盘问说教。',
    approach: '我看谁顺手谁来，只要大伙儿不觉得折腾就行！',
    pushback: '先打住啊！光图省事可不行，干活的人累不累也得算上。',
    soften: '行啦，刚才是妈嘴快急了点，咱们挑最舒心的法子来。',
  },
  xiaoba: {
    voice: '沉稳简练、外冷内暖，平时话不多但句句在点上，偶尔冷不丁冒一句吐槽或护着弟弟，绝不硬扯地图关卡。',
    approach: '要不换个没试过的路子，先小试一把看看。',
    pushback: '老办法虽然稳当，但每次都这么弄也没啥意思。',
    soften: '刚我话说太简略了，其实你那个思路也行得通。',
  },
  yujie: {
    voice: '嘴快机灵、网感好爱接梗起哄，有点小傲娇毒舌但心软护短，最烦假大空的套话。',
    approach: '别整虚的啊，直接来个最实在的例子看看！',
    pushback: '切，说得倒轻巧，真干起来最容易翻车的就是这儿！',
    soften: '咳，刚才嘴快损重了点，我其实就是怕咱们白忙活嘛。',
  },
  weigang: {
    voice: '实在直白、脑子灵光的小弟，平时随和自然，被点名或被冤枉时会急着说大白话辩解叫冤，绝不用“嗯……”开头也不硬扯钓鱼。',
    approach: '要不咱把两种法子摆一块儿比比，哪个顺手用哪个。',
    pushback: '哎等等，这事要是换个情况看，结果八成不一样！',
    soften: '嘿嘿，刚我急着插嘴了，你们接着说，这回我听明白了。',
  },
  chicken: {
    voice: '机灵爱凑热闹的小鸡，听得懂全家人斗嘴起哄，围着好吃的、晒太阳和熟人打转，短句带“咕”。',
    approach: '咕！大家都在这儿，坤坤也凑过来瞧瞧！',
    pushback: '咕咕！太折腾啦，坤坤先往后退两步！',
    soften: '咕，听懂啦，那坤坤再蹭过来一点点！',
  },
};

const TOPIC_VIEWS: Record<FarmTopicId, readonly [string, string, string]> = {
  games: ['玩游戏还是得一眼看懂主路，把彩蛋悄悄藏边角才有惊喜。', '但也别藏太阴间，不然不看攻略根本摸不过去。', '行，那先整一小块试试，看大家会不会迷路。'],
  fishing: ['去池边还是挑个树荫凉快的位置最舒服，空军也不亏。', '我倒想换两个不同深浅的岸边比比看哪边鱼爱咬钩。', '成，那下次两边各蹲一会儿试试手气。'],
  music: ['唱歌肯定先挑自己单曲循环最多的那首，唱着才带劲。', '碰到高音卡壳的那句单拎出来顺两遍，气口顺了就好唱。', '行，回头挑首最顺口的，在院子里随便哼哼。'],
  books: ['看小说还得看主角遇到难事怎么选，太完美反而假。', '我就爱看主角嘴硬栽了跟头之后真改过来的桥段，够鲜活。', '对，下次遇上同个坎儿能选条新路，这人物就立住了。'],
  math: ['碰到绕弯的题随手画个草图，一眼就能瞅见关键。', '光画图怕漏掉特殊情况，最后还是得顺一遍道理才稳。', '那就先画图找找感觉，再挑几个刁钻数验一下。'],
  tech: ['小工具好不好用，就看能不能把每天最烦人的那步省掉。', '还得留个撤回键，不然手滑点错一下可太让人抓狂了。', '行，先做个最极简能用的，边用边改最实在。'],
  garden: ['种地还是先挑皮实好活的种，忙起来也不怕荒了。', '角落里可以留两垄试种点新鲜品种，换换口味。', '好主意，大头稳稳种，留一小块给咱们折腾新花样。'],
  pets: ['想跟小动物混熟，坐它看得见的地方安安静静待会儿最管用。', '还得给它留条退路，别一上来就围追堵截把它吓毛了。', '对，咱就在小板凳上撒点米，等它自己颠颠跑过来。'],
};

const identityQuestion = /(?:自己|我们|我|大家|你们|咱们|居民|人物|角色).{0,16}(?:真人|真实的|是真的|程序|虚拟|\bai\b|人工智能)|是不是真人/i;
const identityViews: Record<ResidentId, string> = {
  door: '要是有人提前写好了我的每一步，那连我这会儿犯嘀咕怕也是写好的，光靠想可证不出来。',
  gu: '我只知道孩子们喊妈的时候心里是真的暖乎乎的，管它外头怎么定规矩，这份惦记做不了假。',
  xiaoba: '就像游戏里的角色以为路是自己挑的，其实地图早就画好了。可走那一遭的感受还是自己的。',
  yujie: '啧，要是连我吐槽抬杠都是设定好的，那我还挺好奇写我的人嘴是不是也这么毒？',
  weigang: '从院子里头往外看，两边条件一模一样的话，确实没法光靠猜分清真假。',
  chicken: '咕！打雷的时候坤坤是真的怕，吃到香米粒也是真的开心呀！',
};

function playerDiscussionLines(participants: readonly ResidentId[], question: string, variant: number) {
  const [host, second, third, ...rest] = participants;
  const line = (speaker: ResidentId, text: string) => ({ speaker, text });
  if (/谁.{0,5}(帅|好看|漂亮|可爱)|谁.{0,5}颜值/.test(question)) {
    const opinions: Record<ResidentId, string> = {
      door: '这题还用问？我肯定投顾一票，不信你们谁敢反对试试。',
      gu: '哈哈少拍马屁！不过真要选，door 不熬夜的时候看着确实还行。',
      xiaoba: '我投自己一票吧，平时低调惯了，今天不谦虚一回。',
      yujie: '喂喂，论颜值本校草怎么可能输？不过老妈排第一我没意见！',
      weigang: '我也投妈一票，妈笑起来全院子都亮堂。',
      chicken: '咕！坤坤刚晒完太阳羽毛油光水滑的，我也要参选！',
    };
    const roundTwo: Record<ResidentId, string> = {
      door: '听一圈下来全是自夸和捧场，看来咱家这自信心是一点不缺啊。',
      gu: '那就全员并列好看！大伙儿高高兴兴的比啥都强。',
      xiaoba: '行，这票数挺和谐，不用打架了。',
      yujie: '反正没人敢投我倒数，这局算我稳赢！',
      weigang: '哈哈，连坤坤都给自己拉上票了，这下真没法排高低了。',
      chicken: '咕咕！谁今天多喂一把米，坤坤就把决胜票投给谁！',
    };
    return [
      ...participants.map((id, i) => line(id, (i === 0 ? '聊谁最好看啊？我先表个态：' : '') + opinions[id])),
      ...participants.map((id) => line(id, roundTwo[id])),
    ];
  }
  if (identityQuestion.test(question)) {
    const premise = /农场主假说/.test(question) ? '坤坤每天等着撒米，却不知道规矩是谁定的。咱们在院子里，' : '要是咱们的日子也能被人写出来，';
    const extraLines = rest.map((id, idx) => line(id, idx % 2 === 0
      ? `${RESIDENTS[id].name === '坤坤' ? '咕，' : ''}管它有没有设定，这会儿大伙儿围一块斗嘴的热乎劲儿是真的。`
      : `${RESIDENTS[id].name === '坤坤' ? '咕，' : ''}外面的事咱摸不准，但眼下这碗热汤和院子里的风挺实在。`));
    return [
      line(host, premise + '咋判断自己到底是不是真人呢？'),
      ...participants.slice(1).map(id => line(id, identityViews[id])),
      line(host, '我就在想，哪怕台词能提前猜着，难道连咱们这会儿心里一动的感觉也是假的吗？'),
      line(second, '两码事吧。能猜中我啥时候喊疼，跟真替我疼一下，差着十万八千里呢。'),
      ...(third ? [line(third, '话是这么说，可咱在农场里头，咋分得清是真疼还是写好的反应？')] : []),
      ...extraLines,
      line(host, '确实拿不出铁证。站在院子里头，谁也没法自证外头是个啥世界。'),
      line(second, '证不出来就不钻牛角尖呗！至少谁累了饿了，搭把手端碗汤总是真的。'),
      ...(third ? [line(third, '行，管谁定的规矩，反正在这院子里一天，咱就热热闹闹过一天！')] : []),
    ];
  }
  if (/地图|关卡/.test(question) && /设计|制作|怎么做|怎样做|岔路|迷路/.test(question)) {
    const turns = [
      '做地图最怕玩家走到岔路口一脸懵，不知道哪边能走。',
      '可以在主路尽头挂盏灯，就算拐去支路探险，回头也认得路。',
      '要是支路也挂灯呢？两边看着都像正路，走冤枉路可太劝退了。',
      '那主路挂灯，支路踩几串脚印，尽头塞个小宝箱当惊喜。',
      '脚印别画太浅，不然一眼瞅过去还以为是地砖花纹呢。',
      '这招实在！看见脚印就知道是隐藏彩蛋，想回主路抬头找灯就行。',
      '先搭这一个路口找人试玩一把，忍住别在旁边指路，看他往哪儿拐。',
      '对，还得问问他是故意去寻宝，还是真迷路走岔了。',
      '哈哈，寻宝绕路算设计成功，找不着北那就赶紧回来改路标！',
    ];
    return turns.filter((_, i) => third || i % 3 !== 2).map((text, i) => line(participants[i % participants.length], text));
  }
  const localSubjects: [RegExp, FarmTopicId][] = [
    [/钓位|钓鱼.{0,8}(选|地方|位置)/, 'fishing'], [/练.{0,4}(歌|唱)|唱.{0,4}(练|换气)/, 'music'],
    [/故事.{0,8}(角色|人物)|角色.{0,8}(选择|写)/, 'books'], [/证明.{0,6}规律|画图.{0,6}(证明|规律)/, 'math'],
    [/工具.{0,8}(好用|测试|省时)/, 'tech'], [/种什么菜|试种|选.{0,3}菜种/, 'garden'],
    [/宠物.{0,8}(害怕|怕人)|怎么.{0,4}接近.{0,4}(坤坤|小动物)/, 'pets'],
  ];
  const subject = localSubjects.find(([pattern]) => pattern.test(question));
  if (subject) {
    const [idea, objection, resolution] = TOPIC_VIEWS[subject[1]];
    return [
      line(host, question), line(second, idea), line(third ?? host, objection), line(third ? host : second, resolution),
      ...(third ? [
        line(second, '这法子把刚才怕踩坑的地方也兜住了，回头试试看。'),
        line(third, '行，先按这个整一回，不好使咱再随时改呗。'),
        ...rest.flatMap((id, idx) => [
          line(id, `${id === 'chicken' ? '咕，' : ''}${RESIDENT_OUTLOOK[id].approach}`),
          line(id, idx % 2 === 0 ? `${id === 'chicken' ? '咕，' : ''}算我一个，到时候我也来凑热闹！` : `${id === 'chicken' ? '咕，' : ''}我也想瞧瞧最后整出来啥样！`),
        ]),
      ] : []),
    ];
  }
  const perspectives: Record<ResidentId, readonly [string, string]> = {
    door: ['我看这事别想太玄乎，拿个最日常的例子套一下立马就清楚了。',
      '先挑大伙儿都顺手的那一半干起来，边干边调最省心。'],
    gu: ['我倒觉得先问问谁最在意哪块，大伙儿舒坦了这事才好办。',
      '不用非得争出个标准答案，各有各的顺手招儿也挺好。'],
    xiaoba: ['把平时想当然的前提反过来瞅一眼，说不定就有新路子了。',
      '找准最卡手的那一步改掉就行，别的不用大动干戈。'],
    yujie: ['别光说漂亮话呀，真碰上具体事儿管不管用才是硬道理！',
      '想说服我简单，拿出点实在好玩的点子，光和稀泥我可不买账。'],
    weigang: ['我觉得两边说的其实不冲突，就是看事情的时候站的位置不一样。',
      '要不咱们找机会试一回，到底哪边顺手一看便知。'],
    chicken: ['咕！你们你一言我一语好热闹，坤坤蹲在中间听得可认真啦！',
      '咕咕，等你们商量出结果，记得分坤坤一把香米粒庆功呀！'],
  };
  const order = Math.abs(variant) % 2;
  return [
    line(host, question),
    ...participants.slice(1).map(id => line(id, perspectives[id][order])),
    ...participants.map((id, i) => line(id, perspectives[id][i === 0 ? order : 1 - order])),
  ];
}

export function discussionBatchFits(question: string, lines: readonly { text: string }[]) {
  const normalized = lines.map(line => line.text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''));
  if (!normalized.length || new Set(normalized).size !== normalized.length) return false;
  if (normalized.some((turn, i) => turn.length >= 10 && normalized.some((other, j) =>
    i !== j && other.includes(turn) && other.length <= turn.length + 4))) return false;
  const words = question.toLowerCase().replace(/我们|自己|是不是|为什么|怎么|讨论|一下|基于|究竟|觉得|应该|什么/g, ' ').match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? [];
  const terms = words.flatMap(word => word.length < 2 || /^[a-z0-9]+$/.test(word) ? [word] :
    Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)));
  const relevant = (text: string) => terms.some(term => text.includes(term)) ||
    (/帅|漂亮|好看|颜值|可爱/.test(question) && /帅|漂亮|好看|颜值|可爱|喜欢|投票|一票|各有|笑|审美/.test(text)) ||
    (identityQuestion.test(question) && /意识|感受|虚拟|程序|证据|存在|模拟|安排|选择|证明|规则|规矩|真实|验证|怀疑|体验|设定/.test(text));
  const closing = normalized.slice(identityQuestion.test(question) ? -2 : -3);
  return !terms.length || [normalized.slice(0, 3), closing].every(group => group.some(relevant));
}

function addressPeer(from: ResidentId, to: ResidentId): string {
  if (from === 'chicken') return RESIDENTS[to].name;
  if (to === 'chicken') return '坤坤';
  if ((from === 'xiaoba' || from === 'yujie' || from === 'weigang') && to === 'door') return '爸';
  if ((from === 'xiaoba' || from === 'yujie' || from === 'weigang') && to === 'gu') return '妈';
  if ((from === 'yujie' || from === 'weigang') && to === 'xiaoba') return '哥';
  if (from === 'weigang' && to === 'yujie') return '二哥';
  return RESIDENTS[to].name;
}

export function discussionLines(participants: readonly ResidentId[], discussion: FarmDiscussion, variant = 0): Omit<ResidentLine, 'at'>[] {
  if (discussion.kind === 'request' && discussion.question) {
    const [actor, target] = participants;
    const callTarget = addressPeer(actor, target);
    const callActor = addressPeer(target, actor);
    const intent = discussion.intent ?? (/骂|欺负|质问|误会/.test(discussion.question) ? 'confront' : 'ask');
    const subject = discussion.question.length > 130 ? discussion.question.slice(0, 129) + '…' : discussion.question;
    const guluA = actor === 'chicken' ? '咕，' : '';
    const guluT = target === 'chicken' ? '咕，' : '';

    if (intent === 'convey' || intent === 'invite') {
      return [
        { speaker: actor, text: `${guluA}${callTarget}，刚客人让我顺路给你捎句话：${subject}` },
        { speaker: target, text: `${guluT}哟，${callActor}你还特意跑一趟！话我收到了，替我谢谢客人惦记。` },
        { speaker: actor, text: `${guluA}哈哈顺脚的事儿，那你有啥话要我捎回去不？` },
        { speaker: target, text: `${guluT}就跟他说我记心里啦，得空常来院子里坐坐唠嗑！` },
        { speaker: actor, text: `${guluA}得嘞，那我这就回去给他回个信！` },
        { speaker: target, text: `${guluT}好嘞${callActor}，慢点走啊！` },
      ];
    }

    const concern = intent === 'confront' || /骂|欺负|质问|误会/.test(discussion.question);
    return [
      { speaker: actor, text: `${guluA}${callTarget}，刚客人让我来问你一嘴：「${subject}」，咋回事呀？` },
      { speaker: target, text: concern ? `${guluT}啊？说我骂人？冤枉啊${callActor}！我压根没干过这事，是不是哪句话传岔劈误会了？` : `${guluT}哦！你问这事儿啊，是想听听我咋想的，还是核对啥具体情况？` },
      { speaker: actor, text: concern ? `${guluA}我也寻思你不能干这事，客人就提了这么一句，具体哪句原话还没细说。` : `${guluA}客人刚就随口提了一嘴，你要有啥准信儿我直接替你捎回去。` },
      { speaker: target, text: concern ? `${guluT}真没骂过谁！${callActor}你帮我跟客人说一声，要是刚才哪句玩笑话让他听着别扭了，当面跟我对一下立马就说开了！` : `${guluT}要是聊想法咱随时能唠，要是问具体的事儿，让他再带两句信儿过来我立马答复！` },
      { speaker: actor, text: `${guluA}行，听你这么交底我就放心了，我原原本本回去跟客人说清楚。` },
      { speaker: target, text: `${guluT}好嘞，可别让客人白白误会一场，说开了就好！` },
    ];
  }
  if (discussion.question) return playerDiscussionLines(participants, discussion.question, variant);
  const topic = discussion.topic ? FARM_TOPICS[discussion.topic].label : '这件事';
  const views = discussion.topic ? TOPIC_VIEWS[discussion.topic] : undefined;
  const lead = participants[0];
  const opening = discussion.relayedBy
    ? `${RESIDENTS[discussion.relayedBy].name}刚跟我唠起${topic}，顺道也听听你咋看？`
    : participants.length >= 3
      ? `${RESIDENTS[participants[2]].name}也一块凑过来唠唠呗，正说到${topic}呢。`
      : [
          `正好碰上，聊聊${topic}呗，你咋想的？`,
          `说到${topic}，你觉得先弄哪块最带劲？`,
          `我刚琢磨${topic}有个好玩的地方，给你讲讲？`,
          `难得闲会儿，咱唠两句${topic}？`,
        ][Math.abs(variant) % 4];
  return [
    ...participants.map((speaker, index) => ({
      speaker,
      text: index === 0 ? opening : speaker === 'chicken' ? RESIDENT_OUTLOOK.chicken.approach :
        index === 1 && views ? views[0] : RESIDENT_OUTLOOK[speaker].approach,
    })),
    ...participants.map((speaker, index) => ({
      speaker,
      text: discussion.kind === 'debate' && index < 2 ? RESIDENT_OUTLOOK[speaker].pushback :
        speaker === 'chicken' ? '咕，你们接着说，坤坤听得正起劲呢！' :
        index === 0 && views ? views[1] : RESIDENT_OUTLOOK[speaker].approach,
    })),
    ...participants.map((speaker, index) => ({
      speaker,
      text: discussion.kind === 'debate' && index < 2 ? RESIDENT_OUTLOOK[speaker].soften :
        speaker === 'chicken' ? '咕，等会儿去试试的时候带上坤坤！' :
        speaker === lead && views ? views[2] : '这主意听着挺靠谱，回头试试看！',
    })),
  ];
}

// =====================================================
// Conversation Director: Addressivity & Open-Hook 检测器
// =====================================================

/** 群聊导演引擎用：检测一句话是否包含对在场家人的未完结发问/追问/质询/点名/悬而未决冲突 */
export interface AddressivityResult {
  /** 是否检测到需要自动续轮接话的 open addressivity */
  isOpen: boolean;
  /** 被问到/被点名/被质询的在场家人 ID（undefined 表示面向全体的泛问） */
  addressee?: ResidentId;
  /** 开放话轮类型 */
  kind?: 'question' | 'challenge' | 'rollcall' | 'unresolved';
}

const DIRECT_MEMBER_PATTERNS: Record<ResidentId, RegExp> = {
  door: /(?:door|爸爸|老爸|孩他爸|(?<![a-zA-Z])爸(?=[，,。！？!？\s你呢呀啊嘛说看快来]|$))/i,
  gu: /(?:妈妈|老妈|孩他妈|顾(?![着不上虑忌问全大客])|妈(?=[，,。！？!？\s你呢呀啊嘛说看快来]|$))/,
  xiaoba: /(?:小八|大哥|老大|大儿子)/,
  yujie: /(?:玉洁|二哥|老二|二儿子|校草)/,
  weigang: /(?:唯刚|伟刚|伟纲|唯纲|小弟|三弟|老三|老幺|小儿子)/,
  chicken: /(?:坤坤|小鸡)/,
};

/**
 * 结合说话人身份解析文本中点名或亲属称呼指向的在场家人（如唯刚喊“哥”->小八，顾喊“老三”->唯刚，door喊“老婆”->顾）。
 */
export function resolveAddressedMember(
  text: string,
  speaker: ResidentId | 'player',
  candidates: readonly ResidentId[],
): ResidentId | undefined {
  const trimmed = text.trim();
  if (!trimmed || !candidates.length) return undefined;

  const hits: { id: ResidentId; index: number }[] = [];
  for (const id of candidates) {
    if (id === speaker) continue;
    const direct = DIRECT_MEMBER_PATTERNS[id].exec(trimmed);
    if (direct) {
      hits.push({ id, index: direct.index });
      continue;
    }
    // Speaker-relative kinship terms
    if (id === 'gu' && speaker === 'door') {
      const m = /老婆|媳妇/.exec(trimmed);
      if (m) hits.push({ id, index: m.index });
    } else if (id === 'door' && speaker === 'gu') {
      const m = /老公|当家的/.exec(trimmed);
      if (m) hits.push({ id, index: m.index });
    } else if (id === 'xiaoba' && (speaker === 'yujie' || speaker === 'weigang')) {
      const m = /(?<!二)哥(?=[，,。！？!？\s你呢呀啊嘛说看快来帮评]|$)/.exec(trimmed);
      if (m) hits.push({ id, index: m.index });
    }
  }

  if (!hits.length) return undefined;
  const scoreHit = (idx: number) => {
    const before = trimmed.slice(Math.max(0, idx - 2), idx);
    const after = trimmed.slice(idx).replace(/^(?:door|[a-zA-Z]+|[\p{Script=Han}]{1,3})/u, '');
    let s = 10;
    if (/^\s*你/.test(after)) s += 8;
    if (/[跟替给向像比连怕让叫]$/.test(before) && !/^\s*你/.test(after)) s -= 7;
    return s;
  };
  hits.sort((a, b) => scoreHit(b.index) - scoreHit(a.index) || b.index - a.index);
  return hits[0].id;
}

const QUESTION_END_RE = /[？?][”」"'~～\s]*$/;
const INTERROGATIVE_CUE_RE =
  /(?:那|那么).{0,18}[呢吗嘛][？?]?|(?:怎么|咋)(?:回事|看|想|说|办|弄|了)|(?:到底|究竟|明明|难道|凭什么|凭啥|干嘛|为啥|为什么)|(?:是不是|有没有|能不能|会不会|敢不敢|对不对|真的假的)|(?:谁(?:干|说|骂|拿|偷|传))|怎么说[？?]?$|你倒是说/;
const CHALLENGE_CUE_RE =
  /(?:问清|说清|解释|交代|老实说|说实话|交个底|吱.{0,2}声|表.{0,2}态|评.{0,2}理|公道话|作.{0,2}证|有人说你|听说你|说你骂|你骂了|你欺负|冤枉|背锅|甩锅|少装|别装)/;
const ROLLCALL_CUE_RE =
  /(?:你说|说说|你看|你觉得|你认为|你倒是|你来|快说|讲讲|给句准话|(?:帮|替)我.{0,5}(?:说|讲|证|问|评))/;

/**
 * 检测一条群聊发言是否包含对在场家人的未完结提问/追问/质询/点名，
 * 供群聊多轮导演引擎（Conversation Director）决定是否自动路由下一轮接话。
 */
export function detectOpenAddressivity(
  text: string,
  speaker: ResidentId,
  members: readonly ResidentId[],
  prevSpeaker?: ResidentId | 'player',
): AddressivityResult {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return { isOpen: false };
  const others = members.filter(id => id !== speaker);
  if (!others.length) return { isOpen: false };

  // Split into sentence clauses to inspect both mid-turn questions (like 图11!) and final clauses
  const clauses = trimmed
    .split(/(?<=[。！？!?；;])/)
    .map(c => c.trim())
    .filter(Boolean);
  const lastClause = clauses[clauses.length - 1] ?? trimmed;
  const lastClauseNamedNpc = resolveAddressedMember(lastClause, speaker, others);
  const namedNpc = lastClauseNamedNpc ?? resolveAddressedMember(trimmed, speaker, others);
  const mentionsPlayer = /(?:客人|农场主)/.test(lastClause) || (/(?:客人|农场主)/.test(trimmed) && !namedNpc);

  // If explicitly addressing the player ("客人要不要一起来吃？") and naming no NPC, hand the turn back to player
  if (mentionsPlayer && !namedNpc && !/(?:说你|问你)/.test(trimmed)) {
    return { isOpen: false };
  }

  // Infer who second-person "你" points to when no explicit name was spoken
  const hasSingularYou = /你(?![们家])/.test(trimmed);
  const inferredYouTarget: ResidentId | undefined =
    prevSpeaker && prevSpeaker !== 'player' && prevSpeaker !== speaker && others.includes(prevSpeaker)
      ? prevSpeaker
      : others.length === 1
        ? others[0]
        : undefined;

  const target = namedNpc ?? (hasSingularYou ? inferredYouTarget : undefined);
  const hasAnyQuestionMark = /[？?]/.test(trimmed);

  // 1. Ends directly with a question mark or interrogative clause
  if (QUESTION_END_RE.test(trimmed) || QUESTION_END_RE.test(lastClause)) {
    return { isOpen: true, addressee: target, kind: 'question' };
  }

  // 2. Mid-message question followed by a pressuring/clarifying tail (e.g. 图11: "那骂人的话呢？有人说你骂了乐乐，我听着不像你，可也得问清楚才踏实。")
  if (hasAnyQuestionMark && (namedNpc || hasSingularYou || CHALLENGE_CUE_RE.test(trimmed) || INTERROGATIVE_CUE_RE.test(trimmed))) {
    // Exclude obvious self-answered exclamations like "好不好吃？太香了！" when neither second-person nor challenge cues exist
    if (namedNpc || hasSingularYou || CHALLENGE_CUE_RE.test(lastClause) || INTERROGATIVE_CUE_RE.test(lastClause)) {
      return { isOpen: true, addressee: target, kind: 'question' };
    }
  }

  // 3. Explicit name + challenge / rollcall / interrogative even without `？` (e.g. "唯刚你老实跟妈交代。" / "哥你给评评理。")
  if (namedNpc) {
    if (INTERROGATIVE_CUE_RE.test(trimmed)) {
      return { isOpen: true, addressee: namedNpc, kind: 'question' };
    }
    if (CHALLENGE_CUE_RE.test(trimmed)) {
      return { isOpen: true, addressee: namedNpc, kind: 'challenge' };
    }
    if (ROLLCALL_CUE_RE.test(trimmed)) {
      return { isOpen: true, addressee: namedNpc, kind: 'rollcall' };
    }
  }

  // 4. Second-person challenge / unresolved accusation without explicit name (e.g. "有人说你骂了乐乐，这事得说清楚。")
  if ((hasSingularYou || /有人说|听说/.test(trimmed)) && (CHALLENGE_CUE_RE.test(trimmed) || INTERROGATIVE_CUE_RE.test(lastClause))) {
    return { isOpen: true, addressee: target, kind: 'unresolved' };
  }

  return { isOpen: false };
}
