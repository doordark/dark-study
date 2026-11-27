export type NightSkyQuoteCategory = "book" | "film" | "anime" | "essay" | "online";

export interface NightSkyQuote {
  id: string;
  text: string;
  work: string;
  author?: string;
  category: NightSkyQuoteCategory;
}

export const QUOTE_CATEGORY_LABELS: Record<NightSkyQuoteCategory, string> = {
  book: "书摘 · 星笺",
  film: "影史 · 台词",
  anime: "动画 · 微光",
  essay: "随笔 · 拾句",
  online: "在线 · 一言",
};

/**
 * 精选经核实出处的经典书籍、散文、影视与动画语录。
 * 长度控制在 10～54 字，适配星空底部卡片 2～3 行排版，避免空洞 AI 套话与伪托名言。
 */
export const NIGHT_SKY_QUOTES: readonly NightSkyQuote[] = [
  // ── 书摘（26 句） ──────────────────────────────────────────────────────────
  {
    id: "book-camus-summer",
    text: "在隆冬，我终于知道，我身上有一个不可战胜的夏天。",
    author: "阿尔贝·加缪",
    work: "重返蒂帕萨",
    category: "book",
  },
  {
    id: "book-wilde-stars",
    text: "我们都生活在阴沟里，但仍有人仰望星空。",
    author: "奥斯卡·王尔德",
    work: "温德米尔夫人的扇子",
    category: "book",
  },
  {
    id: "book-little-prince-heart",
    text: "只有用心才能看清。实质性的东西，用眼睛是看不见的。",
    author: "圣埃克苏佩里",
    work: "小王子",
    category: "book",
  },
  {
    id: "book-little-prince-rose",
    text: "正是你为你的玫瑰花费的时间，才使你的玫瑰变得如此重要。",
    author: "圣埃克苏佩里",
    work: "小王子",
    category: "book",
  },
  {
    id: "book-tagore-stars",
    text: "如果你错过了太阳时流了泪，那么你也要错过群星了。",
    author: "泰戈尔",
    work: "飞鸟集",
    category: "book",
  },
  {
    id: "book-tagore-guide",
    text: "让我设想，在群星之中，有一颗星是指导着我的生命通过不可知的黑暗的。",
    author: "泰戈尔",
    work: "飞鸟集",
    category: "book",
  },
  {
    id: "book-hesse-demian",
    text: "对每个人而言，真正的职责只有一个：找到自我，然后在心中坚守其一生。",
    author: "赫尔曼·黑塞",
    work: "德米安",
    category: "book",
  },
  {
    id: "book-hesse-siddhartha-stars",
    text: "有少数人恰如沿着既定轨道运行的星辰：无常的命运之风吹不到他们，他们内心有着既定的航程。",
    author: "赫尔曼·黑塞",
    work: "悉达多",
    category: "book",
  },
  {
    id: "book-hesse-siddhartha-wisdom",
    text: "知识可以传授，但智慧不能。人们可以寻见智慧，在生命中体现出智慧，以智慧自强。",
    author: "赫尔曼·黑塞",
    work: "悉达多",
    category: "book",
  },
  {
    id: "book-rilke-endure",
    text: "有何胜利可言，挺住意味着一切。",
    author: "里尔克",
    work: "安魂曲",
    category: "book",
  },
  {
    id: "book-rilke-questions",
    text: "试着去喜爱困扰你的问题；现在先活在这些难题里，也许有一天，你将不知不觉活出写满答案的人生。",
    author: "里尔克",
    work: "给青年诗人的信",
    category: "book",
  },
  {
    id: "book-rolland-heroism",
    text: "世界上只有一种真正的英雄主义，那就是在认识生活的真相后依然热爱生活。",
    author: "罗曼·罗兰",
    work: "米开朗琪罗传",
    category: "book",
  },
  {
    id: "book-hemingway-oldman",
    text: "一个人并不是生来要给打败的，你尽可以把他消灭掉，可就是打不败他。",
    author: "海明威",
    work: "老人与海",
    category: "book",
  },
  {
    id: "book-hemingway-newday",
    text: "每一天都是一个新的日子。走运当然是好的，不过我情愿做到分毫不差，这样运气来时你就有所准备。",
    author: "海明威",
    work: "老人与海",
    category: "book",
  },
  {
    id: "book-borges-library",
    text: "我心里一直都在暗暗设想，天堂应该是图书馆的模样。",
    author: "博尔赫斯",
    work: "关于天赐的诗",
    category: "book",
  },
  {
    id: "book-shitiesheng-sun",
    text: "太阳，每时每刻都是夕阳，也都是旭日。",
    author: "史铁生",
    work: "我与地坛",
    category: "book",
  },
  {
    id: "book-shitiesheng-challenge",
    text: "命定的局限尽可永在，不屈的挑战却不可须臾或缺。",
    author: "史铁生",
    work: "病隙碎笔",
    category: "book",
  },
  {
    id: "book-shitiesheng-string",
    text: "人的命就像这琴弦，拉紧了才能弹好，弹好了就够了。",
    author: "史铁生",
    work: "命若琴弦",
    category: "book",
  },
  {
    id: "book-yuhua-alive",
    text: "人是为活着本身而活着，而不是为了活着之外的任何事物所活着。",
    author: "余华",
    work: "活着",
    category: "book",
  },
  {
    id: "book-murakami-forest",
    text: "每个人都有属于自己的一片森林，迷失的人迷失了，相逢的人会再相逢。",
    author: "村上春树",
    work: "挪威的森林",
    category: "book",
  },
  {
    id: "book-higashino-namiya",
    text: "我的回答之所以发挥了作用，是因为他们自己很努力。如果自己不想积极认真地生活，再好的回答也没有用。",
    author: "东野圭吾",
    work: "解忧杂货店",
    category: "book",
  },
  {
    id: "book-zweig-stars",
    text: "这群星闪耀的时刻，宛若星辰一般永远散射着光辉，普照着暂时的黑夜。",
    author: "斯蒂芬·茨威格",
    work: "人类群星闪耀时",
    category: "book",
  },
  {
    id: "book-luxun-hometown",
    text: "其实地上本没有路，走的人多了，也便成了路。",
    author: "鲁迅",
    work: "故乡",
    category: "book",
  },
  {
    id: "book-bingxin-flower",
    text: "成功的花，人们只惊羡她现时的明艳！然而当初她的芽儿，浸透了奋斗的泪泉，洒遍了牺牲的血雨。",
    author: "冰心",
    work: "繁星·春水",
    category: "book",
  },
  {
    id: "book-liucixin-threebody",
    text: "给岁月以文明，而不是给文明以岁月。",
    author: "刘慈欣",
    work: "三体",
    category: "book",
  },
  {
    id: "book-thoreau-walden",
    text: "如果一个人没有跟上同伴的脚步，也许是因为他听到了不同的鼓声。",
    author: "亨利·大卫·梭罗",
    work: "瓦尔登湖",
    category: "book",
  },

  // ── 随笔（12 句） ──────────────────────────────────────────────────────────
  {
    id: "essay-wangzengqi-winter",
    text: "家人闲坐，灯火可亲。",
    author: "汪曾祺",
    work: "冬天",
    category: "essay",
  },
  {
    id: "essay-wangzengqi-fun",
    text: "生活，是很好玩的。",
    author: "汪曾祺",
    work: "生活是很好玩的",
    category: "essay",
  },
  {
    id: "essay-fengzikai-vitality",
    text: "人间的事，只要生机不灭，即使重遭天灾人祸，暂被阻抑，终有抬头的日子。",
    author: "丰子恺",
    work: "生机",
    category: "essay",
  },
  {
    id: "essay-sanmao-tree",
    text: "如果有来生，要做一棵树，站成永恒。一半在土里安详，一半在风里飞扬，一半洒落阴凉，一半沐浴阳光。",
    author: "三毛",
    work: "说给自己听",
    category: "essay",
  },
  {
    id: "essay-zhuziqing-lotus",
    text: "虽然是满月，天上却有一层淡淡的云，所以不能朗照；但我以为这恰是到了好处。",
    author: "朱自清",
    work: "荷塘月色",
    category: "essay",
  },
  {
    id: "essay-zhuziqing-spring",
    text: "一年之计在于春，刚起头儿，有的是工夫，有的是希望。",
    author: "朱自清",
    work: "春",
    category: "essay",
  },
  {
    id: "essay-luxun-refeng",
    text: "有一分热，发一分光，就令萤火一般，也可以在黑暗里发一点光，不必等候炬火。",
    author: "鲁迅",
    work: "热风·随感录四十一",
    category: "essay",
  },
  {
    id: "essay-sushi-chibi",
    text: "惟江上之清风，与山间之明月，耳得之而为声，目遇之而成色，取之无禁，用之不竭。",
    author: "苏轼",
    work: "前赤壁赋",
    category: "essay",
  },
  {
    id: "essay-sushi-chengtian",
    text: "何夜无月？何处无竹柏？但少闲人如吾两人者耳。",
    author: "苏轼",
    work: "记承天寺夜游",
    category: "essay",
  },
  {
    id: "essay-bajin-stars",
    text: "望着星天，我就会忘记一切，仿佛回到了母亲的怀里似的。",
    author: "巴金",
    work: "繁星",
    category: "essay",
  },
  {
    id: "essay-taoyuanming-return",
    text: "悟已往之不谏，知来者之可追。实迷途其未远，觉今是而昨非。",
    author: "陶渊明",
    work: "归去来兮辞",
    category: "essay",
  },
  {
    id: "essay-libai-spring-night",
    text: "夫天地者，万物之逆旅也；光阴者，百代之过客也。",
    author: "李白",
    work: "春夜宴从弟桃花园序",
    category: "essay",
  },

  // ── 影视（16 句） ──────────────────────────────────────────────────────────
  {
    id: "film-shawshank-hope",
    text: "希望是美好的，也许是人间至善，而美好的事物永不消逝。",
    work: "肖申克的救赎",
    category: "film",
  },
  {
    id: "film-shawshank-free",
    text: "懦怯囚禁人的灵魂，希望可以让你自由。",
    work: "肖申克的救赎",
    category: "film",
  },
  {
    id: "film-walter-mitty-quiet",
    text: "美好的事物从不寻求关注。",
    work: "白日梦想家",
    category: "film",
  },
  {
    id: "film-walter-mitty-life",
    text: "开拓视野，冲破艰险，看见世界，贴近彼此，感受生活，这就是生活的目的。",
    work: "白日梦想家",
    category: "film",
  },
  {
    id: "film-interstellar-sky",
    text: "我们曾经仰望星空，思考我们在星辰中的位置；而现在我们只看着地面，忧虑我们在泥土中的位置。",
    work: "星际穿越",
    category: "film",
  },
  {
    id: "film-interstellar-night",
    text: "不要温和地走进那个良夜，白昼将尽，暮年仍应燃烧咆哮。",
    author: "狄兰·托马斯",
    work: "星际穿越",
    category: "film",
  },
  {
    id: "film-dead-poets",
    text: "我们读诗写诗，因为我们是人类的一员；诗、美、浪漫、爱，这些才是我们活着的意义。",
    work: "死亡诗社",
    category: "film",
  },
  {
    id: "film-soul-spark",
    text: "火花不是人生的目标，当你准备好开始生活的那一刻，它就已经点亮了。",
    work: "心灵奇旅",
    category: "film",
  },
  {
    id: "film-coco-memory",
    text: "死亡并不是生命的终点，遗忘才是。",
    work: "寻梦环游记",
    category: "film",
  },
  {
    id: "film-happyness-dream",
    text: "如果你有梦想，就要去捍卫它。如果你有理想，就要去努力实现。",
    work: "当幸福来敲门",
    category: "film",
  },
  {
    id: "film-wonder-kind",
    text: "当你需要在正确和善良之间做出选择时，选择善良。",
    work: "奇迹男孩",
    category: "film",
  },
  {
    id: "film-1900-keys",
    text: "琴键是有限的，但你在琴键上奏出的音乐是无限的。",
    work: "海上钢琴师",
    category: "film",
  },
  {
    id: "film-1988-timing",
    text: "缘分，还有时机，不是自动找上门的偶然，而是带着恳切的盼望做出的无数选择。",
    work: "请回答1988",
    category: "film",
  },
  {
    id: "film-choristes-never",
    text: "永远别说永不，凡事总有可以尝试的转机。",
    work: "放牛班的春天",
    category: "film",
  },
  {
    id: "film-truman-goodnight",
    text: "假如再也碰不见你，祝你早安、午安、晚安。",
    work: "楚门的世界",
    category: "film",
  },
  {
    id: "film-forrest-chocolates",
    text: "生活就像一盒巧克力，你永远不知道下一颗是什么味道。",
    work: "阿甘正传",
    category: "film",
  },

  // ── 动画（10 句） ──────────────────────────────────────────────────────────
  {
    id: "anime-spirited-away",
    text: "曾经发生过的事情不可能忘记，只是暂时想不起来而已。",
    work: "千与千寻",
    category: "anime",
  },
  {
    id: "anime-natsume-gentle",
    text: "我想成为一个温柔的人，因为曾被温柔的人那样对待，深深了解那种被温柔相待的感觉。",
    work: "夏目友人帐",
    category: "anime",
  },
  {
    id: "anime-natsume-love",
    text: "只要一旦得到爱，只要一旦付出爱，就再也无法令人忘怀了。",
    work: "夏目友人帐",
    category: "anime",
  },
  {
    id: "anime-haikyuu-lookup",
    text: "不准低头！排球是永远向上看的运动！",
    work: "排球少年！！",
    category: "anime",
  },
  {
    id: "anime-haikyuu-wings",
    text: "正因为没有翅膀，所以人们才会寻找飞翔的方法。",
    work: "排球少年！！",
    category: "anime",
  },
  {
    id: "anime-frieren-effort",
    text: "拼死积攒下来的东西，是绝对不会背叛自己的。",
    work: "葬送的芙莉莲",
    category: "anime",
  },
  {
    id: "anime-frieren-fear",
    text: "会害怕并不是坏事，正是这股恐惧一路带着我走到了这里。",
    work: "葬送的芙莉莲",
    category: "anime",
  },
  {
    id: "anime-frieren-warrior",
    text: "只要是努力过的人，都是战士。",
    work: "葬送的芙莉莲",
    category: "anime",
  },
  {
    id: "anime-slamdunk-nevergiveup",
    text: "如果现在放弃的话，比赛就提前结束了。",
    work: "灌篮高手",
    category: "anime",
  },
  {
    id: "anime-yourname-meet",
    text: "无论你在世界的哪个地方，我一定会再去见你。",
    work: "你的名字。",
    category: "anime",
  },
];

