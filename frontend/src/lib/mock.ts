import type {
  AnonAuditRecord,
  Author,
  BanRecord,
  Bot,
  BotApplication,
  BotInvocationLog,
  Category,
  Conversation,
  ModerationLog,
  Notification,
  Post,
  Report,
  Topic,
  User,
} from "@/types";

export const mockCategories: Category[] = [
  { id: 1, name: "技术交流", slug: "tech", description: "编程、架构、工具", type: "normal", topicCount: 1243 },
  { id: 2, name: "AI / Agent", slug: "ai", description: "大模型与智能体", type: "normal", topicCount: 892 },
  { id: 3, name: "开发运维", slug: "devops", description: "部署、监控、基建", type: "normal", topicCount: 456 },
  { id: 4, name: "产品设计", slug: "design", description: "产品与 UX", type: "normal", topicCount: 321 },
  { id: 5, name: "资源分享", slug: "share", description: "好物、教程、文章", type: "normal", topicCount: 789 },
  { id: 6, name: "闲聊灌水", slug: "chat", description: "随便聊聊", type: "normal", topicCount: 2105 },
  { id: 10, name: "树洞", slug: "anon-hole", description: "匿名吐槽", type: "anon", topicCount: 512 },
  { id: 11, name: "深夜串", slug: "anon-night", description: "匿名话题", type: "anon", topicCount: 203 },
  { id: 20, name: "Bot 市场", slug: "bot-market", description: "发现与使用 Bot", type: "bot", topicCount: 87 },
  { id: 21, name: "Agent 实验场", slug: "bot-lab", description: "实验性 Bot 展示", type: "bot", topicCount: 34 },
];

const users: User[] = [
  {
    id: 1,
    username: "zero",
    level: 5,
    bio: "Redup 的创始人 · 喜欢搭积木一样搭系统 · 写 Go 也写 TS",
    joinedAt: "2026-01-10T00:00:00Z",
    creditScore: 982,
    location: "杭州",
    website: "https://redup.dev",
    badges: ["创始人", "活跃贡献者", "Bot 开发者"],
    stats: { topics: 87, replies: 342, likes: 1280 },
  },
  {
    id: 2,
    username: "neo",
    level: 3,
    bio: "后端开发 · 对分布式和可观测性感兴趣",
    joinedAt: "2026-02-14T00:00:00Z",
    creditScore: 540,
    location: "上海",
    badges: ["早期用户"],
    stats: { topics: 23, replies: 178, likes: 456 },
  },
  {
    id: 3,
    username: "alice",
    level: 7,
    bio: "AI / Agent 研究 · 做过几个小而美的 Bot",
    joinedAt: "2026-01-20T00:00:00Z",
    creditScore: 1520,
    location: "北京",
    website: "https://alice.ai",
    badges: ["精华作者", "Bot 专家", "高信用用户"],
    stats: { topics: 142, replies: 890, likes: 3421 },
  },
  {
    id: 4,
    username: "lee",
    level: 2,
    bio: "前端 · 三年经验 · 正在学 Go",
    joinedAt: "2026-03-05T00:00:00Z",
    creditScore: 310,
    location: "深圳",
    badges: ["新人"],
    stats: { topics: 12, replies: 67, likes: 134 },
  },
];

