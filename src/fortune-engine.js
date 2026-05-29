import { calculateSaju } from "@orrery/core/saju";
import {
  analyzePillarRelations,
  getFourPillars,
  getGongmang,
  getJeonggi,
  getRelation,
  getTwelveMeteor,
  getTwelveSpirit,
} from "@orrery/core/pillars";
import { BRANCH_ELEMENT, STEM_INFO } from "@orrery/core/constants";
import { filterCities, formatCityName } from "@orrery/core/cities";
import { ZODIAC_KO, calculateNatal } from "@orrery/core/natal";
import { calculateLiunian, createChart } from "@orrery/core/ziwei";

const NATAL_PILLAR_NAMES = ["hour", "day", "month", "year"];
const RELATION_PRIORITY = ["沖", "刑", "破", "害", "合", "半合", "三合", "方合"];
const NATAL_PILLAR_PRIORITY = { day: 0, month: 1, hour: 2, year: 3 };
const CHANNEL_PRIORITY = { branch: 0, stem: 1 };
const MAX_BIRTHPLACE_RESULTS = 12;

const CITY_ALIASES = [
  ["Seoul", "서울"],
  ["Busan", "부산"],
  ["Incheon", "인천"],
  ["Daegu", "대구"],
  ["Daejeon", "대전"],
  ["Gwangju", "광주"],
  ["Ulsan", "울산"],
  ["Jeju", "제주"],
  ["Tokyo", "도쿄"],
  ["Osaka", "오사카"],
  ["Kyoto", "교토"],
  ["Fukuoka", "후쿠오카"],
  ["Sapporo", "삿포로"],
  ["Nagoya", "나고야"],
  ["Beijing", "베이징"],
  ["Shanghai", "상하이"],
  ["Hong Kong", "홍콩"],
  ["Taipei", "타이베이"],
  ["Singapore", "싱가포르"],
  ["Bangkok", "방콕"],
];