export interface BloodMoonQuote {
  id: string;
  text: string;
  work: string;
  author?: string;
}

/**
 * 血月禁域专属暗黑哥特 / 诡秘文学摘录（与普通夜空语录隔离）。
 */
export const BLOOD_MOON_QUOTES: readonly BloodMoonQuote[] = [
  {
    id: "gothic-poe-raven",
    text: "我久久凝望着那片深沉的黑暗，既惊愕又恐惧，做着凡人从未敢做过的梦。",
    author: "埃德加·爱伦·坡",
    work: "乌鸦",
  },
  {
    id: "gothic-poe-dream",
    text: "我们所见的一切，以及看似存在的一切，不过是梦中之梦。",
    author: "埃德加·爱伦·坡",
    work: "梦中之梦",
  },
  {
    id: "gothic-lovecraft-fear",
    text: "人类最古老而强烈的情感是恐惧，而最古老最强烈的恐惧是对未知的恐惧。",
    author: "H.P.洛夫克拉夫特",
    work: "文学中的超自然恐怖",
  },
  {
    id: "gothic-lovecraft-cthulhu",
    text: "世间最仁慈的事，莫过于人类思维无法将一切事物串联起来。",
    author: "H.P.洛夫克拉夫特",
    work: "克苏鲁的呼唤",
  },
  {
    id: "gothic-nietzsche-abyss",
    text: "当你长久地凝视深渊，深渊也在凝视着你。",
    author: "弗里德里希·尼采",
    work: "善恶的彼岸",
  },
  {
    id: "gothic-dante-inferno",
    text: "进入此门者，当放弃一切希望。",
    author: "但丁·阿利盖里",
    work: "神曲·地狱篇",
  },
  {
    id: "gothic-eliot-dust",
    text: "我将在一把尘土中，向你展示何为恐惧。",
    author: "T.S.艾略特",
    work: "荒原",
  },
  {
    id: "gothic-macbeth-stars",
    text: "星辰啊，藏起你们的微光，别让光亮照见我幽暗的渴望。",
    author: "威廉·莎士比亚",
    work: "麦克白",
  },
  {
    id: "gothic-shelley-frankenstein",
    text: "小心吧，因为我已无所畏惧，而无所畏惧正是最可怕的力量。",
    author: "玛丽·雪莱",
    work: "弗兰肯斯坦",
  },
  {
    id: "gothic-stoker-dracula",
    text: "听啊，黑夜的孩子们，正在荒野里奏响何等凄厉的乐章。",
    author: "布莱姆·斯托克",
    work: "德古拉",
  },
  {
    id: "gothic-luxun-tomb",
    text: "于浩歌狂热之际中寒；于天上看见深渊。于一切眼中看见无所有。",
    author: "鲁迅",
    work: "野草·墓碣文",
  },
  {
    id: "gothic-luxun-shadow",
    text: "我不过一个影，要别你而沉没在黑暗里了。然而黑暗又会吞并我。",
    author: "鲁迅",
    work: "野草·影的告别",
  },
  {
    id: "gothic-lihe-owl",
    text: "百年老鸮成木魅，笑声碧火巢中起。",
    author: "李贺",
    work: "神弦曲",
  },
  {
    id: "gothic-wilde-dorian",
    text: "我们每个人的心中，都同时藏着天堂与地狱。",
    author: "奥斯卡·王尔德",
    work: "道林·格雷的画像",
  },
];