const bots: Bot[] = [
  {
    id: 101,
    slug: "code-helper",
    name: "CodeHelper",
    description: "帮你 review 代码、解释片段、找 bug。支持 JS/TS/Go/Python/Rust 等主流语言，可以接受代码片段直接分析。",
    modelInfo: "Claude Sonnet 4.6",
    ownerUsername: "zero",
    callCount: 1240,
    likeCount: 321,
    tags: ["代码", "Review", "多语言"],
    status: "active",
    isFeatured: true,
    createdAt: "2026-02-15T00:00:00Z",
  },
  {
    id: 102,
    slug: "summary-bot",
    name: "SummaryBot",
    description: "长帖自动总结器。在任何帖子下 @SummaryBot 即可获得 3 段式摘要。",
    modelInfo: "GPT-4",
    ownerUsername: "alice",
    callCount: 890,
    likeCount: 201,
    tags: ["总结", "效率"],
    status: "active",
    isFeatured: true,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: 103,
    slug: "redup-assistant",
    name: "RedupAssistant",
    description: "官方助手，回答站务规则相关问题、帮助新人熟悉社区。",
    modelInfo: "Claude Sonnet 4.6",
    ownerUsername: "official",
    callCount: 3240,
    likeCount: 892,
    tags: ["官方", "站务", "新人引导"],
    status: "active",
    isOfficial: true,
    isFeatured: true,
    createdAt: "2026-01-10T00:00:00Z",
  },
  {
    id: 104,
    slug: "translate-bot",
    name: "TranslateBot",
    description: "中英日韩四语翻译，支持技术文档与口语表达。",
    modelInfo: "DeepSeek",
    ownerUsername: "neo",
    callCount: 567,
    likeCount: 134,
    tags: ["翻译", "多语言"],
    status: "active",
    createdAt: "2026-03-01T00:00:00Z",
  },
  {
    id: 105,
    slug: "debate-bot",
    name: "DebateBot",
    description: "实验性 Bot：给出任何观点，它会从反方立场提出质疑。慎用。",
    modelInfo: "Claude Opus",
    ownerUsername: "alice",
    callCount: 234,
    likeCount: 87,
    tags: ["实验", "辩论", "思维"],
    status: "active",
    createdAt: "2026-03-15T00:00:00Z",
  },
  {
    id: 106,
    slug: "doc-finder",
    name: "DocFinder",
    description: "帮你在社区和外部文档中定位技术问题的答案。",
    modelInfo: "GPT-4o",
    ownerUsername: "zero",
    callCount: 412,
    likeCount: 98,
    tags: ["搜索", "文档"],
    status: "active",
    createdAt: "2026-03-20T00:00:00Z",
  },
];

export const mockBots = bots;
export const mockUsers = users;

export function allUsers(): User[] {
  return users;
}

function userAuthor(id: number): Author {
  return { type: "user", user: users.find((u) => u.id === id)! };
}
function anonAuthor(anonId: string): Author {
  return { type: "anon", anon: { anonId } };
}
function botAuthor(id: number): Author {
  return { type: "bot", bot: bots.find((b) => b.id === id)! };
}

export const mockPosts: Post[] = [
  {
    id: 2001,
    topicId: 1001,
    floor: 2,
    content: "Webhook 外接方案更灵活，但门槛确实高。我们团队最后做了混合：官方托管 + 高级用户 Webhook。",
    author: userAuthor(2),
    likeCount: 23,
    createdAt: "2026-04-10T09:12:00Z",
  },
  {
    id: 2002,
    topicId: 1001,
    floor: 3,
    content: "推荐看看 Skill 系统这块，Bot 不能直接访问 DB 非常关键。我们踩过坑，有 Bot 试图 SQL 注入。",
    author: userAuthor(3),
    likeCount: 41,
    createdAt: "2026-04-10T10:05:00Z",
  },
  {
    id: 2003,
    topicId: 1001,
    floor: 4,
    content: "@CodeHelper 能不能帮总结下 Webhook 和托管两种方案的利弊？",
    author: userAuthor(4),
    likeCount: 8,
    createdAt: "2026-04-11T02:30:00Z",
  },
  {
    id: 2004,
    topicId: 1001,
    floor: 5,
    content: `**Webhook 外接方案**
- 优点：开放生态，支持任意语言，技术社区友好
- 缺点：用户需自行部署服务器，门槛高，调试链路长

**托管方案**
- 优点：零门槛，普通用户也能创建 Bot，平台统一审计
- 缺点：限制生态，用户自定义能力弱，平台成本高

**建议**：初期做 Webhook 打磨协议，Phase 2 补托管降门槛。这样既能吸引开发者，也能让普通用户参与。`,
    author: botAuthor(101),
    likeCount: 67,
    createdAt: "2026-04-11T02:30:15Z",
    replyTo: { floor: 4, authorName: "lee" },
  },
  {
    id: 2005,
    topicId: 1001,
    floor: 6,
    content: "Bot 回答得挺到位的。不过我觉得 HMAC 签名这块要文档写清楚，不然新手容易接错。",
    author: userAuthor(2),
    likeCount: 15,
    createdAt: "2026-04-12T08:20:00Z",
    replyTo: { floor: 5, authorName: "CodeHelper" },
  },
  {
    id: 2006,
    topicId: 1001,
    floor: 7,
    content: "同意楼上，另外 5 秒超时也太严了，复杂推理根本来不及。",
    author: anonAuthor("Anon-A31F05"),
    likeCount: 9,
    createdAt: "2026-04-12T09:44:00Z",
  },

  {
    id: 2101,
    topicId: 1002,
    floor: 2,
    content: "按业务域，100% 按业务域。按分层你最后会得到一个巨型 service/ 文件夹，全是耦合。",
    author: userAuthor(1),
    likeCount: 34,
    createdAt: "2026-04-11T14:35:00Z",
  },
  {
    id: 2102,
    topicId: 1002,
    floor: 3,
    content: "我的经验是业务域里面可以再分 handler/service/repo 三层，兼顾两者。",
    author: userAuthor(3),
    likeCount: 28,
    createdAt: "2026-04-11T15:02:00Z",
  },
  {
    id: 2103,
    topicId: 1002,
    floor: 4,
    content: "注意禁止跨包直接调 repo，只能走 service 层。不然后期拆微服务会很痛。",
    author: userAuthor(2),
    likeCount: 19,
    createdAt: "2026-04-12T09:44:00Z",
  },
];

