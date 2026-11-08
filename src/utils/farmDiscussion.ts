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
  const topic = discussion.topic ? FARM_TOPICS[discussion.topic].label : '这件事';
  const views = discussion.topic ? TOPIC_VIEWS[discussion.topic] : undefined;
  const lead = participants[0];
  const opening = discussion.question
    ? '客人请我们一起想想：' + discussion.question.slice(0, 34)
    : discussion.relayedBy ? RESIDENTS[discussion.relayedBy].name + '和我刚聊过' + topic + '。我还想听听你的看法。'
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