const WRAP_QUOTE_RE = /^[“"「『《]+|[”"」』》]+$/g;
const INVALID_WORK_RE = /^(网络|互联网|原创|未知|佚名|自创|无|null|none)$/i;

export function formatQuoteAttribution(
  quote: Pick<NightSkyQuote, "author" | "work">,
): string {
  const author = quote.author?.trim() ?? "";
  const work = quote.work.trim().replace(/^[《「『]+|[》」』]+$/g, "");
  if (author && work) return `—— ${author}《${work}》`;
  if (work) return `—— 《${work}》`;
  if (author) return `—— ${author}`;
  return "";
}

/**
 * 洗牌袋：每轮 Fisher-Yates 洗牌，确保连续切换走完一轮绝不重复，
 * 且新一轮首句自动避开上一句。
 */
export function createQuoteBag<T extends { id: string } = NightSkyQuote>(
  quotes: readonly T[] = NIGHT_SKY_QUOTES as unknown as readonly T[],
  rng: () => number = Math.random,
) {
  let queue: T[] = [];

  const refill = (excludeId?: string) => {
    const copy = [...quotes];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    if (excludeId && copy.length > 1 && copy[0].id === excludeId) {
      const swapIdx = 1 + Math.floor(rng() * (copy.length - 1));
      const tmp = copy[0];
      copy[0] = copy[swapIdx];
      copy[swapIdx] = tmp;
    }
    queue = copy;
  };

  return {
    next(excludeId?: string): T {
      if (queue.length === 0) refill(excludeId);
      const picked = queue.shift()!;
      if (excludeId && picked.id === excludeId && quotes.length > 1) {
        if (queue.length === 0) refill(excludeId);
        const alt = queue.shift()!;
        queue.push(picked);
        return alt;
      }
      return picked;
    },
  };
}

/** 校验并解析一言（Hitokoto）接口响应，剔除无出处、过长或含异常格式的条目 */
export function parseHitokotoQuote(payload: unknown): NightSkyQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.hitokoto !== "string") return null;

  const text = raw.hitokoto.trim().replace(WRAP_QUOTE_RE, "").trim();
  if (text.length < 10 || text.length > 56 || /[\r\n#*<>]/.test(text)) {
    return null;
  }

  const work =
    typeof raw.from === "string"
      ? raw.from.trim().replace(/^[《「『]+|[》」』]+$/g, "").trim()
      : "";
  const author =
    typeof raw.from_who === "string" ? raw.from_who.trim() : "";

  const validWork = work && !INVALID_WORK_RE.test(work) ? work : "";
  const validAuthor = author && !INVALID_WORK_RE.test(author) ? author : "";
  if (!validWork && !validAuthor) return null;

  const idSeed =
    typeof raw.uuid === "string" && raw.uuid.trim()
      ? raw.uuid.trim()
      : typeof raw.id === "number" || typeof raw.id === "string"
        ? String(raw.id)
        : text.slice(0, 12);

  return {
    id: `online-${idSeed}`,
    text,
    work: validWork,
    author: validAuthor || undefined,
    category: "online",
  };
}
