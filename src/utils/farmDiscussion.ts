import { FARM_TOPICS, RESIDENTS, type FarmTopicId, type ResidentId, type ResidentLine } from './farmLife';

export type ResidentMood = '平静' | '好奇' | '开心' | '低落' | '不服气' | '松了口气';

export interface FarmDiscussion {
  topic?: FarmTopicId;
  question?: string;
  relayedBy?: ResidentId;
  kind: 'discussion' | 'debate' | 'followup' | 'request';
}

/** Reject obvious topic loss in generated request replies; keep the grounded local plan. */
export function requestBatchOnTopic(question: string, lines: readonly { text: string; speaker?: ResidentId }[], target?: ResidentId): boolean {
  let content = question;
  for (const resident of Object.values(RESIDENTS)) content = content.replaceAll(resident.name, ' ');
  content = content.replace(/伟刚|伟纲|唯纲|客人|帮我|替我|你去|去找|找他|问问|问一下|质问|转告|告诉|带话|传话|一下|这件事|刚才|为什么|聊聊|说说/g, ' ');
  const terms = content.match(/[\p{Script=Han}a-zA-Z0-9]+/gu) ?? [];
  const noise = /我|你|他|她|这个|那个|一下|的话|事情|怎么|什么|时候|可以|能不能|是不是|好的|问题|客人|说的|想问|喜欢|觉得/;
  const anchors = terms.flatMap(term => Array.from({ length: Math.max(0, term.length - 1) }, (_, i) => term.slice(i, i + 2))).filter(term => !noise.test(term));
  const semantic: [RegExp, RegExp][] = [[/骂|辱/, /骂|辱|原话|言语/], [/欺负|欺凌/, /欺负|欺凌/], [/几点|什么时候|何时/, /时间|几点|时候|点钟|安排|还没定/], [/回家/, /回家|回屋|回去/], [/浇水/, /浇水|水壶|土壤|缺水/], [/音乐|唱歌/, /音乐|唱歌|歌曲|唱|副歌/]];
  const matches = (text: string) => anchors.some(anchor => text.includes(anchor)) || semantic.some(([source, reply]) => source.test(question) && reply.test(text));
  const required = semantic.filter(([source]) => source.test(question));
  const unrelated = [/游戏|关卡|地图/, /钓鱼|鱼竿|钓位/, /音乐|唱歌|副歌/, /种菜|播种|浇水/, /小说|故事|读书/, /数学|方程/, /工具|编程|电脑/].filter(topic => !topic.test(question));
  if (!anchors.length && !semantic.some(([source]) => source.test(question))) return false;
  return lines.length > 0 && lines.every(line => {
    if (unrelated.some(topic => topic.test(line.text))) return false;
    if (!target || line.speaker === target) return matches(line.text) && required.every(([, reply]) => reply.test(line.text));
    return matches(line.text) || /核实|确认|转达|答复|原话|这件事|这个问题|不确定|没听清/.test(line.text);
  });
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

const identityQuestion = /(?:自己|我们|我|居民|人物|角色).{0,10}(?:真人|真实的|是真的|是程序|是虚拟)|是不是真人/;
const identityViews: Record<ResidentId, string> = {
  door: '要是有人写好了我的每一步，那连我此刻的怀疑也可能是写好的。光凭怀疑还证明不了什么。',
  gu: '我记得孩子喊我时心里一紧。可要是记忆也是别人放进来的呢？我只能说，那一刻我有感觉。',
  xiaoba: '我画地图时，角色以为岔路是自己选的，可两条路都是我画的。我也会不会在这样的地图里？',
  yujie: '要是连我顶嘴都能提前写好，那顶嘴也证明不了我能自己做主。谁能举个分得出来的例子？',
  weigang: '我想把两种可能放在一起看。如果醒来时看到的一切都一样，光靠观察恐怕分不出来。',
  chicken: '咕，我害怕时就想往你们身边挪。这份怕也能事先写好吗？',
};

function playerDiscussionLines(participants: readonly ResidentId[], question: string) {
  const [host, second, third] = participants;
  const line = (speaker: ResidentId, text: string) => ({ speaker, text });
  if (identityQuestion.test(question)) {
    const premise = /农场主假说/.test(question) ? '坤坤每天等到饲料，可它只看到了规律，看不到谁定的。我们也在农场里，' : '假如我们的日子能被写出来，';
    return [
      line(host, premise + '凭什么判断自己是不是真人？'),
      ...participants.slice(1).map(id => line(id, identityViews[id])),
      line(host, '我卡在这里：哪怕有人安排了我们会说什么，就能断定说话的时候谁也没有感觉吗？'),
      line(second, '这是两回事。能猜中我什么时候会疼，和替我疼一下，差别还挺大。'),
      ...(third ? [line(third, '可我们也只听得到对方说疼。从农场里面看，怎么区分真的疼和一句写好的台词？')] : []),
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
    return [line(host, question), line(second, idea), line(third ?? host, objection), line(third ? host : second, resolution)];
  }
  return [line(host, question), line(second, '这个问题我现在答不上来，先留着吧。别让客人把我的猜测当答案。')];
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
    (identityQuestion.test(question) && /意识|感受|虚拟|程序|证据|存在|模拟|安排|选择|证明|规则|规矩|真实|验证|怀疑|体验/.test(text));
  const closing = normalized.slice(identityQuestion.test(question) ? -2 : -3);
  return !terms.length || [normalized.slice(0, 3), closing].every(group => group.some(relevant));
}

export function discussionLines(participants: readonly ResidentId[], discussion: FarmDiscussion, variant = 0): Omit<ResidentLine, 'at'>[] {
  if (discussion.kind === 'request' && discussion.question) {
    const [actor, target] = participants;
    const concern = /骂|欺负|质问|误会/.test(discussion.question);
    const subject = discussion.question.slice(-28);
    return [
      { speaker: actor, text: `客人托我来问这件事：「${subject}」` },
      { speaker: target, text: concern ? '关于骂人的转述，我想先核对原话和情境。' : `你问「${subject.slice(-18)}」，我听清了。` },
      { speaker: actor, text: concern ? '我没有亲眼见到，先来听你的说法。' : '我先确认你的意思，再如实带回去。' },
      { speaker: target, text: concern ? '骂人的事还没核实，不能只凭转述定论。' : `「${subject.slice(-18)}」我暂时不能确定答复。` },
      { speaker: actor, text: '好，我会转达：已经问过，还需要核实细节。' },
      { speaker: target, text: '嗯，请如实转达，不要替我编结论。' },
    ];
  }
  if (discussion.question) return playerDiscussionLines(participants, discussion.question);
  const topic = discussion.topic ? FARM_TOPICS[discussion.topic].label : '这件事';
  const views = discussion.topic ? TOPIC_VIEWS[discussion.topic] : undefined;
  const lead = participants[0];
  const opening = discussion.relayedBy ? RESIDENTS[discussion.relayedBy].name + '和我刚聊过' + topic + '。我还想听听你的看法。'
      : participants.length === 3 ? RESIDENTS[participants[2]].name + '也来聊聊吧。我们正聊' + topic + '。' : [
        '说到' + topic + '，我想听听你怎么想。',
        '关于' + topic + '，你最想先试哪一点？',
        '我对' + topic + '有个没想明白的地方。',
        '聊聊' + topic + '吧，这次我想先听你的看法。',
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
        speaker === 'chicken' ? '咕，慢一点，我听得进去了。' :
        index === 0 && views ? views[1] : RESIDENT_OUTLOOK[speaker].approach,
    })),
    ...participants.map((speaker, index) => ({
      speaker,
      text: discussion.kind === 'debate' && index < 2 ? RESIDENT_OUTLOOK[speaker].soften :
        speaker === 'chicken' ? '咕，我也想跟过去看看。' :
        speaker === lead && views ? views[2] : '我听懂你的意思了。可以先试一点，再看结果。',
    })),
  ];
}
