import { RESIDENTS, type ResidentId, type ResidentLine } from './farmLife';
import type { RelayIntent } from './farmAssignment';

export interface RequestReport {
  summary: string;
  impression: string;
  needsDetails: boolean;
}

const clauses = (text: string) => text.split(/[。！？!?；;\n]+/).map(part => part.trim()).filter(Boolean);
const normalized = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function readRequestReport(raw: unknown, lines: readonly Pick<ResidentLine, 'text'>[]): RequestReport | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { summary, impression, needsDetails } = raw as Partial<RequestReport>;
  if (typeof summary !== 'string' || typeof impression !== 'string' || typeof needsDetails !== 'boolean') return;
  const response = summary.trim();
  const view = impression.trim();
  if (!response || response.length > 100 || !view || view.length > 75) return;
  const source = lines.flatMap(line => clauses(line.text)).map(normalized).filter(part => part.length >= 5);
  const copiesDialogue = (text: string) => clauses(text).map(normalized).some(part =>
    part.length >= 5 && source.some(line => part === line || line.includes(part) ||
      (part.includes(line) && line.length >= part.length * 0.65)));
  if (copiesDialogue(response) || copiesDialogue(view) ||
      normalized(response).includes(normalized(view)) || normalized(view).includes(normalized(response))) return;
  return { summary: response, impression: view, needsDetails };
}

const LOCAL_VIEWS: Record<ResidentId, readonly [pending: string, answered: string]> = {
  door: ['先把关键细节理顺，下次再去问就更有谱了。', '我就先按这次听到的记着，有变动再帮你跟进。'],
  gu: ['我想先把你最在意的那点记清楚，下回别漏了。', '听着氛围挺缓和的，回头你也可以亲自和他聊聊。'],
  xiaoba: ['先挑最卡住的那一点问明白，整件事就好办多了。', '答复挺实在的，回头真要干的时候随时喊我。'],
  yujie: ['还是得拿个具体例子去对，光猜来猜去太绕了。', '话我都带明白也问清楚了，这波算没白跑一趟。'],
  weigang: ['嗯……先把两边说的对上号，省得越传越偏。', '我把对方提到的条件都记下来了，免得回头忘掉。'],
  chicken: ['咕，等你想起最清楚的那一小段，坤坤再帮你跑一趟。', '咕，坤坤把话带到啦，感觉对方挺开心的！'],
};

const endSentence = (text: string) => /[。！？!?]$/.test(text) ? text : text + '。';

export function formatRequestReport(
  actor: ResidentId,
  target: ResidentId,
  question: string,
  lines: readonly Pick<ResidentLine, 'speaker' | 'text'>[],
  online: boolean,
  report?: RequestReport,
  intent?: RelayIntent,
) {
  const name = RESIDENTS[target].name;
  const prefix = actor === 'chicken' ? `咕，我刚去找${name}回来啦。` : `我刚和${name}聊完回来。`;
  if (report) {
    return {
      text: prefix + endSentence(report.summary) + endSentence(report.impression),
      needsDetails: report.needsDetails,
    };
  }
  const replies = [...new Set(lines.filter(line => line.speaker === target).flatMap(line => clauses(line.text)))];
  const response = replies.join('。');

  // Convey / invite relays succeed once delivered and acknowledged.
  if (intent === 'convey' || intent === 'invite') {
    const delivered = replies.length > 0;
    return delivered
      ? {
          text: prefix + endSentence(`我已经把你的话转告给${name}了，对方听完回应说心里有数，也让你别惦记`) + LOCAL_VIEWS[actor][1],
          needsDetails: false,
        }
      : {
          text: prefix + '刚才没来得及把话说完整，稍后可以再去转告一次。' + LOCAL_VIEWS[actor][0],
          needsDetails: true,
        };
  }

  const asksForWording = /原话|那句话|哪一句|当时的情境/.test(response);
  const hasNoAnswer = /还没定|没有定|没弄清|不确定|无法确认|不知道|还要核实|需要核实/.test(response);
  if (!online || asksForWording || hasNoAnswer) {
    const missing = asksForWording
      ? '这次还没得到结论，对方想先听听你记得的原话和当时发生了什么，才好当面说清。'
      : hasNoAnswer && /几点|什么时候|何时/.test(question)
        ? '目前还没定下具体时间，可以等安排妥当再问。'
        : '这次还没得到明确答复，下次可以把具体情况和最想问的那一点一起带过去。';
    return { text: prefix + missing + LOCAL_VIEWS[actor][0], needsDetails: true };
  }
  const detail = replies.map(part => part.replace(/^(?:我觉得|我想|我认为|我建议|我的意思是)[，、：:\s]*/, ''))
    .find(part => part.length >= 5 && !/^(?:好[的吧]?|嗯|行|知道了|我明白|麻烦你|帮我|请转告|请如实|谢谢|就这样)/.test(part));
  return detail
    ? { text: prefix + endSentence('记下的重点是' + detail.slice(0, 65).replace(/^我/, name)) + LOCAL_VIEWS[actor][1], needsDetails: false }
    : { text: prefix + '这次还没得到明确答复。' + LOCAL_VIEWS[actor][0], needsDetails: true };
}