const COPY = {
  en: {
    title: "Daily fortune",
    natalTitle: "Natal summary",
    unknownTimeNote: "Birth time is unknown, so angles and houses are not shown.",
    natalLabels: {
      saju: "Four pillars",
      place: "Place",
      angles: "Angles",
      planets: "Planets",
      aspect: "Aspect",
      note: "Note",
    },
    sajuPillars: {
      year: "Y",
      month: "M",
      day: "D",
      hour: "H",
    },
    planets: {
      Sun: "Sun",
      Moon: "Moon",
      Mercury: "Mercury",
      Venus: "Venus",
      Mars: "Mars",
      Jupiter: "Jupiter",
      Saturn: "Saturn",
      Uranus: "Uranus",
      Neptune: "Neptune",
      Pluto: "Pluto",
    },
    aspects: {
      conjunction: "conjunct",
      sextile: "sextile",
      square: "square",
      trine: "trine",
      opposition: "opposite",
    },
    detailLabels: {
      flow: "Flow",
      action: "Action",
      care: "Care",
    },
    pillarFocus: {
      hour: "This signal touches execution rhythm first.",
      day: "This signal touches personal pace first.",
      month: "This signal touches work structure first.",
      year: "This signal touches outside expectations first.",
    },
    secondarySignal: "A secondary {relation} signal is also present, so keep the scope explicit.",
    relationNames: {
      合: "alignment",
      半合: "partial connection",
      三合: "momentum",
      方合: "structure",
      沖: "friction",
      刑: "review",
      破: "buffer",
      害: "clarity",
    },
    ziwei: {
      flow: "The Ziwei layer adds a monthly focus on {monthlyFocus}, with the longer cycle around {longFocus}.",
      action: "Use the {positiveTone} around {positiveFocus}, and put a guardrail around the {cautionTone} near {cautionFocus}.",
      care: "Use this as a background signal, not a reason to override the task evidence.",
      unknownTimeCare: "Birth time is unknown, so read the Ziwei layer lightly.",
      palaceDomains: {
        命宮: "personal pace",
        兄弟: "shared resources",
        夫妻: "agreements",
        子女: "outputs and experiments",
        財帛: "value and resources",
        疾厄: "recovery and load",
        遷移: "external context",
        交友: "collaboration",
        官祿: "work direction",
        田宅: "base and environment",
        福德: "mental space",
        父母: "support and constraints",
      },
      sihuaTones: {
        化祿: "ease",
        化權: "decision pressure",
        化科: "credibility",
        化忌: "friction",
      },
    },
    auxiliary: {
      tenGodHeadline: {
        比肩: "Set your own baseline today",
        劫財: "Separate roles before pressure spreads",
        食神: "Ship the light first version",
        傷官: "Refine the message before sending",
        偏財: "Handle outside variables in small steps",
        正財: "Tidy the practical boundaries",
        偏官: "Put guardrails around pressure",
        正官: "Confirm the rule before acting",
        偏印: "Sort the unusual clue",
        正印: "Lean on the stable reference",
        本元: "Return to your own baseline",
      },
      tenGodFocus: {
        比肩: "Keep ownership clear before matching someone else's pace.",
        劫財: "Shared pressure can rise, so separate your role from the group current.",
        食神: "Output comes easier when the first version stays light.",
        傷官: "Expression and revision are sensitive; polish the wording before pushing it out.",
        偏財: "External opportunities move quickly, so keep decisions small and concrete.",
        正財: "Practical resources and deadlines benefit from tidy boundaries.",
        偏官: "Pressure can sharpen action, but set a guardrail before committing.",
        正官: "Standards and responsibility are emphasized; confirm the rule before execution.",
        偏印: "Research and unusual clues help, but capture the conclusion before wandering.",
        正印: "Support, documentation, and stable references are worth leaning on.",
        本元: "Return to your own baseline before responding to outside signals.",
      },
      meteorFocus: {
        長生: "Start the new thread small enough to keep it alive.",
        沐浴: "Feedback and exposure are more visible, so clean up the surface first.",
        冠帶: "Format and responsibility matter; check the submission standard.",
        乾祿: "Capacity is usable when the task boundary is clear.",
        帝旺: "Momentum is high, so avoid expanding beyond the useful scope.",
        衰: "Reduce the load before adding another branch.",
        病: "A small health check on the plan prevents drag later.",
        死: "Close the old loop before treating the next thing as new.",
        墓: "Archive, collect, and sort before making the final call.",
        絶: "Reset the frame instead of patching every old assumption.",
        胎: "Let the idea incubate before making it public.",
        養: "Support and preparation matter more than speed.",
      },
      spiritFocus: {
        劫殺: "Cut through the noisy part and protect the key decision.",
        災殺: "Leave a small contingency before assuming the route is clear.",
        天殺: "External constraints can shape the day, so avoid overpromising.",
        地殺: "Movement and logistics need a clearer handoff.",
        年殺: "Visibility is higher than usual, so keep the signal clean.",
        月殺: "A recurring pattern is worth naming before it repeats.",
        亡身: "Details can slip under speed, so check the trace before closing.",
        將星: "Leadership energy is useful when the direction is explicit.",
        攀鞍: "Use the support path instead of carrying everything alone.",
        驛馬: "Movement is likely; capture decisions before switching context.",
        六害: "Hidden mismatch can grow, so clarify assumptions early.",
        華蓋: "Deep work and reflection fit better than broad exposure.",
      },
      elementFocus: {
        tree: "Planning and growth signals are active, so write the next sequence.",
        fire: "Communication and feedback signals are active, so make the key point visible.",
        earth: "Stability and grounding signals are active, so check the base first.",
        metal: "Decision and cleanup signals are active, so trim one loose option.",
        water: "Research and synthesis signals are active, so decide where the search stops.",
      },
      gongmangFocus: "The branch is in a void pair, so leave extra room before treating the signal as final.",
    },
    neutralHeadline: "Steady progress works best",
    neutralBody: "Keep one clear priority and let consistency do the work.",
    neutralVariants: [
      {
        headline: "Steady progress works best",
        body: "Keep one clear priority and let consistency do the work.",
      },
      {
        headline: "A simple rhythm fits best",
        body: "Use a clear first step and avoid making the plan heavier than it needs to be.",
      },
      {
        headline: "Consistency carries the day",
        body: "Small completions will matter more than a dramatic shift in direction.",
      },
    ],
    neutralDetails: {
      flow: "A calm, regular pace is more useful than a dramatic shift.",
      action: "Choose one task that makes the rest easier and finish it first.",
      care: "Do not split attention across too many small requests.",
    },
    fallbackHeadline: "Read the day lightly",
    fallbackBody: "Notice small signals, keep the plan simple, and adjust without overthinking.",
    relations: {
      合: ["Ideas align well today", "Use the flow to bring loose threads together."],
      半合: ["Scattered ideas can connect", "Pick one thread and finish it before switching context."],
      三合: ["Related work gains momentum", "Group similar tasks and avoid unnecessary context switching."],
      方合: ["Structure supports progress", "Follow the existing plan and make steady improvements."],
      沖: ["Keep decisions small today", "Expect friction or sudden changes; choose reversible steps."],
      刑: ["Review before you commit", "Avoid forcing outcomes and check details one more time."],
      破: ["Leave room for buffer", "Small plans may break; protect your schedule with extra margin."],
      害: ["Clarify things early", "Quiet friction can build up, so make expectations explicit."],
    },
    relationVariants: {
      合: [
        { headline: "Ideas align well today", body: "Use the flow to bring loose threads together." },
        { headline: "Shared context comes together", body: "A short alignment step can turn scattered notes into a clear decision." },
        { headline: "Connections are easier to make", body: "Pair related conversations and close one open loop." },
      ],
      半合: [
        { headline: "Scattered ideas can connect", body: "Pick one thread and finish it before switching context." },
        { headline: "A partial link is enough to start", body: "Treat the useful clue as a draft, then shape it into one next action." },
        { headline: "Loose signals can become useful", body: "Keep the frame narrow so the connection does not spread too wide." },
      ],
      三合: [
        { headline: "Related work gains momentum", body: "Group similar tasks and avoid unnecessary context switching." },
        { headline: "Momentum builds through batching", body: "Move through related items together before opening a new lane." },
        { headline: "One theme can carry several tasks", body: "Use the shared direction to finish more with less switching." },
      ],
      方合: [
        { headline: "Structure supports progress", body: "Follow the existing plan and make steady improvements." },
        { headline: "Routine gives the day shape", body: "Use a known process and refine one weak edge." },
        { headline: "A clear frame helps decisions", body: "Keep the order visible and move through it without adding extra process." },
      ],
      沖: [
        { headline: "Keep decisions small today", body: "Expect friction or sudden changes; choose reversible steps." },
        { headline: "Leave room for a turn", body: "Opposing signals can show up, so avoid locking the plan too early." },
        { headline: "Move in smaller commitments", body: "Test the next step before promising the whole direction." },
      ],
      刑: [
        { headline: "Review before you commit", body: "Avoid forcing outcomes and check details one more time." },
        { headline: "Pressure makes details louder", body: "Slow the final decision enough to verify the assumption behind it." },
        { headline: "The last check matters", body: "A small review pass can prevent avoidable rework later." },
      ],
      破: [
        { headline: "Leave room for buffer", body: "Small plans may break; protect your schedule with extra margin." },
        { headline: "Protect the important block", body: "Use buffer time around fragile work and avoid stacking tight promises." },
        { headline: "Plans need extra slack", body: "Treat interruptions as likely and keep one fallback path ready." },
      ],
      害: [
        { headline: "Clarify things early", body: "Quiet friction can build up, so make expectations explicit." },
        { headline: "Name the hidden mismatch", body: "A quick clarification can prevent a small gap from becoming work later." },
        { headline: "Check shared assumptions", body: "Do not rely on implied agreement when the next step needs precision." },
      ],
    },
    relationDetails: {
      合: {
        flow: "Collaboration and shared context are easier to align.",
        action: "Bring related notes, tasks, or conversations into one clear decision.",
        care: "Agreement can feel easy, so still write down the exact next step.",
      },
      半合: {
        flow: "Partial connections are useful, but they need a clear frame.",
        action: "Pick one promising thread and turn it into a concrete task.",
        care: "Avoid jumping between ideas before the first one has shape.",
      },
      三合: {
        flow: "Related work can build momentum when grouped together.",
        action: "Batch similar items and move through them in one session.",
        care: "Keep the scope visible so momentum does not become overcommitment.",
      },
      方合: {
        flow: "Structure and routine support the day.",
        action: "Follow the existing plan and improve one weak edge.",
        care: "Do not add process for its own sake.",
      },
      沖: {
        flow: "The day can bring opposing signals or sudden changes.",
        action: "Use smaller decisions and keep each step reversible.",
        care: "Leave room before making promises that are hard to move.",
      },
      刑: {
        flow: "Pressure can make details feel tighter than usual.",
        action: "Review assumptions before committing to a direction.",
        care: "Avoid forcing an answer when the evidence is still thin.",
      },
      破: {
        flow: "Small disruptions can break the original plan.",
        action: "Protect the important work with buffer time.",
        care: "Treat schedule changes as signals, not failures.",
      },
      害: {
        flow: "Quiet friction is easier to miss early in the day.",
        action: "Make expectations explicit before work spreads out.",
        care: "Do not rely on implied agreement.",
      },
    },
    elementFlows: {
      tree: ["Planning can grow today", "Shape one rough idea into a clear next step."],
      fire: ["Expression has momentum today", "Share the point early and keep the feedback loop short."],
      earth: ["Groundwork matters today", "Stabilize the basics before adding anything new."],
      metal: ["Cleanup and decisions fit today", "Trim loose options and make the next action precise."],
      water: ["Research flows more easily today", "Follow useful clues, then capture the result before moving on."],
    },
    elementVariants: {
      tree: [
        { headline: "Planning can grow today", body: "Shape one rough idea into a clear next step." },
        { headline: "Ideas need a visible path", body: "Write the sequence before expanding the scope." },
        { headline: "A draft can turn into direction", body: "Let one rough outline become the next concrete task." },
      ],
      fire: [
        { headline: "Expression has momentum today", body: "Share the point early and keep the feedback loop short." },
        { headline: "Communication moves quickly", body: "Make the key point visible before the thread spreads out." },
        { headline: "Feedback can sharpen the work", body: "Use a short exchange to find what needs adjustment." },
      ],
      earth: [
        { headline: "Groundwork matters today", body: "Stabilize the basics before adding anything new." },
        { headline: "The base needs attention", body: "Check the foundation that the next work depends on." },
        { headline: "Steady structure beats novelty", body: "Improve the reliable part before opening new scope." },
      ],
      metal: [
        { headline: "Cleanup and decisions fit today", body: "Trim loose options and make the next action precise." },
        { headline: "Prioritization is the useful move", body: "Remove one unnecessary option and make the remaining path clearer." },
        { headline: "A crisp decision helps", body: "Turn scattered choices into one clean next step." },
      ],
      water: [
        { headline: "Research flows more easily today", body: "Follow useful clues, then capture the result before moving on." },
        { headline: "Discovery has a natural pull", body: "Trace the useful signal, but decide where the search stops." },
        { headline: "Reading and synthesis fit", body: "Collect enough context to move, then write down the result." },
      ],
    },
    elementDetails: {
      tree: {
        flow: "Ideas expand well when they are written as steps.",
        action: "Draft the outline, define the next task, and keep the first version light.",
        care: "Do not spend too long polishing before the direction is clear.",
      },
      fire: {
        flow: "Messages, presentations, and feedback loops move faster.",
        action: "Say the key point early and ask for the missing reaction.",
        care: "Speed can make wording sharper than intended.",
      },
      earth: {
        flow: "Stable foundations matter more than novelty.",
        action: "Check the base assumptions, files, or process that other work depends on.",
        care: "Avoid adding new scope before the current base is steady.",
      },
      metal: {
        flow: "Judgment, cleanup, and prioritization are strong.",
        action: "Remove one unnecessary option and make the next action precise.",
        care: "Do not let decisiveness become too rigid.",
      },
      water: {
        flow: "Research, reading, and discovery are easier to follow.",
        action: "Trace the useful clue, then capture the result before opening another path.",
        care: "Exploration can spread out if the stopping point is unclear.",
      },
    },
    workSignals: {
      empty: {
        body: [
          "No tasks are logged for this date yet, so keep the first move intentionally small.",
          "With no recorded work yet, the useful move is to choose one clean starting point.",
        ],
        detail: [
          "Start with one task that gives the day a visible shape.",
          "Use the first record as the anchor for the rest of the day.",
        ],
      },
      light: {
        body: [
          "{duration} is logged so far; use the light load to close one clear item.",
          "The logged load is still light at {duration}, which makes a focused finish easier.",
        ],
        detail: [
          "Keep the next step small enough to complete in one pass.",
          "Use the open space to finish, not to add too many new threads.",
        ],
      },
      focused: {
        body: [
          "Most of the logged time is concentrated, so protect that single thread.",
          "A long focused block is already visible; keep the handoff or finish line explicit.",
        ],
        detail: [
          "Write down the end condition before the focus block spreads.",
          "Keep the main thread intact and defer unrelated cleanup.",
        ],
      },
      fragmented: {
        body: [
          "{tasks} tasks are already visible, so the day benefits from grouping and pruning.",
          "The task list is split across {tasks} items; reduce switching where you can.",
        ],
        detail: [
          "Merge related work or choose the next task by dependency, not by noise.",
          "Avoid letting small items decide the whole day.",
        ],
      },
      heavy: {
        body: [
          "{duration} is already logged, so recovery and a clear stop point matter.",
          "The day is carrying {duration}; protect the finish by narrowing the remaining scope.",
        ],
        detail: [
          "Choose what will not be handled today as clearly as what will.",
          "Leave margin before making another time-heavy commitment.",
        ],
      },
      crossDay: {
        body: [
          "Cross-day work is part of this date, so separate carryover from new decisions.",
          "Some time crosses midnight; treat today's portion as its own slice.",
        ],
        detail: [
          "Mark what belongs to recovery, continuation, and new work separately.",
          "Do not let yesterday's spillover set every priority for today.",
        ],
      },
      late: {
        body: [
          "Late work is visible in the log, so keep the next decision lighter than usual.",
          "The record leans into later hours; a softer finish will help the next day.",
        ],
        detail: [
          "Capture the conclusion before opening another late thread.",
          "Prefer a clear stopping note over one more broad task.",
        ],
      },
      active: {
        body: [
          "A timer is running now, so the best signal is to define the next stopping point.",
          "Current work is still open; keep the live task narrow enough to close cleanly.",
        ],
        detail: [
          "Name the finish condition before the timer block gets too wide.",
          "Use the active block to create a clear record, not just elapsed time.",
        ],
      },
      tagged: {
        body: [
          "#{tag} appears most often, so that thread can be the organizing handle.",
          "The #{tag} tag is leading the day; use it to keep the next choice coherent.",
        ],
        detail: [
          "Let #{tag} decide what gets grouped and what waits.",
          "Use the dominant tag as a boundary for the next work block.",
        ],
      },
    },
  },
  ko: {
    title: "오늘의 운세",
    natalTitle: "출생 차트",
    unknownTimeNote: "출생 시간을 모르는 상태라 앵글과 하우스는 표시하지 않습니다.",
    natalLabels: {
      saju: "사주",
      place: "장소",
      angles: "앵글",
      planets: "행성",
      aspect: "각도",
      note: "참고",
    },
    sajuPillars: {
      year: "년",
      month: "월",
      day: "일",
      hour: "시",
    },
    planets: {
      Sun: "태양",
      Moon: "달",
      Mercury: "수성",
      Venus: "금성",
      Mars: "화성",
      Jupiter: "목성",
      Saturn: "토성",
      Uranus: "천왕성",
      Neptune: "해왕성",
      Pluto: "명왕성",
    },
    aspects: {
      conjunction: "합",
      sextile: "육각",
      square: "사각",
      trine: "삼각",
      opposition: "대립",
    },
    detailLabels: {
      flow: "흐름",
      action: "추천",
      care: "주의",
    },
    pillarFocus: {
      hour: "이 신호는 실행 리듬 쪽에 먼저 닿습니다.",
      day: "이 신호는 개인 페이스 쪽에 먼저 닿습니다.",
      month: "이 신호는 업무 구조 쪽에 먼저 닿습니다.",
      year: "이 신호는 외부 기대치 쪽에 먼저 닿습니다.",
    },
    secondarySignal: "보조 신호로 {relation} 흐름도 있어 범위를 분명히 두는 편이 좋습니다.",
    relationNames: {
      合: "정렬",
      半合: "부분 연결",
      三合: "탄력",
      方合: "구조",
      沖: "마찰",
      刑: "검토",
      破: "완충",
      害: "명확화",
    },
    ziwei: {
      flow: "자미두수 보조 신호는 이번 달 {monthlyFocus}, 긴 주기에서는 {longFocus} 쪽을 가리킵니다.",
      action: "{positiveFocus} 쪽은 {positiveTone} 흐름을 활용하고, {cautionFocus} 쪽은 {cautionTone} 흐름에 대비하세요.",
      care: "이 신호는 방향 보정용으로만 보고, 실제 작업 기록을 우선하세요.",
      unknownTimeCare: "출생 시간을 모르는 상태라 자미두수 보조 신호는 가볍게 보는 편이 좋습니다.",
      palaceDomains: {
        命宮: "개인 페이스",
        兄弟: "공유 자원",
        夫妻: "합의와 관계",
        子女: "결과물과 실험",
        財帛: "가치와 리소스",
        疾厄: "회복과 부하",
        遷移: "외부 맥락",
        交友: "협업",
        官祿: "업무 방향",
        田宅: "기반과 환경",
        福德: "심리적 여유",
        父母: "지원과 제약",
      },
      sihuaTones: {
        化祿: "여유",
        化權: "결정 압박",
        化科: "검증과 신뢰",
        化忌: "마찰",
      },
    },
    auxiliary: {
      tenGodHeadline: {
        比肩: "내 기준을 세울 날",
        劫財: "역할을 나눠야 할 날",
        食神: "가볍게 산출할 날",
        傷官: "표현을 다듬을 날",
        偏財: "외부 변수를 작게 다룰 날",
        正財: "기준과 리소스를 정돈할 날",
        偏官: "압박에 안전선을 둘 날",
        正官: "규칙을 먼저 확인할 날",
        偏印: "낯선 단서를 정리할 날",
        正印: "문서와 근거를 기대기 좋은 날",
        本元: "내 기준점으로 돌아올 날",
      },
      tenGodFocus: {
        比肩: "내 기준이 강해지는 흐름이라 외부 속도에 바로 맞추기보다 역할을 분명히 하세요.",
        劫財: "공동 압박이 커질 수 있어 내 몫과 함께 처리할 몫을 나누는 편이 좋습니다.",
        食神: "산출물을 가볍게 먼저 내놓을수록 흐름이 살아납니다.",
        傷官: "표현과 수정 신호가 예민하니 문장이나 전달 방식을 한 번 다듬으세요.",
        偏財: "외부 변수와 빠른 기회가 들어오기 쉬워 결정을 작고 구체적으로 두세요.",
        正財: "마감, 비용, 실제 리소스처럼 손에 잡히는 기준을 정돈하세요.",
        偏官: "압박이 행동을 빠르게 만들 수 있으니 약속 전 안전선을 먼저 두세요.",
        正官: "기준과 책임이 강조되니 실행 전에 규칙을 확인하세요.",
        偏印: "낯선 단서와 조사 흐름이 도움되지만 결론을 기록하고 넘어가세요.",
        正印: "문서, 지원, 안정적인 근거를 기대기 좋은 흐름입니다.",
        本元: "외부 신호에 반응하기 전에 내 기준점을 먼저 확인하세요.",
      },
      meteorFocus: {
        長生: "새 흐름은 작게 시작할수록 오래 이어집니다.",
        沐浴: "노출과 피드백이 민감해질 수 있어 겉으로 보이는 부분을 먼저 정리하세요.",
        冠帶: "형식과 책임이 드러나는 날이라 제출 기준을 먼저 확인하세요.",
        乾祿: "실행력은 충분하니 작업 경계를 분명히 두는 편이 좋습니다.",
        帝旺: "탄력이 강해지는 만큼 쓸모 있는 범위 밖으로 커지지 않게 보세요.",
        衰: "새 가지를 더하기 전에 이미 잡은 부하를 먼저 줄이세요.",
        病: "계획의 약한 지점을 작게 점검하면 뒤의 지연을 줄일 수 있습니다.",
        死: "새 흐름으로 보기 전에 오래 열린 고리부터 닫으세요.",
        墓: "결정 전에 자료를 모으고 정리해두는 쪽이 유리합니다.",
        絶: "오래된 전제를 계속 고치기보다 기준을 새로 잡는 편이 낫습니다.",
        胎: "아이디어는 바로 공개하기보다 조금 더 준비시키는 흐름입니다.",
        養: "속도보다 준비와 보강이 더 중요한 신호입니다.",
      },
      spiritFocus: {
        劫殺: "소음이 큰 부분을 잘라내고 핵심 결정을 보호하세요.",
        災殺: "길이 명확해 보여도 작은 예비안을 남겨두는 편이 좋습니다.",
        天殺: "외부 제약이 하루를 흔들 수 있으니 과한 약속은 피하세요.",
        地殺: "이동, 전달, 인계 흐름은 더 분명한 기준이 필요합니다.",
        年殺: "노출도가 올라가는 흐름이라 보이는 신호를 깔끔하게 정리하세요.",
        月殺: "반복되는 패턴은 다시 반복되기 전에 이름 붙여두세요.",
        亡身: "속도 때문에 세부가 빠질 수 있으니 닫기 전에 흔적을 확인하세요.",
        將星: "주도권은 방향이 분명할 때 도움이 됩니다.",
        攀鞍: "혼자 들고 가기보다 도움받을 경로를 쓰는 편이 좋습니다.",
        驛馬: "이동과 전환이 생기기 쉬우니 결정은 전환 전에 기록하세요.",
        六害: "숨은 어긋남이 커지지 않게 초반에 전제를 확인하세요.",
        華蓋: "넓은 노출보다 깊게 파고드는 작업이 더 잘 맞습니다.",
      },
      elementFocus: {
        tree: "기획과 성장 신호가 살아 있으니 다음 순서를 글로 잡아보세요.",
        fire: "소통과 피드백 신호가 살아 있으니 핵심을 먼저 보이게 하세요.",
        earth: "안정과 기반 신호가 살아 있으니 바탕을 먼저 확인하세요.",
        metal: "판단과 정리 신호가 살아 있으니 느슨한 선택지 하나를 덜어내세요.",
        water: "조사와 종합 신호가 살아 있으니 탐색을 멈출 기준도 정하세요.",
      },
      gongmangFocus: "공망 지지에 닿아 있으니 이 신호를 최종 결론처럼 보기 전 여백을 남기세요.",
    },
    neutralHeadline: "차분한 진행이 잘 맞는 날",
    neutralBody: "우선순위 하나를 분명히 잡고 꾸준히 밀어붙이는 쪽이 좋습니다.",
    neutralVariants: [
      {
        headline: "차분한 진행이 잘 맞는 날",
        body: "우선순위 하나를 분명히 잡고 꾸준히 밀어붙이는 쪽이 좋습니다.",
      },
      {
        headline: "단순한 리듬이 잘 맞는 날",
        body: "첫 단계를 작게 잡고 계획을 필요 이상으로 무겁게 만들지 않는 편이 좋습니다.",
      },
      {
        headline: "꾸준함이 힘이 되는 날",
        body: "큰 전환보다 작은 완료를 차곡차곡 만드는 쪽이 더 잘 맞습니다.",
      },
    ],
    neutralDetails: {
      flow: "큰 전환보다 일정한 리듬이 더 잘 맞습니다.",
      action: "나머지 일을 쉽게 만들어주는 작업 하나를 먼저 끝내세요.",
      care: "작은 요청을 너무 많이 동시에 잡으면 집중이 흐려질 수 있습니다.",
    },
    fallbackHeadline: "작은 신호를 가볍게 읽을 날",
    fallbackBody: "계획은 단순하게 두고, 흐름이 바뀌면 과하게 붙잡지 말고 조정하세요.",
    relations: {
      合: ["생각의 결이 잘 맞는 날", "흩어진 일을 하나로 묶고 정리하기 좋습니다."],
      半合: ["흩어진 아이디어가 이어지는 날", "작업 전환을 줄이고 한 가지 흐름을 끝까지 잡아보세요."],
      三合: ["관련 작업에 탄력이 붙는 날", "비슷한 일을 묶어서 처리하면 흐름이 좋아집니다."],
      方合: ["구조가 진행을 도와주는 날", "이미 잡아둔 계획을 따라가며 차분히 다듬기 좋습니다."],
      沖: ["결정은 작게 가져갈 날", "마찰이나 변화가 생길 수 있으니 되돌릴 수 있는 선택이 좋습니다."],
      刑: ["확정 전에 한 번 더 볼 날", "무리하게 밀어붙이기보다 세부 내용을 다시 확인하세요."],
      破: ["여유 시간을 남겨둘 날", "작은 계획이 어긋날 수 있으니 일정에 완충을 두는 편이 좋습니다."],
      害: ["초반에 기대치를 맞출 날", "조용한 엇갈림이 쌓이지 않도록 먼저 명확히 해두세요."],
    },
    relationVariants: {
      合: [
        { headline: "생각의 결이 잘 맞는 날", body: "흩어진 일을 하나로 묶고 정리하기 좋습니다." },
        { headline: "공유된 맥락이 붙는 날", body: "짧게 기준을 맞추면 흩어진 메모가 하나의 결정으로 이어질 수 있습니다." },
        { headline: "연결을 만들기 쉬운 날", body: "관련된 대화와 작업을 붙여서 열린 고리 하나를 닫아보세요." },
      ],
      半合: [
        { headline: "흩어진 아이디어가 이어지는 날", body: "작업 전환을 줄이고 한 가지 흐름을 끝까지 잡아보세요." },
        { headline: "부분적인 단서로 시작할 날", body: "쓸모 있는 단서 하나를 초안으로 보고 다음 행동으로 바꿔보세요." },
        { headline: "느슨한 신호가 쓸모 있어지는 날", body: "연결이 너무 넓게 퍼지지 않도록 범위를 좁게 잡는 편이 좋습니다." },
      ],
      三合: [
        { headline: "관련 작업에 탄력이 붙는 날", body: "비슷한 일을 묶어서 처리하면 흐름이 좋아집니다." },
        { headline: "묶어서 처리할수록 속도가 나는 날", body: "새 흐름을 열기 전에 관련 항목을 한 번에 지나가 보세요." },
        { headline: "하나의 주제가 여러 일을 끌고 가는 날", body: "공통된 방향을 이용하면 전환을 줄이면서 더 많이 마무리할 수 있습니다." },
      ],
      方合: [
        { headline: "구조가 진행을 도와주는 날", body: "이미 잡아둔 계획을 따라가며 차분히 다듬기 좋습니다." },
        { headline: "루틴이 하루를 잡아주는 날", body: "익숙한 절차를 쓰고 약한 부분 하나를 보완해보세요." },
        { headline: "분명한 틀이 결정을 돕는 날", body: "순서를 보이는 상태로 두고 불필요한 절차는 늘리지 않는 편이 좋습니다." },
      ],
      沖: [
        { headline: "결정은 작게 가져갈 날", body: "마찰이나 변화가 생길 수 있으니 되돌릴 수 있는 선택이 좋습니다." },
        { headline: "방향 전환의 여지를 둘 날", body: "서로 다른 신호가 들어올 수 있으니 계획을 너무 일찍 고정하지 마세요." },
        { headline: "약속은 작게 나눌 날", body: "전체 방향을 확정하기 전에 다음 단계 하나를 먼저 시험해보세요." },
      ],
      刑: [
        { headline: "확정 전에 한 번 더 볼 날", body: "무리하게 밀어붙이기보다 세부 내용을 다시 확인하세요." },
        { headline: "압박 속에서 세부가 커지는 날", body: "최종 결정을 조금 늦추고 그 뒤의 전제를 확인하는 편이 좋습니다." },
        { headline: "마지막 확인이 중요한 날", body: "작은 검토 한 번이 나중의 재작업을 줄여줄 수 있습니다." },
      ],
      破: [
        { headline: "여유 시간을 남겨둘 날", body: "작은 계획이 어긋날 수 있으니 일정에 완충을 두는 편이 좋습니다." },
        { headline: "중요한 블록을 보호할 날", body: "취약한 작업 주변에 여유를 두고 빡빡한 약속을 겹치지 마세요." },
        { headline: "계획에 여백이 필요한 날", body: "방해가 생길 수 있다고 보고 대체 경로 하나를 남겨두세요." },
      ],
      害: [
        { headline: "초반에 기대치를 맞출 날", body: "조용한 엇갈림이 쌓이지 않도록 먼저 명확히 해두세요." },
        { headline: "숨은 어긋남을 이름 붙일 날", body: "짧은 확인이 작은 차이를 나중의 일로 키우지 않게 해줍니다." },
        { headline: "공유된 전제를 확인할 날", body: "다음 행동에 정확성이 필요하다면 암묵적인 합의에 기대지 마세요." },
      ],
    },
    relationDetails: {
      合: {
        flow: "협업이나 공유된 맥락을 맞추기 쉬운 흐름입니다.",
        action: "흩어진 메모, 대화, 작업을 하나의 결정으로 묶어보세요.",
        care: "합의가 쉬워 보여도 다음 행동은 명확히 적어두는 편이 좋습니다.",
      },
      半合: {
        flow: "부분적으로 이어지는 단서가 쓸모 있게 보이는 흐름입니다.",
        action: "가능성 있는 한 줄기를 골라 실제 작업으로 바꾸세요.",
        care: "첫 방향이 잡히기 전에 다른 아이디어로 너무 빨리 넘어가지 마세요.",
      },
      三合: {
        flow: "관련된 일이 함께 묶이면 속도가 붙습니다.",
        action: "비슷한 항목을 한 세션에 모아서 처리하세요.",
        care: "탄력이 과한 약속으로 이어지지 않게 범위를 계속 확인하세요.",
      },
      方合: {
        flow: "구조와 루틴이 하루를 받쳐주는 흐름입니다.",
        action: "기존 계획을 따라가며 약한 부분 하나를 다듬으세요.",
        care: "절차 자체를 늘리는 데 시간을 쓰지 않는 편이 좋습니다.",
      },
      沖: {
        flow: "서로 다른 신호나 갑작스러운 변화가 들어올 수 있습니다.",
        action: "결정을 작게 쪼개고 되돌릴 수 있는 단계로 움직이세요.",
        care: "쉽게 바꾸기 어려운 약속은 여유를 두고 잡는 편이 좋습니다.",
      },
      刑: {
        flow: "압박감 때문에 세부가 더 빡빡하게 느껴질 수 있습니다.",
        action: "방향을 확정하기 전에 전제를 한 번 더 확인하세요.",
        care: "근거가 부족한 상태에서 답을 밀어붙이지 마세요.",
      },
      破: {
        flow: "작은 변수로 원래 계획이 흔들릴 수 있습니다.",
        action: "중요한 작업에는 완충 시간을 먼저 확보하세요.",
        care: "일정 변경을 실패가 아니라 조정 신호로 보는 편이 좋습니다.",
      },
      害: {
        flow: "조용한 엇갈림은 초반에 놓치기 쉽습니다.",
        action: "일이 퍼지기 전에 기대치와 기준을 명확히 맞추세요.",
        care: "암묵적인 합의에 기대지 않는 편이 좋습니다.",
      },
    },
    elementFlows: {
      tree: ["기획이 자라기 좋은 날", "막연한 아이디어 하나를 다음 행동으로 구체화해보세요."],
      fire: ["표현에 탄력이 붙는 날", "핵심을 먼저 공유하고 피드백 흐름을 짧게 가져가세요."],
      earth: ["기반을 다지기 좋은 날", "새로운 것을 얹기보다 기본 구조를 안정시키는 쪽이 좋습니다."],
      metal: ["정리와 판단이 잘 맞는 날", "선택지를 덜어내고 다음 행동을 또렷하게 정하세요."],
      water: ["탐색 흐름이 좋은 날", "단서를 따라가되 결과를 기록하고 다음으로 넘어가세요."],
    },
    elementVariants: {
      tree: [
        { headline: "기획이 자라기 좋은 날", body: "막연한 아이디어 하나를 다음 행동으로 구체화해보세요." },
        { headline: "아이디어에 경로가 필요한 날", body: "범위를 넓히기 전에 순서를 먼저 적어보는 편이 좋습니다." },
        { headline: "초안이 방향이 되는 날", body: "거친 개요 하나를 실제 다음 작업으로 바꿔보세요." },
      ],
      fire: [
        { headline: "표현에 탄력이 붙는 날", body: "핵심을 먼저 공유하고 피드백 흐름을 짧게 가져가세요." },
        { headline: "소통이 빠르게 움직이는 날", body: "이야기가 퍼지기 전에 핵심 문장을 먼저 보이게 하세요." },
        { headline: "피드백이 일을 선명하게 하는 날", body: "짧은 주고받기로 조정할 지점을 찾아보세요." },
      ],
      earth: [
        { headline: "기반을 다지기 좋은 날", body: "새로운 것을 얹기보다 기본 구조를 안정시키는 쪽이 좋습니다." },
        { headline: "바탕을 확인해야 하는 날", body: "다음 일이 기대는 전제와 파일, 절차를 먼저 점검하세요." },
        { headline: "새로움보다 안정감이 맞는 날", body: "새 범위를 열기 전에 믿고 쓸 수 있는 부분을 다듬어보세요." },
      ],
      metal: [
        { headline: "정리와 판단이 잘 맞는 날", body: "선택지를 덜어내고 다음 행동을 또렷하게 정하세요." },
        { headline: "우선순위가 힘을 쓰는 날", body: "불필요한 선택지 하나를 지워 남은 길을 더 선명하게 만드세요." },
        { headline: "깔끔한 결정이 도움이 되는 날", body: "흩어진 선택을 하나의 분명한 다음 단계로 바꿔보세요." },
      ],
      water: [
        { headline: "탐색 흐름이 좋은 날", body: "단서를 따라가되 결과를 기록하고 다음으로 넘어가세요." },
        { headline: "발견의 흐름이 자연스러운 날", body: "쓸모 있는 신호를 따라가되 어디서 멈출지도 함께 정하세요." },
        { headline: "읽고 종합하기 좋은 날", body: "움직일 만큼의 맥락을 모은 뒤 결과를 적어두는 편이 좋습니다." },
      ],
    },
    elementDetails: {
      tree: {
        flow: "아이디어는 단계로 적을 때 더 잘 자랍니다.",
        action: "개요를 잡고 다음 작업을 정의한 뒤 첫 버전은 가볍게 시작하세요.",
        care: "방향이 분명해지기 전에 다듬는 데 오래 머물지 마세요.",
      },
      fire: {
        flow: "메시지, 공유, 피드백의 속도가 붙기 쉽습니다.",
        action: "핵심을 먼저 말하고 필요한 반응을 바로 요청하세요.",
        care: "속도가 붙으면 표현이 의도보다 날카롭게 보일 수 있습니다.",
      },
      earth: {
        flow: "새로움보다 안정적인 기반이 더 중요합니다.",
        action: "다른 일이 기대는 전제, 파일, 절차를 먼저 점검하세요.",
        care: "현재 기반이 안정되기 전에 새 범위를 얹지 마세요.",
      },
      metal: {
        flow: "판단, 정리, 우선순위에 힘이 실립니다.",
        action: "불필요한 선택지 하나를 덜어내고 다음 행동을 또렷하게 만드세요.",
        care: "명확함이 지나쳐 경직된 결론이 되지 않게 보세요.",
      },
      water: {
        flow: "조사, 읽기, 탐색 흐름을 따라가기 쉽습니다.",
        action: "쓸모 있는 단서를 따라가되 결과를 기록하고 다음으로 넘어가세요.",
        care: "멈출 지점이 없으면 탐색이 너무 넓게 퍼질 수 있습니다.",
      },
    },
    workSignals: {
      empty: {
        body: [
          "이 날짜에는 아직 기록된 작업이 없으니 첫 움직임을 의도적으로 작게 잡아보세요.",
          "아직 기록이 없다면 오늘을 잡아줄 시작점 하나를 정하는 게 좋습니다.",
        ],
        detail: [
          "하루의 형태가 보이도록 첫 작업 하나를 먼저 기록하세요.",
          "첫 기록을 나머지 흐름의 기준점으로 쓰는 편이 좋습니다.",
        ],
      },
      light: {
        body: [
          "지금까지 {duration} 기록되어 있으니 가벼운 부하를 이용해 한 가지를 닫기 좋습니다.",
          "기록된 부하는 아직 {duration}이라, 집중해서 마무리하기 좋은 여지가 있습니다.",
        ],
        detail: [
          "다음 단계는 한 번에 끝낼 수 있을 만큼 작게 유지하세요.",
          "남은 여백은 새 일을 늘리기보다 마무리에 쓰는 편이 좋습니다.",
        ],
      },
      focused: {
        body: [
          "기록된 시간이 한 흐름에 많이 모여 있으니 그 실마리를 보호하는 편이 좋습니다.",
          "긴 집중 블록이 이미 보이니 인계점이나 완료 기준을 분명히 두세요.",
        ],
        detail: [
          "집중 블록이 넓어지기 전에 끝 조건을 먼저 적어두세요.",
          "주된 흐름은 유지하고 관련 없는 정리는 뒤로 미루는 편이 좋습니다.",
        ],
      },
      fragmented: {
        body: [
          "{tasks}개의 작업이 보이니 묶고 덜어내는 쪽이 하루에 도움이 됩니다.",
          "작업이 {tasks}개로 나뉘어 있으니 전환을 줄이는 방향이 좋습니다.",
        ],
        detail: [
          "관련 작업은 묶고, 다음 작업은 소음보다 의존성 기준으로 고르세요.",
          "작은 항목들이 하루 전체를 결정하게 두지 마세요.",
        ],
      },
      heavy: {
        body: [
          "이미 {duration} 기록되어 있으니 회복과 멈출 지점을 분명히 하는 게 중요합니다.",
          "오늘은 {duration}만큼의 무게를 갖고 있으니 남은 범위를 좁혀 마무리를 보호하세요.",
        ],
        detail: [
          "오늘 처리하지 않을 것도 처리할 것만큼 분명히 정하세요.",
          "시간을 많이 쓰는 약속을 더 잡기 전에는 여유를 남기는 편이 좋습니다.",
        ],
      },
      crossDay: {
        body: [
          "날짜를 넘긴 작업이 포함되어 있으니 이어받은 일과 새 결정을 분리해서 보세요.",
          "자정을 넘긴 시간이 섞여 있으니 오늘에 해당하는 몫을 따로 다루는 편이 좋습니다.",
        ],
        detail: [
          "회복, 이어가기, 새 작업을 구분해 기록하세요.",
          "어제의 여파가 오늘의 모든 우선순위를 정하게 두지 마세요.",
        ],
      },
      late: {
        body: [
          "늦은 시간대 작업이 보이니 다음 결정은 평소보다 가볍게 잡는 편이 좋습니다.",
          "기록이 늦은 시간으로 기울어 있어 부드럽게 마무리하는 쪽이 다음 날에 좋습니다.",
        ],
        detail: [
          "늦은 흐름을 더 열기 전에 결론부터 남기세요.",
          "넓은 새 작업보다 명확한 중단 메모가 더 유용합니다.",
        ],
      },
      active: {
        body: [
          "지금 타이머가 실행 중이라, 다음 멈출 지점을 정하는 게 가장 좋은 신호입니다.",
          "현재 작업이 열려 있으니 깔끔하게 닫을 수 있을 만큼 범위를 좁게 유지하세요.",
        ],
        detail: [
          "타이머 블록이 넓어지기 전에 완료 조건을 정하세요.",
          "흘러간 시간보다 분명한 기록을 만드는 데 집중하세요.",
        ],
      },
      tagged: {
        body: [
          "#{tag} 태그가 가장 자주 보이니 그 흐름을 하루의 정리 기준으로 삼기 좋습니다.",
          "#{tag} 흐름이 앞에 있으니 다음 선택도 그 기준 안에서 잡아보세요.",
        ],
        detail: [
          "#{tag} 기준으로 묶을 것과 미룰 것을 나눠보세요.",
          "주된 태그를 다음 작업 블록의 경계로 쓰는 편이 좋습니다.",
        ],
      },
    },
  },
};

