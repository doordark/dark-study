import { RESIDENTS, type ResidentId, type ResidentLine } from './farmLife';

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
  door: ['我觉得先把能确认的细节理清，下次就知道该追问哪一步。', '我会先按这次问到的条件理解，条件一变就值得再确认。'],
  gu: ['我想先听听你最在意的那一点，下回聊时别把它漏了。', '我会留一点商量的余地，看看这个答复对你是不是合适。'],
  xiaoba: ['我想先挑最卡住的那个细节问清，整件事可能就好聊多了。', '这让我想到可以先试一小步，再看看答复能不能用上。'],
  yujie: ['我还是想听一个具体例子，那比绕着这件事猜来猜去有用。', '我想拿你遇到的情况对一下，看看这个说法能不能说得通。'],
  weigang: ['我想先把双方说的是不是同一件事弄清，再比较两边的说法。', '我会把对方提到的条件一起记下来，省得只记得结论。'],
  chicken: ['咕，我想从你记得最清楚的那一小段接着问。', '咕，我想先记住最有用的那一点，有疑问再跑一趟。'],
};

const endSentence = (text: string) => /[。！？!?]$/.test(text) ? text : text + '。';

export function formatRequestReport(
  actor: ResidentId, target: ResidentId, question: string,
  lines: readonly Pick<ResidentLine, 'speaker' | 'text'>[],
  online: boolean, report?: RequestReport,
) {
  const name = RESIDENTS[target].name;
  const prefix = `我和${name}聊过了。`;
  if (report) {
    return {
      text: prefix + endSentence(report.summary) + endSentence(report.impression),
      needsDetails: report.needsDetails,
    };
  }
  const replies = [...new Set(lines.filter(line => line.speaker === target).flatMap(line => clauses(line.text)))];
  const response = replies.join('。');
  const asksForWording = /原话|那句话|哪一句|当时的情境/.test(response);
  const hasNoAnswer = /还没定|没有定|没弄清|不确定|无法确认|不知道|还要核实|需要核实/.test(response);
  if (!online || asksForWording || hasNoAnswer) {
    const missing = asksForWording
      ? '这次还没得到结论。对方想先听听你记得的原话和当时发生了什么，才好继续核实。'
      : hasNoAnswer && /几点|什么时候|何时/.test(question)
        ? '目前还没有明确时间，可以等安排定下来再问。'
        : '这次还没得到明确答复。下次可以把具体情况和想弄清的那一点一起带过去。';
    return { text: prefix + missing + LOCAL_VIEWS[actor][0], needsDetails: true };
  }
  // Older model replies may omit the report. Keep the first substantive detail,
  // rather than treating the target's closing pleasantry as their answer.
  const detail = replies.map(part => part.replace(/^(?:我觉得|我想|我认为|我建议|我的意思是)[，、：:\s]*/, ''))
    .find(part => part.length >= 5 && !/^(?:好[的吧]?|嗯|行|知道了|我明白|麻烦你|帮我|请转告|请如实|谢谢|就这样)/.test(part));
  return detail
    ? { text: prefix + endSentence('我记下的重点是' + detail.slice(0, 65).replace(/^我/, name)) + LOCAL_VIEWS[actor][1], needsDetails: false }
    : { text: prefix + '这次还没得到明确答复。' + LOCAL_VIEWS[actor][0], needsDetails: true };
}
