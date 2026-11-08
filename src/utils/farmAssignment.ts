import { RESIDENTS, RESIDENT_IDS, isResidentId, type ResidentId } from './farmLife';

export type AssignmentStatus = 'needs_details' | 'walking' | 'talking' | 'answered' | 'unanswered' | 'interrupted' | 'cancelled';
export interface FarmAssignment {
  id: string; target?: ResidentId; question?: string; status: AssignmentStatus;
  updatedAt: number; engineId?: string; outcome?: string;
}
export function restoreAssignment(raw: unknown): FarmAssignment | undefined {
  if (!raw || typeof raw !== 'object') return;
  const v = raw as Partial<FarmAssignment>;
  if (typeof v.id !== 'string' || !['needs_details', 'walking', 'talking', 'answered', 'unanswered', 'interrupted', 'cancelled'].includes(v.status ?? '')) return;
  const status = v.status === 'walking' || v.status === 'talking' ? 'interrupted' : v.status!;
  return { id: v.id.slice(0, 100), status, updatedAt: typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : 0,
    ...(isResidentId(v.target) ? { target: v.target } : {}),
    ...(typeof v.question === 'string' && v.question.trim() ? { question: v.question.trim().slice(0, 160) } : {}),
    ...(typeof v.engineId === 'string' ? { engineId: v.engineId.slice(0, 100) } : {}),
    ...(typeof v.outcome === 'string' ? { outcome: v.outcome.slice(0, 240) } : {}),
  };
}
export function assignmentRecall(task: FarmAssignment): string {
  const objective = `找${task.target ? RESIDENTS[task.target].name : '谁还没确定'}，问「${task.question ?? '具体问题还没确定'}」`;
  const progress = { needs_details: '还缺细节，我还没有出发', walking: '已经接下，正在去找对方', talking: '已经见面，正在询问', answered: '已经收到答复', unanswered: '暂时没有得到有效答复', interrupted: '上次中断了，还没办完；你明确让我继续时再出发', cancelled: '你已经取消，我不会继续执行' }[task.status];
  return `我记着：${objective}。${progress}。${task.outcome ?? ''}`;
}
const aliases = (id: ResidentId) => [RESIDENTS[id].name, id, ...(id === 'weigang' ? ['伟刚', '伟纲', '唯纲'] : [])];
function namedTargets(text: string, who: ResidentId) {
  return RESIDENT_IDS.filter(id => id !== who && aliases(id).some(name => text.includes(name))).sort((a, b) => {
    const index = (id: ResidentId) => Math.min(...aliases(id).map(name => text.indexOf(name)).filter(i => i >= 0));
    return index(a) - index(b);
  });
}
export interface AssignmentInput { task: FarmAssignment; reply: string; execute?: { target: ResidentId; purpose: string }; cancel?: true; recall?: true }