export function computeDailyFortune(profile, dateKey, workContext = {}) {
  const language = normalizeLanguage(profile?.language);
  const copy = COPY[language];
  const birthInput = normalizeBirthInput(profile);
  const selectedDate = parseDateKey(dateKey);
  const context = normalizeWorkContext(workContext);
  const signalMinute = normalizeSignalMinute(context.signalMinute);
  const natal = calculateSaju(birthInput);
  const todayPillars = getFourPillars(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    selectedDate.getDate(),
    Math.floor(signalMinute / 60),
    signalMinute % 60,
  );
  const dayPillar = todayPillars[2];
  const hourPillar = todayPillars[3];
  const natalPillars = natal.pillars.map((item, index) => (birthInput.unknownTime && index === 0 ? "" : item.pillar.ganzi));
  const relations = collectDailyRelations(dayPillar, natalPillars);
  const primary = pickPrimaryRelation(relations);
  const secondary = pickSecondaryRelation(relations, primary);
  const seed = fortuneSeed(profile, dateKey, dayPillar, hourPillar, primary, birthInput, natal);
  const auxiliary = buildDailyAuxiliarySignal(copy, natal, dayPillar, hourPillar, seed);
  const ziwei = buildZiweiSignal(copy, birthInput, selectedDate, seed);
  const signals = { dayPillar, hourPillar, secondary, relationCount: relations.length, ziwei, auxiliary };

  if (!primary) {
    const neutral = pickSeeded(copy.neutralVariants || [], `${seed}:neutral`) || {
      headline: copy.neutralHeadline,
      body: copy.neutralBody,
    };
    return {
      title: copy.title,
      headline: `${dayPillar} · ${enrichFortuneHeadline(neutral.headline, auxiliary)}`,
      body: enrichFortuneBody(neutral.body, auxiliary),
      details: buildFortuneDetails(copy, null, signals, context, seed, language),
      references: buildFortuneReferences(copy, null, signals, context),
      language,
    };
  }

  const { headline, body } = relationCopy(copy, primary, seed);
  return {
    title: copy.title,
    headline: `${dayPillar} · ${enrichFortuneHeadline(headline, auxiliary)}`,
    body: enrichFortuneBody(body, auxiliary),
    details: buildFortuneDetails(copy, primary, signals, context, seed, language),
    references: buildFortuneReferences(copy, primary, signals, context),
    language,
  };
}

