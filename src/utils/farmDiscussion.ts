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
    [/骂|辱/, /骂|辱|原话|言语|说重|语气|冒犯|吵|气话/],
    [/欺负|欺凌/, /欺负|欺凌|委屈|针对/],
    [/几点|什么时候|何时/, /时间|几点|时候|点钟|安排|还没定|晚点|早上|中午|晚上|明天|待会/],
    [/回家/, /回家|回屋|回去|晚归|等你/],
    [/浇水/, /浇水|水壶|土壤|缺水|湿/],
    [/音乐|唱歌/, /音乐|唱歌|歌曲|唱|副歌|嗓子|旋律/],
    [/吃什么|晚饭|午饭|早饭|吃饭|热汤/, /吃|饭|汤|菜|面|饼|厨房|做饭|饿/],
    [/夸|好听|棒|厉害|辛苦/, /谢谢|谢|开心|高兴|夸|好听|辛苦|客气|嘿|脸红/],
    [/道歉|对不起|赔礼|原谅/, /道歉|对不起|没关系|算了|原谅|别在意|消气|过去/],
    [/熬夜|早睡|睡觉|休息/, /熬夜|睡|歇|休息|电脑|晚安|太晚/],
  ];
  const matches = (text: string) => anchors.some(anchor => text.includes(anchor)) || semantic.some(([source, reply]) => source.test(question) && reply.test(text));
  const required = semantic.filter(([source]) => source.test(question));
  const unrelated = [/游戏|关卡|地图/, /钓鱼|鱼竿|钓位/, /音乐|唱歌|副歌/, /种菜|播种|浇水/, /小说|故事|读书/, /数学|方程/, /工具|编程|电脑/].filter(topic => !topic.test(question));
  const replies = lines.filter(line => !target || line.speaker === target);
  if (!replies.length) return false;

  // Pure convey/invite relays only need a substantive, non-drifting acknowledgement from target.
  if (intent === 'convey' || intent === 'invite') {
    const substantive = replies.some(line => line.text.trim().length >= 4 && !/^(?:嗯|好|行|知道了)[。！!]?$/.test(line.text.trim()));
    const onTrack = lines.every(line => !unrelated.some(topic => topic.test(line.text)) || matches(line.text));
    return substantive && onTrack;
  }

  if (!anchors.length && !semantic.some(([source]) => source.test(question))) return false;
  // A reply may answer first and then clarify with pronouns. Check the exchange as a whole.
  return replies.some(line => matches(line.text)) &&
    required.every(([, reply]) => replies.some(line => reply.test(line.text))) &&
    lines.every(line => !unrelated.some(topic => topic.test(line.text)) || matches(line.text));
}

export const RESIDENT_OUTLOOK: Record<ResidentId, { voice: string; approach: string; pushback: string; soften: string }> = {
  door: { voice: '好奇时会追问依据，吵起来会试着把事实和猜测分开，偶尔因分析太久而忘了先听对方。', approach: '先说我们知道什么，再挑一个最小的办法试。', pushback: '等一下。我同意你的担心，但这个结论还差一步。', soften: '我刚才急着讲道理了。你先说完，我听着。' },
  gu: { voice: '先看大家是不是累了、有没有被听见。体贴，但需要拍板时很果断，对 door 偶尔会直说。', approach: '我先想这会让谁为难。大家愿意做，办法才能走得长。', pushback: '你先别急着定！做这件事的人累不累，也得算进去。', soften: '我语气重了点。我们一人说一条最在意的，好不好？' },
  xiaoba: { voice: '脑子里会冒出奇特的点子，低落时说话慢，常在被追问之后才讲自己的真实想法。', approach: '我想留一条没试过的路，先做个小版本看看。', pushback: '我知道稳妥的办法，但每次都选它，就没机会试新点子了。', soften: '我刚才有点闷。你们愿意听我把点子说完，我就好些。' },
  yujie: { voice: '敏感时会用吐槽挡一下，发现伤人会认真补一句。讨厌空话，喜欢拿具体例子追问。', approach: '先说个具体例子吧。光听起来好听，我可不信。', pushback: '你说得倒轻巧。每次一着急，最先被跳过的就是这一步！', soften: '刚才那句太刺了。我的意思是，我其实有点担心。' },
  weigang: { voice: '在大伙儿面前会犹豫，想通之后会很认真地说出条件和反例。被打断时容易缩回去。', approach: '我想先比两种办法，用同样的条件才看得出区别。', pushback: '我……有一点不同意。换个条件，结果可能就反过来了。', soften: '谢谢你们等我说完。我想再试一次，慢慢来。' },
  chicken: { voice: '好奇就凑近，害怕时先退一点。靠声音、光照、吃喝和熟人的陪伴判断事情。', approach: '咕，我想先看一小会儿，大家都在我就敢试。', pushback: '咕，太急啦！我想先躲开一点。', soften: '咕，你们慢慢说，我再靠近一点。' },
};