/** Bounded local intent memory. Arbitrary language can still use the model's validated action. */
export function understandAssignment(text: string, who: ResidentId, current: FarmAssignment | undefined, previous: readonly { player: string }[], at: number): AssignmentInput | null {
  if (current && /记得.*(?:让|要|做|委托|任务|事情)|(?:委托|任务|那件事).*(?:进度|进展|怎么样)|问得怎么样|问到没有|办得怎么样/.test(text)) return { task: current, reply: assignmentRecall(current), recall: true };
  if (current && /^(?:那|你|这件事|这个任务|刚才的事|算了|先)?[，,\s]*(?:先别去|先别问|别去了|不用去了|不要去了|不要再去|不要再问|取消|不问了|不用问|别再问|算了)/.test(text)) return { task: { ...current, status: 'cancelled', updatedAt: at }, reply: '记住了，这个委托取消，我不会再去问。', cancel: true };
  if (/^(?:如果|假如|要是|他说|她说|[“「"'])/.test(text.trim()) || /不要去|别去|不用去/.test(text)) return null;
  const retry = current && /^(?:那就|你|请|麻烦)?(?:继续去问|继续办|重新去问|再去问一次|按刚才说的办|照刚才说的办|去吧)[。！!\s]*$/.test(text);
  const correction = current && /^(?:不是|改成|换成|是找|是问|补充|还有)/.test(text);
  if (/^(?:请|麻烦)?(?:你)?(?:告诉我|问你|问个问题|解释一下)/.test(text)) return null;
  const directed = /问|转告|传话|带话|质问|询问/.test(text) || /找|告诉|解释|劝|安慰/.test(text) && (namedTargets(text, who).length > 0 || /[他她]|找谁|找个人/.test(text));
  const explicit = directed && (/^(?:(?:小八|顾|玉洁|唯刚|伟刚|door|坤坤)[，,\s]*)?(?:请|麻烦|帮我|替我|你去|去找|去问|找|问问|问一下|问他|问她|转告|告诉|质问|能不能帮我)/.test(text) || /^问/.test(text) && namedTargets(text, who).length > 0);
  const supplemental = current?.status === 'needs_details' && (namedTargets(text, who).length === 1 || /为什么|怎么|几点|什么时候|是否|有没有|吃什么/.test(text));
  if (!retry && !correction && !explicit && !supplemental) return null;
  if (/(?:聊聊天|聊聊|聊天|说说话)[吧呀啊。！!\s]*$/.test(text) && !/问|关于|有关|这件事|为什么|怎么/.test(text)) return null;
  const active = current && !['answered', 'cancelled'].includes(current.status) ? current : undefined;
  const command = correction ? text.replace(/^不是[^，,；;]*[，,；;]\s*(?:是|要)?/, '') : text;
  const requestClause = command.match(/(?:去找|去问|帮我问|替我问|问问|问一下|质问|询问|告诉|转告|找)(.*)/)?.[1] ?? command;
  const names = namedTargets(requestClause, who);
  const priorCandidates = previous.slice(-8).reverse().filter(turn => namedTargets(turn.player, who).length === 1);
  const prior = priorCandidates.find(turn => !/^(?:请|麻烦|帮我|替我|你去|去找|去问|找|问|转告|告诉|质问)/.test(turn.player)) ?? priorCandidates[0];
  const target = names[0] ?? active?.target ?? (/[他她]|刚才|这件事/.test(text) && prior ? namedTargets(prior.player, who)[0] : undefined);
  let tail = command;
  const name = target && aliases(target).find(name => requestClause.includes(name));
  if (name) tail = requestClause.slice(requestClause.indexOf(name) + name.length);
  else tail = tail.replace(/^(?:请|麻烦|帮我|替我|你去|去|能不能帮我)*(?:找[他她])?(?:问问|问一下|问清楚|问|质问|告诉|转告|询问)[他她]?/, '');
  tail = tail.replace(/^[，,：:\s]*(?:问问|问一下|问清楚|问|询问|聊聊)?[：:\s]*/, '').trim();
  const generic = !tail || /^(?:他|她|去|一下|这件事|这个|问问|问一下|问清楚|说一下|吧|去吧|继续去问)[。！!\s]*$/.test(tail);
  let question = retry ? current?.question : generic ? active?.question : tail.slice(-160);
  const reference = active?.question ?? prior?.player;
  if (question && reference && /这样|这件事|那个问题|怎么回事|刚才/.test(question) && question !== reference) question = reference.slice(0, 60) + '；' + question.slice(-99);
  if (current?.question && /^(?:补充|还有)/.test(text) && question && question !== current.question) question = current.question.slice(0, 79) + '；' + question.replace(/^(?:补充|还有)[：:,，\s]*/, '').slice(-80);
  if (!question && generic && /[他她]|刚才|这件事/.test(text) && prior && !/^(?:找|去找|去问|帮我)/.test(prior.player)) question = prior.player.slice(-160);
  if (correction && /找/.test(command) && !/问|为什么|几点|什么时候|怎么/.test(command)) question = current?.question;
  const task: FarmAssignment = { id: active?.id ?? `assignment-${at}`, target, question, status: target && question ? 'walking' : 'needs_details', updatedAt: at };
  if (!target || !question) return { task, reply: !target ? `我记住${question ? '要问「' + question + '」' : '你想让我去问一件事'}了。具体去找谁？` : `是找${RESIDENTS[target].name}，我记住了。具体要问什么？` };
  if (current && ['walking', 'talking'].includes(current.status) && current.target === target && current.question === question && !correction) return { task: current, reply: assignmentRecall(current), recall: true };
  return { task, execute: { target, purpose: question }, reply: `我记住了：找${RESIDENTS[target].name}，问「${question}」。我会按这个去办。` };
}