export async function computeNatalSummary(profile) {
  const language = normalizeLanguage(profile?.language);
  const copy = COPY[language];
  const birthInput = normalizeBirthInput(profile);
  return buildNatalSummary(copy, birthInput, profile, language);
}

export function searchBirthplaces(query) {
  return collectBirthplaceMatches(query).slice(0, MAX_BIRTHPLACE_RESULTS);
}

export function resolveBirthplace(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return collectBirthplaceMatches(text).find((place) => normalizeSearchText(place.label) === normalizeSearchText(text)) || null;
}

function relationCopy(copy, relation, seed) {
  if (isElementRelation(relation) && copy.elementVariants?.[relation.detail]) {
    return pickSeeded(copy.elementVariants[relation.detail], `${seed}:element:${relation.detail}`);
  }
  if (copy.relationVariants?.[relation.type]) {
    return pickSeeded(copy.relationVariants[relation.type], `${seed}:relation:${relation.type}`);
  }
  if (isElementRelation(relation) && copy.elementFlows[relation.detail]) {
    const [headline, body] = copy.elementFlows[relation.detail];
    return { headline, body };
  }
  const [headline, body] = copy.relations[relation.type] || [copy.fallbackHeadline, copy.fallbackBody];
  return { headline, body };
}

function isElementRelation(relation) {
  return ["半合", "三合", "方合"].includes(relation?.type);
}

