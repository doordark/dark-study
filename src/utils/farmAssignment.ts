import { RESIDENTS, RESIDENT_IDS, isResidentId, type ResidentId } from './farmLife';

export type AssignmentStatus = 'needs_details' | 'walking' | 'talking' | 'answered' | 'unanswered' | 'interrupted' | 'cancelled';
/** 区分委托/转述的真实社交意图，不再把所有带话都当成“去问一个待核实问题”。 */
export type RelayIntent = 'ask' | 'convey' | 'confront' | 'invite';

export const RELAY_INTENTS = ['ask', 'convey', 'confront', 'invite'] as const;

export function isRelayIntent(value: unknown): value is RelayIntent {
  return typeof value === 'string' && (RELAY_INTENTS as readonly string[]).includes(value);
}

export function detectRelayIntent(text: string): RelayIntent {
  if (/骂|辱|欺负|欺凌|质问|凶我|摆脸色|误会|吵架|委屈/.test(text)) return 'confront';
  const asksQuestion = /[？?]|为什么|怎么回事|几点|什么时候|何时|吃什么|有没有|是不是|吗[。！!\s]*$|怎么样|问问|问一下|问清楚|打听|询问/.test(text);
  if (!asksQuestion && /(?:转告|带话|传话|转达|告诉|跟.{0,8}说|替我.{0,4}(?:夸|表扬|谢谢|感谢|道歉|说声|安慰|劝)|帮我.{0,4}(?:夸|表扬|谢谢|感谢|道歉|说声|提醒|问好|问候|安慰|劝)|向.{0,6}(?:道歉|问好|道谢))/.test(text)) {
    return 'convey';
  }
  if (!asksQuestion && /(?:叫|喊|约|请).{0,8}(?:过来|来一下|一块|一起玩|吃|喝茶|钓)/.test(text)) {
    return 'invite';
  }
  if (/转告|带话|传话|转达/.test(text) && !/[？?]|为什么|几点|什么时候/.test(text)) return 'convey';
  return 'ask';
}

export interface FarmAssignment {
  id: string;
  target?: ResidentId;
  question?: string;
  intent?: RelayIntent;
  status: AssignmentStatus;
  updatedAt: number;
  engineId?: string;
  outcome?: string;
  resumeFrom?: string;
}

export function restoreAssignment(raw: unknown): FarmAssignment | undefined {
  if (!raw || typeof raw !== 'object') return;
  const v = raw as Partial<FarmAssignment>;
  if (typeof v.id !== 'string' || !['needs_details', 'walking', 'talking', 'answered', 'unanswered', 'interrupted', 'cancelled'].includes(v.status ?? '')) return;
  const status = v.status === 'walking' || v.status === 'talking' ? 'interrupted' : v.status!;
  return {
    id: v.id.slice(0, 100),
    status,
    updatedAt: typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : 0,
    ...(isResidentId(v.target) ? { target: v.target } : {}),
    ...(typeof v.question === 'string' && v.question.trim() ? { question: v.question.trim().slice(0, 160) } : {}),
    ...(isRelayIntent(v.intent) ? { intent: v.intent } : {}),
    ...(typeof v.engineId === 'string' ? { engineId: v.engineId.slice(0, 100) } : {}),
    ...(typeof v.resumeFrom === 'string' ? { resumeFrom: v.resumeFrom.slice(0, 100) } : {}),
    ...(typeof v.outcome === 'string' ? { outcome: v.outcome.slice(0, 240) } : {}),
  };
}

function intentActionVerb(intent?: RelayIntent): string {
  if (intent === 'convey') return '转告';
  if (intent === 'confront') return '问清楚';
  if (intent === 'invite') return '叫一声';
  return '问';
}