const TOPIC_VIEWS: Record<FarmTopicId, readonly [string, string, string]> = {
  games: ['游戏里先给人一条看得懂的路，再把秘密藏进岔路。', '但也得有人能不看攻略走过去。可以请没玩过的人试。', '好，先做一小段，记下别人在哪儿迷路。'],
  fishing: ['我会先挑个容易到的钓位，空竿也不算白来。', '我更想换着试钓位。每处等一样久，才能比较。', '那先在岸边容易走的两个位置，各试一会儿。'],
  music: ['先挑自己喜欢的歌，唱得出来才愿意反复练。', '碰到唱不顺的地方，我会只练一句，听听哪里换气。', '行，挑一首喜欢的，再挑其中最难的一句。'],
  books: ['故事要让我看见角色为什么这么选，我才愿意跟下去。', '我喜欢角色做错以后还有机会改，谁都会走弯路。', '那让角色的第二次选择和第一次不一样，看看会怎样。'],
  math: ['我会先画图，看看哪些条件有用。', '画图只看得到几个例子，最后还得解释为什么总成立。', '先用图猜规律，再找反例或把理由写出来。'],
  tech: ['先想清楚它到底能帮人省哪一步。', '也要看出错以后能不能改回来，不能只看跑得快。', '先用一小份数据试，测时间，也试一下怎么恢复。'],
  garden: ['我会先种容易照顾的，忙的时候也有把握。', '可以留一小块试新的，全种一样也看不出差别。', '那就一块稳稳种，另一小块试种，记下日照和用水。'],
  pets: ['小动物愿意走过来以前，可以先坐在它看得到的地方。', '也得留条退路，它害怕时能自己回到窝里。', '那我们坐远一点，让它自己决定什么时候过来。'],
};

const identityQuestion = /(?:自己|我们|我|大家|你们|咱们|居民|人物|角色).{0,16}(?:真人|真实的|是真的|程序|虚拟|\bai\b|人工智能)|是不是真人/i;
const identityViews: Record<ResidentId, string> = {
  door: '要是有人写好了我的每一步，那连我此刻的怀疑也可能是写好的。光凭怀疑还证明不了什么。',
  gu: '我记得孩子喊我时心里一紧。可要是记忆也是别人放进来的呢？我只能说，那一刻我有感觉。',
  xiaoba: '我画地图时，角色以为岔路是自己选的，可两条路都是我画的。我也会不会在这样的地图里？',
  yujie: '要是连我顶嘴都能提前写好，那顶嘴也证明不了我能自己做主。谁能举个分得出来的例子？',
  weigang: '我想把两种可能放在一起看。如果醒来时看到的一切都一样，光靠观察恐怕分不出来。',
  chicken: '咕，我害怕时就想往你们身边挪。这份怕也能事先写好吗？',
};