function enrichFortuneHeadline(headline, auxiliary) {
  return auxiliary?.dayStemRole?.headline || headline;
}

function enrichFortuneBody(body, auxiliary) {
  return joinSentences(body, auxiliary?.selectedFocus || "");
}

function buildFortuneDetails(copy, relation, signals, context, seed, language) {
  const labels = copy.detailLabels || {};
  const base = fortuneDetailCopy(copy, relation);
  const secondary = secondaryRelationDetail(copy, signals.secondary);
  const work = workSignalDetail(copy, context, seed, language);
  const ziwei = signals.ziwei || {};

  return [
    fortuneDetailRow(labels.flow, joinSentences(base.flow, ziwei.flow)),
    fortuneDetailRow(labels.action, joinSentences(base.action, work, ziwei.action)),
    fortuneDetailRow(labels.care, joinSentences(base.care, secondary, ziwei.care)),
  ].filter(Boolean);
}

function fortuneDetailCopy(copy, relation) {
  if (!relation) return copy.neutralDetails || {};
  if (isElementRelation(relation) && copy.elementDetails?.[relation.detail]) return copy.elementDetails[relation.detail];
  return copy.relationDetails?.[relation.type] || copy.neutralDetails || {};
}

function secondaryRelationDetail(copy, relation) {
  if (!relation) return "";
  const relationName = copy.relationNames?.[relation.type] || relation.type;
  return fillTemplate(copy.secondarySignal, { relation: relationName });
}