export function formatAssignmentAck(who: ResidentId, target: ResidentId, content: string, intent: RelayIntent): string {
  const name = RESIDENTS[target].name;
  const short = content.length > 36 ? content.slice(0, 36) + '…' : content;
  if (intent === 'convey') {
    return ({
      door: `没问题，我这就过去跟${name}说一声，把你的意思带到。`,
      gu: `好呀，我顺路去找${name}，把「${short}」替你好好带到。`,
      xiaoba: `行，我去跟${name}转达，回头告诉你他的反应。`,
      yujie: `包在我身上，我去跟${name}说，看他听了啥表情。`,
      weigang: `嗯……好的，我去找${name}把话带到，再回来跟你说。`,
      chicken: `咕！坤坤这就迈开小短腿去找${name}传话去！`,
    } as Record<ResidentId, string>)[who];
  }
  if (intent === 'confront') {
    return ({
      door: `别急，我去找${name}当面把这事理清楚，回来如实告诉你。`,
      gu: `先别难过，我去帮你在${name}那儿问问到底怎么回事。`,
      xiaoba: `我去问${name}。弄清前因后果再回来跟你说。`,
      yujie: `还有这事？走，我替你去问问${name}怎么回事，回来原话告诉你。`,
      weigang: `嗯……我去轻轻问问${name}，别把误会越闹越大，问完就回来。`,
      chicken: `咕……别生气呀，坤坤去替你问问${name}是怎么回事。`,
    } as Record<ResidentId, string>)[who];
  }
  if (intent === 'invite') {
    return ({
      door: `好，我过去喊${name}一声。`,
      gu: `行，我去把${name}叫过来，你先坐会儿。`,
      xiaoba: `好，我去喊${name}。`,
      yujie: `行啊，我去把${name}拉过来。`,
      weigang: `嗯，我去跟${name}说一声。`,
      chicken: `咕！坤坤去把${name}带过来！`,
    } as Record<ResidentId, string>)[who];
  }
  return ({
    door: `行，我去找${name}打听一下「${short}」，问完回来告诉你。`,
    gu: `好呀，我去问问${name}，有消息马上回来跟你说。`,
    xiaoba: `好，我去问${name}，回来给你信儿。`,
    yujie: `行吧，跑个腿而已，我去帮你问问${name}。`,
    weigang: `嗯……那我去找${name}问一下，问清了就回来告诉你。`,
    chicken: `咕咕，坤坤去帮客人问问${name}，马上回来！`,
  } as Record<ResidentId, string>)[who];
}

export function formatAssignmentCancel(who: ResidentId): string {
  return ({
    door: '行，那就先不去了，回头有需要再喊我。',
    gu: '好，那这事就先算啦，不去了。',
    xiaoba: '嗯，取消了，我就不去了。',
    yujie: '得嘞，省得我跑一趟。那这事儿算翻篇。',
    weigang: '嗯，知道了，那我就不去打扰了。',
    chicken: '咕，好呀，那坤坤就在这儿陪你晒太阳。',
  } as Record<ResidentId, string>)[who];
}

export function assignmentRecall(task: FarmAssignment, who?: ResidentId): string {
  const targetName = task.target ? RESIDENTS[task.target].name : '谁还没定';
  const verb = intentActionVerb(task.intent);
  const objective = task.question ? `找${targetName}${verb}「${task.question}」` : `找${targetName}`;
  const progress = {
    needs_details: '还差一点细节，我还没出发',
    walking: '已经记着了，正往那边走呢',
    talking: '已经碰上面，正在聊着',
    answered: '已经办完带回消息了',
    unanswered: '上次没问出准信儿，还需要补点细节',
    interrupted: '上次中途打断了还没办完，你要继续的话说一声我再去',
    cancelled: '你之前说取消了，我就没再去了',
  }[task.status];
  const opener = who === 'chicken' ? '咕，我记得呢：' : who === 'yujie' ? '我记性没那么差，' : '我记着呢，';
  return `${opener}${objective}——${progress}。${task.outcome ?? ''}`;
}

const aliases = (id: ResidentId) => [
  RESIDENTS[id].name,
  id,
  ...(id === 'weigang' ? ['伟刚', '伟纲', '唯纲', '小弟'] : []),
  ...(id === 'xiaoba' ? ['大哥'] : []),
  ...(id === 'yujie' ? ['二哥'] : []),
  ...(id === 'door' ? ['爸爸'] : []),
  ...(id === 'gu' ? ['妈妈'] : []),
];