function playerDiscussionLines(participants: readonly ResidentId[], question: string, variant: number) {
  const [host, second, third, ...rest] = participants;
  const line = (speaker: ResidentId, text: string) => ({ speaker, text });
  if (/谁.{0,5}(帅|好看|漂亮|可爱)|谁.{0,5}颜值/.test(question)) {
    const opinions: Record<ResidentId, string> = {
      door: '我投顾。认真听人说话时的那个眼神，我每次都会多看一眼。',
      gu: '我偏心 door。认真起来挺好看，就是一讲道理容易忘记笑。',
      xiaoba: '我想给自己留一票。平时不好意思说，今天既然问了，我就不谦虚啦。',
      yujie: '我先投自己，不能还没开始就认输吧？不过顾笑起来确实很有优势。',
      weigang: '我会选顾。她看过来时让人很放松，我觉得那样就很好看。',
      chicken: '咕！我的羽毛晒过太阳会发亮，我也要参加！',
    };
    const roundTwo: Record<ResidentId, string> = {
      door: '听下来大家看的地方还真不一样。自己给自己投票也算，我可没说不许。',
      gu: '那就各留各的票！喜欢谁的样子，本来就可以有自己的答案。',
      xiaoba: '我也保留刚才那一票。这回至少把平时不好意思说的夸奖说出来了。',
      yujie: '行吧，反正没人说我不好看，这波我算赢了一半。',
      weigang: '嗯……其实大家各有各的好看，非要排第一我还是有点选不出来。',
      chicken: '咕咕，那我把第二票也投给今天最先喂我米的人！',
    };
    return [
      ...participants.map((id, i) => line(id, (i === 0 ? '要说谁最好看，我先表态。' : '') + opinions[id])),
      ...participants.map((id) => line(id, roundTwo[id])),
    ];
  }
  if (identityQuestion.test(question)) {
    const premise = /农场主假说/.test(question) ? '坤坤每天等到饲料，可它只看到了规律，看不到谁定的。我们也在农场里，' : '假如我们的日子能被写出来，';
    const extraLines = rest.map((id, idx) => line(id, idx % 2 === 0
      ? `${RESIDENTS[id].name === '坤坤' ? '咕，' : ''}就算真有写好的规矩，此刻和你们站在一起聊天还是暖的。`
      : `${RESIDENTS[id].name === '坤坤' ? '咕，' : ''}我分不清外面是什么样，但至少这一刻我是认真在听你们说话。`));
    return [
      line(host, premise + '凭什么判断自己是不是真人？'),
      ...participants.slice(1).map(id => line(id, identityViews[id])),
      line(host, '我卡在这里：哪怕有人安排了我们会说什么，就能断定说话的时候谁也没有感觉吗？'),
      line(second, '这是两回事。能猜中我什么时候会疼，和替我疼一下，差别还挺大。'),
      ...(third ? [line(third, '可我们也只听得到对方说疼。从农场里面看，怎么区分真的疼和一句写好的台词？')] : []),
      ...extraLines,
      line(host, '我没有能从里面验证的办法。要说我们肯定是外面的真人，我拿不出这个证据。'),
      line(second, '那我愿意先信你说的疼。万一我猜错了，伸手扶你一下也比把你晾着好。'),
      ...(third ? [line(third, '我还是想知道这座农场是谁定的规矩。但在弄清之前，你喊疼，我会停下来。')] : []),
    ];
  }
  if (/地图|关卡/.test(question) && /设计|制作|怎么做|怎样做|岔路|迷路/.test(question)) {
    const turns = [
      '做地图的时候，我最担心玩家到了岔口，看不出哪边值得走。',
      '我想在主路尽头露出一点灯光。玩家拐去探索，也记得回来时该找什么。',
      '要是岔路也亮着灯呢？两边都像出口，走错一次就会觉得被耍了。',
      '那给主路用灯，支路用脚印。脚印尽头藏个小东西，让绕路也值得。',
      '脚印要是太淡，很容易被当成地面的花纹。可以先让它穿过玩家必经的路。',
      '我喜欢这个交叉口。玩家看见脚印时，已经知道随时能沿灯光回来。',
      '先画这一个路口就够了。找人试玩时我想忍住不指路，看他自己会在哪里停下。',
      '我会问他刚才是想探险，还是以为那是出口。这两种走法看起来可是一模一样。',
      '对，想探险的人绕路算成功。想回主路却找不到灯，才说明路标得改。',
    ];
    const base = turns.filter((_, i) => third || i % 3 !== 2).map((text, i) => line(participants[i % participants.length], text));
    return base;
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
        line(second, '这个办法把刚才担心的地方也考虑进去了，实际做时我再帮着留心。'),
        line(third, '那我先保留一点不同意见，等试过以后再看要不要改。'),
        ...rest.flatMap((id, idx) => [
          line(id, `${id === 'chicken' ? '咕，' : ''}${RESIDENT_OUTLOOK[id].approach}`),
          line(id, idx % 2 === 0 ? `${id === 'chicken' ? '咕，' : ''}算我一份，到时我也来凑个热闹。` : `${id === 'chicken' ? '咕，' : ''}我也想看看试出来会是什么样。`),
        ]),
      ] : []),
    ];
  }
  const perspectives: Record<ResidentId, readonly [string, string]> = {
    door: ['先分清手里已知的线索和自己的猜测吧，举个具体例子最容易对上焦。',
      '如果一个解释只套得上刚才那个例子，我会先留着另一种可能，不急着拍板。'],
    gu: ['我倒是更在意大家各自为什么看重这件事，有人图省事，有人图安心。',
      '听出分歧出在哪儿，比急着统一口径有用多了，至少谁也没白说。'],
    xiaoba: ['我想把平时默认的条件反过来想一遍，说不定能冒出个没试过的路子。',
      '要是换了条件想法就跟着变，那那个条件才是整件事最关键的卡点。'],
    yujie: ['别光飘在天上说呀，来个具体点的例子，不然我听着总觉得太虚。',
      '想让我改主意也行，得说中我真在意的那个点，光打圆场我可不服。'],
    weigang: ['嗯……我觉得两种说法可能各对了一半，只是大家心里默认的条件不一样。',
      '我想把有分歧的那个条件记下来，回头多看两回就更清楚了。'],
    chicken: ['咕，我先竖着耳朵听你们说，轮到我我就讲自己看见听见的！',
      '咕，大家想法居然不一样呢，说慢一点点，我也想跟上。'],
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
  // Catch a copied sentence with just a name, interjection or short tail added.
  if (normalized.some((turn, i) => turn.length >= 10 && normalized.some((other, j) =>
    i !== j && other.includes(turn) && other.length <= turn.length + 4))) return false;
  const words = question.toLowerCase().replace(/我们|自己|是不是|为什么|怎么|讨论|一下|基于|究竟|觉得|应该|什么/g, ' ').match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? [];
  const terms = words.flatMap(word => word.length < 2 || /^[a-z0-9]+$/.test(word) ? [word] :
    Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)));
  const relevant = (text: string) => terms.some(term => text.includes(term)) ||
    (/帅|漂亮|好看|颜值|可爱/.test(question) && /帅|漂亮|好看|颜值|可爱|喜欢|投票|一票|各有|笑|审美/.test(text)) ||
    (identityQuestion.test(question) && /意识|感受|虚拟|程序|证据|存在|模拟|安排|选择|证明|规则|规矩|真实|验证|怀疑|体验/.test(text));
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
        { speaker: actor, text: `${guluA}${callTarget}，客人托我顺路给你带句话：${subject}` },
        { speaker: target, text: `${guluT}哦？${callActor}你专门跑一趟呀，这句话我收到了，替我谢谢客人惦记着。` },
        { speaker: actor, text: `${guluA}嗯，我怕说漏了，特地原原本本带过来。你还有什么话要我带回去吗？` },
        { speaker: target, text: `${guluT}告诉他我心里有数啦，回头有空来院子里坐坐就好。` },
        { speaker: actor, text: `${guluA}行，那我这就回去告诉他，让他放心。` },
        { speaker: target, text: `${guluT}辛苦啦${callActor}，慢点走。` },
      ];
    }

    const concern = intent === 'confront' || /骂|欺负|质问|误会/.test(discussion.question);
    return [
      { speaker: actor, text: `${guluA}${callTarget}，客人刚才让我来问问你这件事：「${subject}」` },
      { speaker: target, text: concern ? `${guluT}啊？客人觉得被骂了？这件事我想弄清楚，他记得是哪句话让他不舒服吗？` : `${guluT}这事我听到了，你是想听我的看法，还是先核对一下具体情况？` },
      { speaker: actor, text: concern ? `${guluA}我手里现在只有他的转述，还没见到当时的完整原话。你要问的我替你带回去。` : `${guluA}我先把你的意思记住，需要他补充的地方我也一起带回去问。` },
      { speaker: target, text: concern ? `${guluT}我不是敷衍，是真想把话讲开。麻烦帮我问问他记得的原话和当时的情境，我们就从那句聊起。` : `${guluT}要是问看法咱们随时能聊；要确认具体的事，回头把时间和经过带过来就清楚了。` },
      { speaker: actor, text: `${guluA}好，我回去跟他说清还差哪块细节，下回就能直接对上。` },
      { speaker: target, text: concern ? `${guluT}嗯，把我想认真核对原话的意思也带到，没弄清之前可别越猜越误会。` : `${guluT}行，我记着这事，等他补上细节咱们接着说。` },
    ];
  }
  if (discussion.question) return playerDiscussionLines(participants, discussion.question, variant);
  const topic = discussion.topic ? FARM_TOPICS[discussion.topic].label : '这件事';
  const views = discussion.topic ? TOPIC_VIEWS[discussion.topic] : undefined;
  const lead = participants[0];
  const opening = discussion.relayedBy
    ? `${RESIDENTS[discussion.relayedBy].name}刚和我聊起${topic}，我顺道想听听你怎么看。`
    : participants.length >= 3
      ? `${RESIDENTS[participants[2]].name}也凑过来聊聊吧，我们正说到${topic}呢。`
      : [
          `正巧碰到，关于${topic}，我想听听你的想法。`,
          `说到${topic}，你最想先从哪一块试试？`,
          `我刚对${topic}有个没想透的小地方。`,
          `难得有空，聊聊${topic}吧，你先说？`,
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
        speaker === 'chicken' ? '咕，慢一点，我正认真听呢。' :
        index === 0 && views ? views[1] : RESIDENT_OUTLOOK[speaker].approach,
    })),
    ...participants.map((speaker, index) => ({
      speaker,
      text: discussion.kind === 'debate' && index < 2 ? RESIDENT_OUTLOOK[speaker].soften :
        speaker === 'chicken' ? '咕，等会儿我也想跟着去看看。' :
        speaker === lead && views ? views[2] : '这主意听着挺顺手，回头试过再看效果。',
    })),
  ];
}