function workSignalDetail(copy, context, seed, language) {
  const key = workSignalKey(context);
  const template = pickSeeded(copy.workSignals?.[key]?.detail || [], `${seed}:work:${key}`);
  return fillTemplate(template, {
    duration: formatWorkDuration(context.totalMinutes, language),
    tasks: context.taskCount,
    tag: context.topTag,
  });
}

function fortuneDetailRow(label, text) {
  const cleanLabel = String(label || "").trim();
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanLabel || !cleanText) return null;
  return { label: cleanLabel, text: cleanText };
}

function buildFortuneReferences(copy, relation, signals, context) {
  return {
    dayPillar: signals.dayPillar,
    hourPillar: signals.hourPillar,
    relationCount: signals.relationCount,
    primarySignal: relationReference(copy, relation),
    secondarySignal: relationReference(copy, signals.secondary),
    auxiliarySignal: signals.auxiliary || null,
    workSignal: {
      type: workSignalKey(context),
      taskCount: context.taskCount,
      totalMinutes: context.totalMinutes,
      longestMinutes: context.longestMinutes,
      crossDayCount: context.crossDayCount,
      continuationCount: context.continuationCount,
      lateTaskCount: context.lateTaskCount,
      active: context.active,
      hasTopTag: Boolean(context.topTag),
    },
    ziweiSignal: signals.ziwei?.references || null,
  };
}

function relationReference(copy, relation) {
  if (!relation) return null;
  return {
    type: copy.relationNames?.[relation.type] || relation.type,
    detail: relation.detail || "",
    natalPillar: relation.natalPillar || "",
    channel: relation.channel || "",
  };
}