function namedTargets(text: string, who: ResidentId) {
  return RESIDENT_IDS.filter(id => id !== who && aliases(id).some(name => text.includes(name))).sort((a, b) => {
    const index = (id: ResidentId) => Math.min(...aliases(id).map(name => text.indexOf(name)).filter(i => i >= 0));
    return index(a) - index(b);
  });
}

export interface AssignmentInput {
  task: FarmAssignment;
  reply: string;
  execute?: { target: ResidentId; purpose: string; intent: RelayIntent };
  cancel?: true;
  recall?: true;
}

/** Bounded local intent memory. Arbitrary language can still use the model's validated action. */
export function understandAssignment(
  text: string,
  who: ResidentId,
  current: FarmAssignment | undefined,
  previous: readonly { player: string }[],
  at: number,
): AssignmentInput | null {
  if (current && /记得.*(?:让|要|做|委托|任务|事情|带话|转告)|(?:委托|任务|那件事|带话).*(?:进度|进展|怎么样)|问得怎么样|问到没有|办得怎么样|带到了吗|说了吗/.test(text)) {
    return { task: current, reply: assignmentRecall(current, who), recall: true };
  }
  if (current && /^(?:那|你|这件事|这个任务|刚才的事|算了|先)?[，,\s]*(?:先别去|先别问|先别说|别去了|不用去了|不要去了|不要再去|不要再问|取消|不问了|不用问|别再问|算了|不用转告)/.test(text)) {
    return { task: { ...current, status: 'cancelled', updatedAt: at }, reply: formatAssignmentCancel(who), cancel: true };
  }
  if (/^(?:如果|假如|要是|他说|她说|[“「"'])/.test(text.trim()) || /不要去|别去|不用去/.test(text)) return null;
  const retry = current && /^(?:那就|你|请|麻烦)?(?:继续去问|继续办|重新去问|再去问一次|继续去说|按刚才说的办|照刚才说的办|去吧)[。！!\s]*$/.test(text);
  const correction = current && /^(?:不是|改成|换成|是找|是问|补充|还有)/.test(text);
  if (/^(?:请|麻烦)?(?:你)?(?:告诉我|问你|问个问题|解释一下)/.test(text)) return null;

  const directed =
    /问|转告|传话|带话|转达|质问|询问/.test(text) ||
    /(?:找|告诉|解释|劝|安慰|夸|表扬|感谢|道谢|道歉|提醒|问好|问候|跟.{0,8}说|给.{0,8}带)/.test(text) &&
      (namedTargets(text, who).length > 0 || /[他她]|找谁|找个人/.test(text));
  const explicit = directed && (
    /^(?:(?:小八|顾|玉洁|唯刚|伟刚|door|坤坤)[，,\s]*)?(?:请|麻烦|帮我|替我|你去|去找|去问|去跟|去告诉|找|问问|问一下|问他|问她|转告|告诉|转达|带话|传话|质问|能不能帮我|可不可以帮我)/.test(text) ||
    /^问/.test(text) && namedTargets(text, who).length > 0
  );
  const supplemental = current?.status === 'needs_details' && (namedTargets(text, who).length === 1 || /为什么|怎么|几点|什么时候|是否|有没有|吃什么|说|告诉|转告|夸|道歉/.test(text));
  if (!retry && !correction && !explicit && !supplemental) return null;
  if (/(?:聊聊天|聊聊|聊天|说说话)[吧呀啊。！!\s]*$/.test(text) && !/问|关于|有关|这件事|为什么|怎么|转告|带话/.test(text)) return null;

  const active = current && !['answered', 'cancelled'].includes(current.status) ? current : undefined;
  const command = correction ? text.replace(/^不是[^，,；;]*[，,；;]\s*(?:是|要)?/, '') : text;
  const requestClause = command.match(/(?:去找|去问|去跟|去告诉|帮我问|替我问|帮我跟|替我跟|帮我给|替我给|帮我夸(?:夸)?|替我夸(?:夸)?|帮我提醒|替我提醒|帮我向|替我向|问问|问一下|质问|询问|告诉|转告|转达|带话给|传话给|找)(.*)/)?.[1] ?? command;
  const names = namedTargets(requestClause, who);
  const priorCandidates = previous.slice(-8).reverse().filter(turn => namedTargets(turn.player, who).length === 1);
  const prior = priorCandidates.find(turn => !/^(?:请|麻烦|帮我|替我|你去|去找|去问|找|问|转告|告诉|质问)/.test(turn.player)) ?? priorCandidates[0];
  const target = names[0] ?? active?.target ?? (/[他她]|刚才|这件事/.test(text) && prior ? namedTargets(prior.player, who)[0] : undefined);

  let tail = command;
  const name = target && aliases(target).find(alias => requestClause.includes(alias));
  if (name) tail = requestClause.slice(requestClause.indexOf(name) + name.length);
  else tail = tail.replace(/^(?:请|麻烦|帮我|替我|你去|去|能不能帮我)*(?:找[他她])?(?:问问|问一下|问清楚|问|质问|告诉|转告|转达|询问|带话|传话)[他她]?/, '');
  tail = tail.replace(/^[，,：:\s]*(?:问问|问一下|问清楚|问|询问|聊聊|说一声|说一下|说|带个话|带句话|一声)?[：:\s]*/, '').trim();
  const generic = !tail || /^(?:他|她|去|一下|这件事|这个|问问|问一下|问清楚|说一下|说一声|吧|去吧|继续去问)[。！!\s]*$/.test(tail);

  // Preserve compliment/apology/greeting phrasing when the verb itself carries the message (e.g. "替我夸夸玉洁")
  let question = retry ? current?.question : generic ? active?.question : tail.slice(-160);
  if (!question && /(?:夸夸|表扬|谢谢|感谢|道歉|问好|问候|安慰)/.test(command)) {
    question = command.replace(/^(?:请|麻烦|帮我|替我|你去|去|能不能帮我)+/, '').trim().slice(-160);
  }
  const reference = active?.question ?? prior?.player;
  if (question && reference && /这样|这件事|那个问题|怎么回事|刚才/.test(question) && question !== reference) {
    question = reference.slice(0, 60) + '；' + question.slice(-99);
  }
  if (current?.question && /^(?:补充|还有)/.test(text) && question && question !== current.question) {
    question = current.question.slice(0, 79) + '；' + question.replace(/^(?:补充|还有)[：:,，\s]*/, '').slice(-80);
  }
  if (!question && generic && /[他她]|刚才|这件事/.test(text) && prior && !/^(?:找|去找|去问|帮我)/.test(prior.player)) {
    question = prior.player.slice(-160);
  }
  if (correction && /找/.test(command) && !/问|为什么|几点|什么时候|怎么|说|转告/.test(command)) {
    question = current?.question;
  }

  const intent: RelayIntent = retry && current?.intent
    ? current.intent
    : correction && current?.intent && !/问|转告|质问|夸|道歉/.test(command)
      ? current.intent
      : detectRelayIntent(`${command} ${question ?? ''}`);

  const task: FarmAssignment = {
    id: active?.id ?? `assignment-${at}`,
    target,
    question,
    intent,
    status: target && question ? 'walking' : 'needs_details',
    updatedAt: at,
  };
  if (!target || !question) {
    const askMissing = !target
      ? (who === 'chicken' ? `咕，要找哪位家人${intentActionVerb(intent)}呀？` : `好，${question ? `关于「${question}」` : '这件事'}你想让我去找谁？`)
      : (who === 'chicken' ? `咕，去找${RESIDENTS[target].name}呀，具体要跟他说什么呢？` : `找${RESIDENTS[target].name}没问题，你想让我具体${intent === 'convey' ? '替你带什么话' : '问他什么'}？`);
    return { task, reply: askMissing };
  }
  if (current && ['walking', 'talking'].includes(current.status) && current.target === target && current.question === question && !correction) {
    return { task: current, reply: assignmentRecall(current, who), recall: true };
  }
  return {
    task,
    execute: { target, purpose: question, intent },
    reply: formatAssignmentAck(who, target, question, intent),
  };
}