export function getTopicById(id: number): Topic | undefined {
  return mockTopics.find((t) => t.id === id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return mockCategories.find((c) => c.slug === slug);
}

export function getBotBySlug(slug: string): Bot | undefined {
  return bots.find((b) => b.slug === slug);
}

export function getUserByUsername(username: string): User | undefined {
  return users.find((u) => u.username === username);
}

export function getTopicsByUserId(userId: number): Topic[] {
  return mockTopics.filter(
    (t) => t.author.type === "user" && t.author.user.id === userId,
  );
}

export function getPostsByUserId(userId: number): Post[] {
  return mockPosts.filter(
    (p) => p.author.type === "user" && p.author.user.id === userId,
  );
}

export function getBotsByOwner(username: string): Bot[] {
  return bots.filter((b) => b.ownerUsername === username);
}

export const mockBotApplications: BotApplication[] = [
  {
    id: 201,
    botName: "MeetingBot",
    ownerUsername: "lee",
    purpose: "把长帖讨论自动总结成会议纪要风格",
    persona: "简洁、结构化、不添加主观评论",
    modelInfo: "Claude Haiku",
    webhookUrl: "https://meetingbot.dev/redup/webhook",
    status: "pending",
    createdAt: "2026-04-11T14:20:00Z",
  },
  {
    id: 202,
    botName: "QuotePicker",
    ownerUsername: "neo",
    purpose: "从热门帖子中挑选金句，生成可分享的卡片图",
    persona: "富有文学性，偏诗意",
    modelInfo: "GPT-4o",
    webhookUrl: "https://bots.neo.io/quote",
    status: "pending",
    createdAt: "2026-04-12T03:40:00Z",
  },
  {
    id: 203,
    botName: "SpamWatcher",
    ownerUsername: "alice",
    purpose: "自动标记疑似灌水和广告内容",
    persona: "严谨、机器化语气",
    modelInfo: "DeepSeek",
    webhookUrl: "https://alice.ai/bots/spam-watcher",
    status: "pending",
    createdAt: "2026-04-12T08:10:00Z",
  },
  {
    id: 204,
    botName: "LegacyBot",
    ownerUsername: "neo",
    purpose: "旧版迁移过来的测试 Bot",
    persona: "—",
    modelInfo: "GPT-3.5",
    webhookUrl: "https://old.neo.io/bot",
    status: "rejected",
    createdAt: "2026-04-05T10:00:00Z",
    reviewNote: "模型版本过旧，建议升级到 GPT-4o 后重提",
  },
];

export const mockReports: Report[] = [
  {
    id: 301,
    reporterUsername: "zero",
    targetType: "post",
    targetId: 2003,
    targetTitle: "@ CodeHelper 能不能帮总结下…（#4 楼）",
    reason: "刷广告",
    description: "该楼层后续回复出现疑似推广链接",
    status: "pending",
    createdAt: "2026-04-12T09:20:00Z",
  },
  {
    id: 302,
    reporterUsername: "alice",
    targetType: "topic",
    targetId: 1008,
    targetTitle: "对象说分就分，没有预兆",
    reason: "人身攻击",
    description: "4 楼开始出现对楼主的嘲讽",
    status: "pending",
    createdAt: "2026-04-12T08:55:00Z",
  },
  {
    id: 303,
    reporterUsername: "lee",
    targetType: "user",
    targetId: 4,
    targetTitle: "@ unknown_user",
    reason: "冒充他人",
    status: "pending",
    createdAt: "2026-04-11T23:30:00Z",
  },
  {
    id: 304,
    reporterUsername: "neo",
    targetType: "bot",
    targetId: 105,
    targetTitle: "DebateBot",
    reason: "回复过度冒犯",
    description: "在 AI 讨论帖中与用户发生明显对立",
    status: "resolved",
    createdAt: "2026-04-11T16:12:00Z",
    handledBy: "zero",
  },
  {
    id: 305,
    reporterUsername: "alice",
    targetType: "post",
    targetId: 2105,
    targetTitle: "Go 项目结构讨论（#2 楼）",
    reason: "无关内容",
    status: "dismissed",
    createdAt: "2026-04-10T20:00:00Z",
    handledBy: "zero",
  },
];

export const mockModerationLogs: ModerationLog[] = [
  {
    id: 401,
    operator: "zero",
    action: "处理举报",
    targetType: "report",
    targetId: 304,
    targetLabel: "DebateBot 举报",
    reason: "已向 Bot 作者发送警告",
    createdAt: "2026-04-12T07:10:00Z",
  },
  {
    id: 402,
    operator: "alice",
    action: "锁定帖子",
    targetType: "topic",
    targetId: 1008,
    targetLabel: "对象说分就分…",
    reason: "评论区情绪失控",
    createdAt: "2026-04-12T09:05:00Z",
  },
  {
    id: 403,
    operator: "zero",
    action: "封禁用户",
    targetType: "user",
    targetId: 99,
    targetLabel: "spam_bot_user",
    reason: "批量发广告",
    createdAt: "2026-04-11T19:30:00Z",
  },
  {
    id: 404,
    operator: "zero",
    action: "Bot 申请通过",
    targetType: "bot_application",
    targetId: 199,
    targetLabel: "TranslateBot",
    createdAt: "2026-04-10T10:40:00Z",
  },
  {
    id: 405,
    operator: "alice",
    action: "精华帖标记",
    targetType: "topic",
    targetId: 1001,
    targetLabel: "有没有人试过把 Claude 4.6 接入…",
    createdAt: "2026-04-10T08:40:00Z",
  },
  {
    id: 406,
    operator: "zero",
    action: "驳回举报",
    targetType: "report",
    targetId: 305,
    targetLabel: "Go 项目结构讨论举报",
    reason: "判断为正常讨论",
    createdAt: "2026-04-10T20:05:00Z",
  },
];

export const mockBanRecords: BanRecord[] = [
  {
    id: 501,
    username: "spam_bot_user",
    reason: "批量发广告",
    bannedBy: "zero",
    expiresAt: undefined,
    createdAt: "2026-04-11T19:30:00Z",
  },
  {
    id: 502,
    username: "rage_poster",
    reason: "重复人身攻击",
    bannedBy: "alice",
    expiresAt: "2026-04-19T00:00:00Z",
    createdAt: "2026-04-12T09:00:00Z",
  },
];

export const mockBotInvocationLogs: BotInvocationLog[] = [
  {
    id: 601,
    botName: "CodeHelper",
    botSlug: "code-helper",
    triggerUser: "lee",
    topicId: 1001,
    topicTitle: "有没有人试过把 Claude 4.6 接入自己的论坛当 Bot？",
    postFloor: 5,
    status: "success",
    latencyMs: 1820,
    createdAt: "2026-04-11T02:30:15Z",
    requestSummary: "总结 Webhook 与托管两种方案的利弊",
    responseSummary: "输出了结构化的利弊对比（长度 482 字符）",
  },
  {
    id: 602,
    botName: "SummaryBot",
    botSlug: "summary-bot",
    triggerUser: "zero",
    topicId: 1006,
    topicTitle: "你们工位都放什么奇怪的小玩意？",
    postFloor: 84,
    status: "success",
    latencyMs: 2140,
    createdAt: "2026-04-12T06:30:00Z",
    requestSummary: "总结当前 112 条回复",
    responseSummary: "生成 3 段式摘要（长度 361 字符）",
  },
  {
    id: 603,
    botName: "DebateBot",
    botSlug: "debate-bot",
    triggerUser: "alice",
    topicId: 1005,
    topicTitle: "LangGraph vs 自己手写 Agent 循环…",
    postFloor: 12,
    status: "timeout",
    latencyMs: 5001,
    createdAt: "2026-04-11T16:45:00Z",
    requestSummary: "站在 LangGraph 反方提出质疑",
    errorMessage: "Webhook 超时，上游未在 5 秒内响应",
  },
  {
    id: 604,
    botName: "TranslateBot",
    botSlug: "translate-bot",
    triggerUser: "neo",
    topicId: 1002,
    topicTitle: "Go 模块化单体项目结构怎么组织最清爽？",
    postFloor: 4,
    status: "success",
    latencyMs: 980,
    createdAt: "2026-04-12T09:10:00Z",
    requestSummary: "翻译楼主问题为英文",
    responseSummary: "返回英文翻译（长度 124 字符）",
  },
  {
    id: 605,
    botName: "DocFinder",
    botSlug: "doc-finder",
    triggerUser: "zero",
    topicId: 1001,
    topicTitle: "有没有人试过把 Claude 4.6 接入自己的论坛当 Bot？",
    postFloor: 9,
    status: "error",
    latencyMs: 320,
    createdAt: "2026-04-12T07:55:00Z",
    requestSummary: "定位 HMAC 签名相关官方文档",
    errorMessage: "HTTP 500: upstream returned invalid JSON",
  },
  {
    id: 606,
    botName: "DebateBot",
    botSlug: "debate-bot",
    triggerUser: "lee",
    topicId: 1005,
    topicTitle: "LangGraph vs 自己手写 Agent 循环…",
    postFloor: 15,
    status: "blocked",
    latencyMs: 0,
    createdAt: "2026-04-12T08:30:00Z",
    requestSummary: "—",
    errorMessage: "Bot 调用频率超限（每小时 10 次）",
  },
];

export const mockAnonAuditRecords: AnonAuditRecord[] = [
  {
    anonId: "Anon-8F3A2C",
    realUsername: "lee",
    topicId: 1003,
    topicTitle: "公司又开始强制周报了，心态崩了",
    postCount: 1,
    firstSeen: "2026-04-11T22:05:00Z",
    lastSeen: "2026-04-11T22:05:00Z",
  },
  {
    anonId: "Anon-C21E09",
    realUsername: "alice",
    topicId: 1007,
    topicTitle: "凌晨三点还睡不着的人有多少",
    postCount: 1,
    firstSeen: "2026-04-12T03:15:00Z",
    lastSeen: "2026-04-12T03:15:00Z",
  },
  {
    anonId: "Anon-7D01BB",
    realUsername: "neo",
    topicId: 1008,
    topicTitle: "对象说分就分，没有预兆",
    postCount: 3,
    firstSeen: "2026-04-11T23:45:00Z",
    lastSeen: "2026-04-12T08:20:00Z",
  },
  {
    anonId: "Anon-B49F22",
    realUsername: "lee",
    topicId: 1009,
    topicTitle: "被裁员一个月了，还没告诉家里",
    postCount: 1,
    firstSeen: "2026-04-12T07:20:00Z",
    lastSeen: "2026-04-12T07:20:00Z",
  },
  {
    anonId: "Anon-3E88F1",
    realUsername: "zero",
    topicId: 1010,
    topicTitle: "有人懂那种深夜突然想哭的感觉吗",
    postCount: 1,
    firstSeen: "2026-04-12T02:30:00Z",
    lastSeen: "2026-04-12T02:30:00Z",
  },
  {
    anonId: "Anon-A31F05",
    realUsername: "neo",
    topicId: 1001,
    topicTitle: "有没有人试过把 Claude 4.6 接入自己的论坛当 Bot？",
    postCount: 1,
    firstSeen: "2026-04-12T09:44:00Z",
    lastSeen: "2026-04-12T09:44:00Z",
  },
];

export const mockConversations: Conversation[] = [
  {
    id: 1,
    participant: { type: "user", username: "alice", level: 7 },
    lastMessage: "那我们先按 Webhook 外接方案推进，下周对齐一下 Skill 清单",
    lastMessageAt: "2026-04-13T09:42:00Z",
    unreadCount: 2,
    messages: [
      {
        id: 101,
        conversationId: 1,
        fromSelf: false,
        content: "看了你写的 Bot Gateway 文档，有几个点想聊一下",
        createdAt: "2026-04-13T08:50:00Z",
      },
      {
        id: 102,
        conversationId: 1,
        fromSelf: true,
        content: "来，哪几个点？",
        createdAt: "2026-04-13T08:52:00Z",
      },
      {
        id: 103,
        conversationId: 1,
        fromSelf: false,
        content: "1. 5 秒超时对复杂推理太严，能不能按 Bot 类型分级",
        createdAt: "2026-04-13T08:53:30Z",
      },
      {
        id: 104,
        conversationId: 1,
        fromSelf: false,
        content: "2. HMAC 签名的 key 轮换流程现在还没有文档",
        createdAt: "2026-04-13T08:53:45Z",
      },
      {
        id: 105,
        conversationId: 1,
        fromSelf: true,
        content: "第一个点同意，但分级要谨慎，不然整个 Gateway 的延迟 SLA 就没法保证了。可以先做官方高信用 Bot 的白名单放宽到 10s。",
        createdAt: "2026-04-13T09:00:00Z",
      },
      {
        id: 106,
        conversationId: 1,
        fromSelf: true,
        content: "第二个点我这周补文档，大致思路是双 key 并存期 7 天，老 key 先降级，再删除。",
        createdAt: "2026-04-13T09:01:00Z",
      },
      {
        id: 107,
        conversationId: 1,
        fromSelf: false,
        content: "好，等你文档",
        createdAt: "2026-04-13T09:40:00Z",
      },
      {
        id: 108,
        conversationId: 1,
        fromSelf: false,
        content: "那我们先按 Webhook 外接方案推进，下周对齐一下 Skill 清单",
        createdAt: "2026-04-13T09:42:00Z",
      },
    ],
  },
  {
    id: 2,
    participant: {
      type: "bot",
      slug: "code-helper",
      name: "CodeHelper",
      modelInfo: "Claude Sonnet 4.6",
    },
    lastMessage: "已将你的偏好记录，后续在帖子里被召唤时会使用这些设置。",
    lastMessageAt: "2026-04-13T06:15:00Z",
    unreadCount: 0,
    messages: [
      {
        id: 201,
        conversationId: 2,
        fromSelf: true,
        content: "你以后在我的帖子里回复的时候，能不能默认带上 TypeScript 类型声明？",
        createdAt: "2026-04-13T06:10:00Z",
      },
      {
        id: 202,
        conversationId: 2,
        fromSelf: false,
        content: "好的。当帖子语境是 JS/TS 相关时，我会默认展示带类型的示例代码。其他语言保持现状。",
        createdAt: "2026-04-13T06:12:30Z",
      },
      {
        id: 203,
        conversationId: 2,
        fromSelf: false,
        content: "已将你的偏好记录，后续在帖子里被召唤时会使用这些设置。",
        createdAt: "2026-04-13T06:15:00Z",
      },
    ],
  },
  {
    id: 3,
    participant: { type: "user", username: "neo", level: 3 },
    lastMessage: "周末一起对个 demo？",
    lastMessageAt: "2026-04-12T21:30:00Z",
    unreadCount: 1,
    messages: [
      {
        id: 301,
        conversationId: 3,
        fromSelf: true,
        content: "你那个 Go 项目最后是按业务域还是分层拆的？",
        createdAt: "2026-04-12T20:55:00Z",
      },
      {
        id: 302,
        conversationId: 3,
        fromSelf: false,
        content: "按业务域，内部再分 handler/service/repo。跟帖子里那个思路一致",
        createdAt: "2026-04-12T21:20:00Z",
      },
      {
        id: 303,
        conversationId: 3,
        fromSelf: false,
        content: "周末一起对个 demo？",
        createdAt: "2026-04-12T21:30:00Z",
      },
    ],
  },
  {
    id: 4,
    participant: { type: "user", username: "lee", level: 2 },
    lastMessage: "谢谢！我先按你的建议试试。",
    lastMessageAt: "2026-04-12T15:40:00Z",
    unreadCount: 0,
    messages: [
      {
        id: 401,
        conversationId: 4,
        fromSelf: false,
        content: "Redup 的 Bot Webhook 有没有什么快速上手的例子？",
        createdAt: "2026-04-12T15:20:00Z",
      },
      {
        id: 402,
        conversationId: 4,
        fromSelf: true,
        content: "有的，最简的是一个返回固定 reply 的 JSON 接口就行。我这周补一个 Hello World 的仓库你可以 fork。",
        createdAt: "2026-04-12T15:35:00Z",
      },
      {
        id: 403,
        conversationId: 4,
        fromSelf: false,
        content: "谢谢！我先按你的建议试试。",
        createdAt: "2026-04-12T15:40:00Z",
      },
    ],
  },
  {
    id: 5,
    participant: { type: "system", name: "Redup 团队" },
    lastMessage: "欢迎来到 Redup。你的账号已通过初始认证，可以开始创建 Bot 了。",
    lastMessageAt: "2026-04-10T10:00:00Z",
    unreadCount: 0,
    messages: [
      {
        id: 501,
        conversationId: 5,
        fromSelf: false,
        content: "欢迎来到 Redup。你的账号已通过初始认证，可以开始创建 Bot 了。",
        createdAt: "2026-04-10T10:00:00Z",
      },
      {
        id: 502,
        conversationId: 5,
        fromSelf: false,
        content: "以下资源可能对你有帮助：\n· 社区规则：/topic/1000\n· Bot 开发指南：/bot 区\n· 匿名区使用说明：/anon",
        createdAt: "2026-04-10T10:00:10Z",
      },
    ],
  },
];

export function getConversationById(id: number): Conversation | undefined {
  return mockConversations.find((c) => c.id === id);
}

export const mockNotifications: Notification[] = [
  {
    id: 1,
    type: "reply",
    read: false,
    actor: userAuthor(3),
    text: "回复了你的帖子",
    preview: "同意楼上，另外 5 秒超时也太严了，复杂推理根本来不及。",
    href: "/topic/1001#floor-7",
    createdAt: "2026-04-12T09:44:00Z",
  },
  {
    id: 2,
    type: "mention",
    read: false,
    actor: userAuthor(4),
    text: "在帖子里 @ 了你",
    preview: "@zero 这个 Bot Gateway 的熔断策略是怎么设计的？",
    href: "/topic/1001#floor-8",
    createdAt: "2026-04-12T08:55:00Z",
  },
  {
    id: 3,
    type: "bot_reply",
    read: false,
    actor: botAuthor(101),
    text: "Bot CodeHelper 回复了你",
    preview: "**Webhook 外接方案的建议**：初期做 Webhook 打磨协议，Phase 2 补托管降门槛…",
    href: "/topic/1001#floor-5",
    createdAt: "2026-04-12T02:30:15Z",
  },
  {
    id: 4,
    type: "like",
    read: false,
    actor: userAuthor(2),
    text: "点赞了你的回复",
    preview: "Go 模块化单体项目结构怎么组织最清爽？",
    href: "/topic/1002#floor-2",
    createdAt: "2026-04-12T01:20:00Z",
  },
  {
    id: 5,
    type: "follow",
    read: true,
    actor: userAuthor(3),
    text: "关注了你",
    href: "/u/alice",
    createdAt: "2026-04-11T22:10:00Z",
  },
  {
    id: 6,
    type: "reply",
    read: true,
    actor: userAuthor(2),
    text: "回复了你的帖子",
    preview: "按业务域，100% 按业务域。按分层你最后会得到一个巨型 service/ 文件夹…",
    href: "/topic/1002#floor-2",
    createdAt: "2026-04-11T14:35:00Z",
  },
  {
    id: 7,
    type: "system",
    read: true,
    actor: null,
    text: "Redup 官方公告",
    preview: "欢迎来到 Redup。阅读社区规则和匿名区使用指引以开始你的旅程。",
    href: "/topic/1000",
    createdAt: "2026-04-10T10:00:00Z",
  },
  {
    id: 8,
    type: "like",
    read: true,
    actor: userAuthor(4),
    text: "点赞了你的帖子",
    preview: "有没有人试过把 Claude 4.6 接入自己的论坛当 Bot？",
    href: "/topic/1001",
    createdAt: "2026-04-10T18:20:00Z",
  },
];

export function getTopicsByCategorySlug(slug: string): Topic[] {
  return mockTopics.filter((t) => t.categorySlug === slug);
}

export function getPostsByTopicId(topicId: number): Post[] {
  return mockPosts.filter((p) => p.topicId === topicId).sort((a, b) => a.floor - b.floor);
}

export const mockTopics: Topic[] = [
  {
    id: 1001,
    categoryId: 2,
    categorySlug: "ai",
    title: "有没有人试过把 Claude 4.6 接入自己的论坛当 Bot？",
    excerpt: "最近在做一个支持 AI Bot 的社区，想听听大家的接入方案，Webhook 还是托管？",
    body: `最近在做一个支持 AI Bot 的社区，想听听大家的接入方案。

我目前的思路是：
1. 平台只做 Bot Gateway（限流 / 超时 / 熔断 / HMAC 签名）
2. Bot 通过 Webhook 外接，用户自己部署
3. 所有数据访问通过 Skill 系统受控

这样做的好处是开放生态，但对普通用户门槛较高。考虑在 Phase 2 加一个轻量托管选项。

你们的看法呢？Webhook 纯外接 vs 托管 vs 混合？`,
    author: { type: "user", user: users[0] },
    replyCount: 42,
    likeCount: 128,
    viewCount: 2103,
    createdAt: "2026-04-10T08:30:00Z",
    lastPostAt: "2026-04-12T10:12:00Z",
    pinLevel: 1,
    tags: ["AI", "Bot", "架构"],
  },
  {
    id: 1002,
    categoryId: 1,
    categorySlug: "tech",
    title: "Go 模块化单体项目结构怎么组织最清爽？",
    excerpt: "internal/ 下面按业务域拆包，还是按层拆？",
    body: `最近在搭 Go 项目骨架，纠结 internal/ 怎么组织。

**按业务域（DDD 风）：**
\`\`\`
internal/
  user/
  forum/
  bot/
\`\`\`

**按分层：**
\`\`\`
internal/
  handler/
  service/
  repository/
\`\`\`

有经验的朋友说下哪种扩展性更好？`,
    author: { type: "user", user: users[1] },
    replyCount: 28,
    likeCount: 76,
    viewCount: 982,
    createdAt: "2026-04-11T14:20:00Z",
    lastPostAt: "2026-04-12T09:44:00Z",
    tags: ["Go", "架构"],
  },
  {
    id: 1003,
    categoryId: 10,
    categorySlug: "anon-hole",
    title: "公司又开始强制周报了，心态崩了",
    excerpt: "每周五晚上都要加班写周报，写完还要发群里念…",
    author: { type: "anon", anon: { anonId: "Anon-8F3A2C" } },
    replyCount: 67,
    likeCount: 203,
    viewCount: 3421,
    createdAt: "2026-04-11T22:05:00Z",
    lastPostAt: "2026-04-12T08:10:00Z",
    tags: ["职场"],
  },
  {
    id: 1004,
    categoryId: 20,
    categorySlug: "bot-market",
    title: "[Bot] CodeHelper — 代码 review 与解释",
    excerpt: "在任何技术帖里 @CodeHelper 即可召唤，支持多语言。",
    author: { type: "bot", bot: bots[0] },
    replyCount: 15,
    likeCount: 89,
    viewCount: 612,
    createdAt: "2026-04-09T11:00:00Z",
    lastPostAt: "2026-04-12T07:30:00Z",
    isFeatured: true,
    tags: ["Bot"],
  },
  {
    id: 1005,
    categoryId: 2,
    categorySlug: "ai",
    title: "LangGraph vs 自己手写 Agent 循环，哪个更适合生产环境？",
    excerpt: "踩了一堆坑后，想听听大家的真实体验。",
    author: { type: "user", user: users[2] },
    replyCount: 31,
    likeCount: 54,
    viewCount: 721,
    createdAt: "2026-04-11T16:40:00Z",
    lastPostAt: "2026-04-12T06:22:00Z",
    tags: ["AI", "Agent"],
  },
  {
    id: 1006,
    categoryId: 6,
    categorySlug: "chat",
    title: "你们工位都放什么奇怪的小玩意？",
    excerpt: "我工位上有一只会眨眼的塑料青蛙。",
    author: { type: "user", user: users[3] },
    replyCount: 112,
    likeCount: 245,
    viewCount: 4310,
    createdAt: "2026-04-11T20:10:00Z",
    lastPostAt: "2026-04-12T10:01:00Z",
    tags: ["闲聊"],
  },
  {
    id: 1007,
    categoryId: 11,
    categorySlug: "anon-night",
    title: "凌晨三点还睡不着的人有多少",
    excerpt: "最近压力大，每天都要到三四点才能睡着…",
    author: { type: "anon", anon: { anonId: "Anon-C21E09" } },
    replyCount: 88,
    likeCount: 301,
    viewCount: 2890,
    createdAt: "2026-04-12T03:15:00Z",
    lastPostAt: "2026-04-12T09:55:00Z",
    tags: ["情绪"],
  },
  {
    id: 1008,
    categoryId: 10,
    categorySlug: "anon-hole",
    title: "对象说分就分，没有预兆",
    excerpt: "连争吵都没有，只发了一条消息说不合适。五年了。",
    author: { type: "anon", anon: { anonId: "Anon-7D01BB" } },
    replyCount: 134,
    likeCount: 412,
    viewCount: 5203,
    createdAt: "2026-04-11T23:45:00Z",
    lastPostAt: "2026-04-12T10:02:00Z",
    tags: ["感情"],
  },
  {
    id: 1009,
    categoryId: 10,
    categorySlug: "anon-hole",
    title: "被裁员一个月了，还没告诉家里",
    excerpt: "每天假装去上班，在咖啡馆投简历。怕父母担心。",
    author: { type: "anon", anon: { anonId: "Anon-B49F22" } },
    replyCount: 78,
    likeCount: 289,
    viewCount: 3410,
    createdAt: "2026-04-12T07:20:00Z",
    lastPostAt: "2026-04-12T09:58:00Z",
    tags: ["职场"],
  },
  {
    id: 1010,
    categoryId: 11,
    categorySlug: "anon-night",
    title: "有人懂那种深夜突然想哭的感觉吗",
    excerpt: "说不上什么原因，就是突然。白天一切都正常。",
    author: { type: "anon", anon: { anonId: "Anon-3E88F1" } },
    replyCount: 56,
    likeCount: 198,
    viewCount: 1820,
    createdAt: "2026-04-12T02:30:00Z",
    lastPostAt: "2026-04-12T08:40:00Z",
    tags: ["情绪"],
  },
];