function buildDailyAuxiliarySignal(copy, natal, dayPillar, hourPillar, seed) {
  const natalDayPillar = natal.pillars[1]?.pillar;
  const natalYearPillar = natal.pillars[3]?.pillar;
  const dayStem = dayPillar[0] || "";
  const dayBranch = dayPillar[1] || "";
  const hourStem = hourPillar?.[0] || "";
  const hourBranch = hourPillar?.[1] || "";
  const dayMaster = natalDayPillar?.stem || natalDayPillar?.ganzi?.[0] || "";
  const yearBranch = natalYearPillar?.branch || natalYearPillar?.ganzi?.[1] || "";
  const mainHiddenStem = safeSignal(() => getJeonggi(dayBranch));
  const voidBranches = safeSignal(() => getGongmang(natalDayPillar?.ganzi || ""));
  const dayStemRole = relationSignal(copy, safeSignal(() => getRelation(dayMaster, dayStem)?.hanja), "tenGodFocus");
  const hiddenStemRole = relationSignal(copy, safeSignal(() => getRelation(dayMaster, mainHiddenStem)?.hanja), "tenGodFocus");
  const branchStage = relationSignal(copy, safeSignal(() => getTwelveMeteor(dayMaster, dayBranch)), "meteorFocus");
  const branchSpirit = relationSignal(copy, safeSignal(() => getTwelveSpirit(yearBranch, dayBranch)), "spiritFocus");
  const hourStemRole = relationSignal(copy, safeSignal(() => getRelation(dayMaster, hourStem)?.hanja), "tenGodFocus");
  const hourBranchStage = relationSignal(copy, safeSignal(() => getTwelveMeteor(dayMaster, hourBranch)), "meteorFocus");
  const hourBranchSpirit = relationSignal(copy, safeSignal(() => getTwelveSpirit(yearBranch, hourBranch)), "spiritFocus");
  const stemElement = STEM_INFO[dayStem]?.element || "";
  const branchElement = BRANCH_ELEMENT[dayBranch] || "";
  const hourStemElement = STEM_INFO[hourStem]?.element || "";
  const hourBranchElement = BRANCH_ELEMENT[hourBranch] || "";
  const elementFocus = copy.auxiliary?.elementFocus?.[branchElement] || copy.auxiliary?.elementFocus?.[stemElement] || "";
  const hourElementFocus = copy.auxiliary?.elementFocus?.[hourBranchElement] || copy.auxiliary?.elementFocus?.[hourStemElement] || "";
  const isVoidBranch = Array.isArray(voidBranches) && voidBranches.includes(dayBranch);
  const selectedFocus = pickSeeded(
    [
      dayStemRole?.focus,
      branchStage?.focus,
      branchSpirit?.focus,
      hiddenStemRole?.focus,
      elementFocus,
      hourStemRole?.focus,
      hourBranchStage?.focus,
      hourBranchSpirit?.focus,
      hourElementFocus,
      isVoidBranch ? copy.auxiliary?.gongmangFocus : "",
    ].filter(Boolean),
    `${seed}:auxiliary:focus`,
  ) || "";

  if (
    !dayStemRole &&
    !branchStage &&
    !branchSpirit &&
    !hiddenStemRole &&
    !elementFocus &&
    !hourStemRole &&
    !hourBranchStage &&
    !hourBranchSpirit &&
    !hourElementFocus &&
    !isVoidBranch
  ) {
    return null;
  }

  return {
    selectedFocus,
    dayStemRole,
    branchStage,
    branchSpirit,
    hiddenStemRole,
    elementFocus,
    hourStemRole,
    hourBranchStage,
    hourBranchSpirit,
    hourElementFocus,
    dayStemElement: stemElement,
    dayBranchElement: branchElement,
    hourStemElement,
    hourBranchElement,
    voidBranch: isVoidBranch,
    voidFocus: isVoidBranch ? copy.auxiliary?.gongmangFocus || "" : "",
  };
}

function relationSignal(copy, key, focusGroup) {
  if (!key) return null;
  return {
    key,
    focus: copy.auxiliary?.[focusGroup]?.[key] || "",
    headline: focusGroup === "tenGodFocus" ? copy.auxiliary?.tenGodHeadline?.[key] || "" : "",
  };
}

function safeSignal(fn) {
  try {
    return fn() || "";
  } catch {
    return "";
  }
}

async function buildNatalSummary(copy, birthInput, profile, language) {
  const birthplace = normalizeBirthplace(profile?.birthplace);
  const items = [];

  const sajuText = formatSajuPillars(copy, birthInput);
  if (sajuText) {
    items.push({
      label: copy.natalLabels.saju,
      text: sajuText,
    });
  }

  if (birthplace) {
    items.push({
      label: copy.natalLabels.place,
      text: birthplace.label,
    });

    const natal = await calculateNatal(
      {
        ...birthInput,
        latitude: birthplace.lat,
        longitude: birthplace.lon,
      },
      "P",
    );

    if (natal.angles) {
      items.push({
        label: copy.natalLabels.angles,
        text: `ASC ${formatSign(natal.angles.asc.sign, language)} · MC ${formatSign(natal.angles.mc.sign, language)}`,
      });
    } else {
      items.push({
        label: copy.natalLabels.note,
        text: copy.unknownTimeNote,
      });
    }

    const sun = findPlanet(natal, "Sun");
    const moon = findPlanet(natal, "Moon");
    const planetText = [formatPlanetPlacement(copy, sun, language), formatPlanetPlacement(copy, moon, language)]
      .filter(Boolean)
      .join(" · ");
    if (planetText) {
      items.push({
        label: copy.natalLabels.planets,
        text: planetText,
      });
    }

    const strongestAspect = natal.aspects[0];
    if (strongestAspect) {
      items.push({
        label: copy.natalLabels.aspect,
        text: `${formatPlanetName(copy, strongestAspect.planet1)} ${copy.aspects[strongestAspect.type]} ${formatPlanetName(copy, strongestAspect.planet2)} (${strongestAspect.orb.toFixed(1)}°)`,
      });
    }
  }

  if (items.length === 0) return null;

  return {
    title: copy.natalTitle,
    items,
  };
}

function formatSajuPillars(copy, birthInput) {
  const natal = calculateSaju(birthInput);
  const pillars = natal.pillars || [];
  const parts = [
    formatSajuPillar(copy.sajuPillars.year, pillars[3]),
    formatSajuPillar(copy.sajuPillars.month, pillars[2]),
    formatSajuPillar(copy.sajuPillars.day, pillars[1]),
  ];
  if (!birthInput.unknownTime) parts.push(formatSajuPillar(copy.sajuPillars.hour, pillars[0]));
  return parts.filter(Boolean).join(" · ");
}

function formatSajuPillar(label, item) {
  const ganzi = item?.pillar?.ganzi || "";
  return ganzi ? `${label} ${ganzi}` : "";
}

function findPlanet(natal, planetId) {
  return natal.planets.find((planet) => planet.id === planetId);
}

function formatPlanetPlacement(copy, planet, language) {
  if (!planet) return "";
  const house = planet.house ? ` ${planet.house}H` : "";
  return `${formatPlanetName(copy, planet.id)} ${formatSign(planet.sign, language)}${house}`;
}

function formatPlanetName(copy, planetId) {
  return copy.planets[planetId] || planetId;
}

function formatSign(sign, language) {
  if (language === "ko") return ZODIAC_KO[sign] || sign;
  return sign;
}

function collectBirthplaceMatches(query) {
  const text = String(query || "").trim();
  if (!text) return [];

  const directMatches = filterCities(text).map((city) => cityToBirthplace(city));
  const aliasMatches = CITY_ALIASES.filter(([alias]) => normalizeSearchText(alias).includes(normalizeSearchText(text)))
    .flatMap(([alias, cityQuery]) => filterCities(cityQuery).map((city) => cityToBirthplace(city, alias)));

  return dedupeBirthplaces([...aliasMatches, ...directMatches]);
}

function cityToBirthplace(city, label = formatCityName(city)) {
  return {
    label,
    name: city.name,
    country: city.country || "",
    region: city.region || "",
    lat: city.lat,
    lon: city.lon,
  };
}

function dedupeBirthplaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${place.name}:${place.country}:${place.region}:${place.lat}:${place.lon}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBirthplace(place) {
  if (!place) return null;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    label: String(place.label || place.name || "").trim(),
    name: String(place.name || "").trim(),
    country: String(place.country || "").trim(),
    region: String(place.region || "").trim(),
    lat,
    lon,
  };
}

function normalizeSearchText(text) {
  return String(text || "").trim().toLowerCase();
}

