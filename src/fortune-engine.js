import { calculateSaju } from "@orrery/core/saju";
import { analyzePillarRelations, getFourPillars } from "@orrery/core/pillars";
import { filterCities, formatCityName } from "@orrery/core/cities";
import { ZODIAC_KO, calculateNatal } from "@orrery/core/natal";

const NATAL_PILLAR_NAMES = ["hour", "day", "month", "year"];
const RELATION_PRIORITY = ["沖", "刑", "破", "害", "合", "半合", "三合", "方合"];
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
      place: "Place",
      angles: "Angles",
      planets: "Planets",
      aspect: "Aspect",
      note: "Note",
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
    neutralHeadline: "Steady progress works best",
    neutralBody: "Keep one clear priority and let consistency do the work.",
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
  },
  ko: {
    title: "오늘의 운세",
    natalTitle: "출생 차트",
    unknownTimeNote: "출생 시간을 모르는 상태라 앵글과 하우스는 표시하지 않습니다.",
    natalLabels: {
      place: "장소",
      angles: "앵글",
      planets: "행성",
      aspect: "각도",
      note: "참고",
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
    neutralHeadline: "차분한 진행이 잘 맞는 날",
    neutralBody: "우선순위 하나를 분명히 잡고 꾸준히 밀어붙이는 쪽이 좋습니다.",
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
  },
};

export function computeDailyFortune(profile, dateKey) {
  const language = normalizeLanguage(profile?.language);
  const copy = COPY[language];
  const birthInput = normalizeBirthInput(profile);
  const selectedDate = parseDateKey(dateKey);
  const natal = calculateSaju(birthInput);
  const todayPillars = getFourPillars(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    selectedDate.getDate(),
    12,
    0,
  );
  const dayPillar = todayPillars[2];
  const relations = collectDailyRelations(dayPillar, natal.pillars.map((item) => item.pillar.ganzi));
  const primary = pickPrimaryRelation(relations);

  if (!primary) {
    return {
      title: copy.title,
      headline: `${dayPillar} · ${copy.neutralHeadline}`,
      body: copy.neutralBody,
      details: buildDetailItems(copy, null),
      language,
    };
  }

  const [headline, body] = relationCopy(copy, primary);
  return {
    title: copy.title,
    headline: `${dayPillar} · ${headline}`,
    body,
    details: buildDetailItems(copy, primary),
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

function relationCopy(copy, relation) {
  if (isElementRelation(relation) && copy.elementFlows[relation.detail]) {
    return copy.elementFlows[relation.detail];
  }
  return copy.relations[relation.type] || [copy.fallbackHeadline, copy.fallbackBody];
}

function isElementRelation(relation) {
  return ["半合", "三合", "方合"].includes(relation?.type);
}

function buildDetailItems(copy, relation) {
  const source =
    (isElementRelation(relation) && copy.elementDetails[relation.detail]) ||
    copy.relationDetails[relation?.type] ||
    copy.neutralDetails;

  return ["flow", "action", "care"].map((key) => ({
    label: copy.detailLabels[key],
    text: source[key],
  }));
}

async function buildNatalSummary(copy, birthInput, profile, language) {
  const birthplace = normalizeBirthplace(profile?.birthplace);
  if (!birthplace) return null;

  const natal = await calculateNatal(
    {
      ...birthInput,
      latitude: birthplace.lat,
      longitude: birthplace.lon,
    },
    "P",
  );
  const items = [
    {
      label: copy.natalLabels.place,
      text: birthplace.label,
    },
  ];

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

  return {
    title: copy.natalTitle,
    items,
  };
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
    const result = analyzePillarRelations(dayPillar, pillar);
    for (const item of [...result.stem, ...result.branch]) {
      relations.push({
        type: item.type,
        detail: item.detail,
        natalPillar: NATAL_PILLAR_NAMES[index] || "natal",
      });
    }
  });

  return relations;
}

function pickPrimaryRelation(relations) {
  return relations
    .filter((relation) => RELATION_PRIORITY.includes(relation.type))
    .sort((a, b) => RELATION_PRIORITY.indexOf(a.type) - RELATION_PRIORITY.indexOf(b.type))[0];
}

function normalizeLanguage(language) {
  return language === "ko" ? "ko" : "en";
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, month - 1, day);
}