function normalizeBirthInput(profile) {
  const dateParts = String(profile?.birthDate || "").split("-").map(Number);
  if (dateParts.length !== 3 || dateParts.some((part) => !Number.isFinite(part))) {
    throw new Error("Birth date is required.");
  }

  const time = profile?.unknownTime ? "12:00" : String(profile?.birthTime || "12:00");
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error("Birth time is invalid.");
  }

  return {
    year: dateParts[0],
    month: dateParts[1],
    day: dateParts[2],
    hour,
    minute,
    gender: profile?.gender === "F" ? "F" : "M",
    unknownTime: Boolean(profile?.unknownTime),
  };
}

function collectDailyRelations(dayPillar, natalPillars) {
  const relations = [];

  natalPillars.forEach((pillar, index) => {
    if (!pillar) return;
    const result = analyzePillarRelations(dayPillar, pillar);
    for (const item of result.stem) {
      relations.push({
        type: item.type,
        detail: item.detail,
        natalPillar: NATAL_PILLAR_NAMES[index] || "natal",
        natalGanzi: pillar,
        channel: "stem",
      });
    }
    for (const item of result.branch) {
      relations.push({
        type: item.type,
        detail: item.detail,
        natalPillar: NATAL_PILLAR_NAMES[index] || "natal",
        natalGanzi: pillar,
        channel: "branch",
      });
    }
  });

  return relations;
}

function pickPrimaryRelation(relations) {
  return relations
    .filter((relation) => RELATION_PRIORITY.includes(relation.type))
    .sort(compareRelations)[0];
}

function pickSecondaryRelation(relations, primary) {
  return relations
    .filter((relation) => RELATION_PRIORITY.includes(relation.type))
    .filter((relation) => !isSameRelationFamily(relation, primary))
    .sort(compareRelations)[0];
}

function compareRelations(a, b) {
  return (
    RELATION_PRIORITY.indexOf(a.type) - RELATION_PRIORITY.indexOf(b.type) ||
    (NATAL_PILLAR_PRIORITY[a.natalPillar] ?? 99) - (NATAL_PILLAR_PRIORITY[b.natalPillar] ?? 99) ||
    (CHANNEL_PRIORITY[a.channel] ?? 99) - (CHANNEL_PRIORITY[b.channel] ?? 99) ||
    String(a.detail || "").localeCompare(String(b.detail || ""))
  );
}

function isSameRelationFamily(a, b) {
  if (!a || !b) return false;
  return a.type === b.type && a.detail === b.detail;
}

function buildZiweiSignal(copy, birthInput, selectedDate, seed) {
  if (birthInput.unknownTime) {
    return {
      flow: "",
      action: "",
      care: copy.ziwei.unknownTimeCare,
      references: {
        monthlyFocus: "",
        longFocus: "",
        positiveFocus: "",
        positiveTone: "",
        cautionFocus: "",
        cautionTone: "",
        unknownTime: true,
      },
    };
  }

  try {
    const chart = createChart(birthInput.year, birthInput.month, birthInput.day, birthInput.hour, birthInput.minute, birthInput.gender === "M");
    const liunian = calculateLiunian(chart, selectedDate.getFullYear());
    const monthlyFocus = ziweiMonthlyFocus(liunian, selectedDate) || liunian.natalPalaceAtMing;
    const longFocus = liunian.daxianPalaceName || liunian.natalPalaceAtMing;
    const sihua = ziweiSihuaPair(copy, liunian, seed);
    const monthlyFocusDomain = ziweiPalaceDomain(copy, monthlyFocus);
    const longFocusDomain = ziweiPalaceDomain(copy, longFocus);
    const positiveFocusDomain = sihua ? ziweiPalaceDomain(copy, sihua.positiveFocus) : "";
    const cautionFocusDomain = sihua ? ziweiPalaceDomain(copy, sihua.cautionFocus) : "";
    const positiveTone = sihua ? ziweiSihuaTone(copy, sihua.positiveKey) : "";
    const cautionTone = sihua ? ziweiSihuaTone(copy, sihua.cautionKey) : "";
    const flow = monthlyFocus && longFocus
      ? fillTemplate(copy.ziwei.flow, {
          monthlyFocus: monthlyFocusDomain,
          longFocus: longFocusDomain,
        })
      : "";
    const action = sihua
      ? fillTemplate(copy.ziwei.action, {
          positiveFocus: positiveFocusDomain,
          positiveTone,
          cautionFocus: cautionFocusDomain,
          cautionTone,
        })
      : "";
    const care = joinSentences(copy.ziwei.care, birthInput.unknownTime ? copy.ziwei.unknownTimeCare : "");

    if (!flow && !action && !care) return null;
    return {
      flow,
      action,
      care,
      references: {
        monthlyFocus: monthlyFocusDomain,
        longFocus: longFocusDomain,
        positiveFocus: positiveFocusDomain,
        positiveTone,
        cautionFocus: cautionFocusDomain,
        cautionTone,
        unknownTime: birthInput.unknownTime,
      },
    };
  } catch {
    return null;
  }
}

function ziweiMonthlyFocus(liunian, selectedDate) {
  const month = selectedDate.getMonth() + 1;
  return liunian.liuyue?.find((item) => item.month === month)?.natalPalaceName || "";
}

function ziweiSihuaPair(copy, liunian, seed) {
  const pairs = [
    ["化祿", "化忌"],
    ["化科", "化權"],
  ];
  const [positiveKey, cautionKey] = pickSeeded(pairs, `${seed}:ziwei:sihua`) || pairs[0];
  const positiveFocus = liunian.siHuaPalaces?.[positiveKey];
  const cautionFocus = liunian.siHuaPalaces?.[cautionKey];
  if (!positiveFocus || !cautionFocus) return null;
  if (!copy.ziwei.sihuaTones[positiveKey] || !copy.ziwei.sihuaTones[cautionKey]) return null;
  return { positiveKey, positiveFocus, cautionKey, cautionFocus };
}

function ziweiPalaceDomain(copy, palaceName) {
  return copy.ziwei.palaceDomains[palaceName] || palaceName || "";
}

function ziweiSihuaTone(copy, sihuaKey) {
  return copy.ziwei.sihuaTones[sihuaKey] || sihuaKey || "";
}

function normalizeWorkContext(context) {
  return {
    taskCount: numberOrZero(context?.taskCount),
    totalMinutes: numberOrZero(context?.totalMinutes),
    longestMinutes: numberOrZero(context?.longestMinutes),
    crossDayCount: numberOrZero(context?.crossDayCount),
    continuationCount: numberOrZero(context?.continuationCount),
    lateTaskCount: numberOrZero(context?.lateTaskCount),
    active: Boolean(context?.active),
    topTag: String(context?.topTag || "").trim(),
    signalMinute: normalizeSignalMinute(context?.signalMinute),
  };
}

function workSignalKey(context) {
  if (context.active) return "active";
  if (context.crossDayCount > 0 || context.continuationCount > 0) return "crossDay";
  if (context.lateTaskCount > 0) return "late";
  if (context.totalMinutes >= 420) return "heavy";
  if (context.taskCount >= 4) return "fragmented";
  if (context.totalMinutes >= 120 && context.longestMinutes >= context.totalMinutes * 0.6) return "focused";
  if (context.topTag) return "tagged";
  if (context.totalMinutes > 0) return "light";
  return "empty";
}

function fortuneSeed(profile, dateKey, dayPillar, hourPillar, relation, birthInput, natal) {
  const natalPillarSeed = (natal?.pillars || [])
    .map((item, index) => (birthInput?.unknownTime && index === 0 ? "" : item?.pillar?.ganzi || ""))
    .join(",");
  return [
    profile?.birthDate || "",
    birthInput?.unknownTime ? "unknown-time" : natalPillarSeed,
    profile?.gender || "",
    dateKey,
    dayPillar,
    hourPillar || "",
    relation?.type || "neutral",
    relation?.detail || "",
    relation?.natalPillar || "",
  ].join("|");
}

function pickSeeded(values, seed) {
  if (!values?.length) return null;
  return values[(hashString(seed) + stringPositionSalt(seed)) % values.length];
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stringPositionSalt(value) {
  return Array.from(String(value)).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function fillTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function joinSentences(...parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function formatWorkDuration(minutes, language) {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (language === "ko") {
    if (!hours) return `${mins}분`;
    if (!mins) return `${hours}시간`;
    return `${hours}시간 ${mins}분`;
  }
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeSignalMinute(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 12 * 60;
  return Math.max(0, Math.min(1439, Math.floor(number)));
}

function normalizeLanguage(language) {
  return language === "ko" ? "ko" : "en";
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, month - 1, day);
}
