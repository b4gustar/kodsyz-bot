// Автоответ @kodsyz на кодовые слова — серверная версия (Vercel).
// Базы данных нет: что уже отвечено, каждый раз проверяем в самом Instagram
// (есть ли наше сообщение в переписке с человеком после его комментария или сообщения).
// Один раз отправляем всю папку материалов (5 PDF) и подсказку, какой файл открыть по этому слову
const MATERIALS = "https://kodsyz-bot.vercel.app/materials";
const FILE_FOR = {
  вайб: "«Вайбкодинг с нуля» — с чего начать",
  кино: "«Вайбкодинг с нуля» — как устроен вайбкодинг и формула промпта",
  старт: "«Вайбкодинг с нуля» — первый проект за вечер",
  список: "«Вайбкодинг с нуля», стр. 5 — 5 нейросетей со ссылками",
  салон: "«12 промптов для первых заказов» — промпт № 3, запись в салон",
  бот: "«12 промптов для первых заказов» — промпт № 4, бот кофейни",
  ошибки: "«Чек-лист перед сдачей заказа»",
  заказ: "«Где найти первых клиентов»",
  квест: "«Карта 90 дней» — весь путь по неделям",
  игра: "«Карта 90 дней» — этапы заказа и курса",
  мк: "«Карта 90 дней» — про мастер-класс и запись",
};
const answers = FILE_FOR; // кодовые слова
const message = (word) =>
  `Привет! Держите все материалы Kodsyz одной папкой:\n${MATERIALS}\n\n` +
  `По слову «${word.toUpperCase()}» начните с файла ${FILE_FOR[word]}.\n\n` +
  `Внутри 5 PDF: вайбкодинг с нуля, 12 промптов, чек-лист перед сдачей заказа, первые клиенты и карта 90 дней.\n\n` +
  `Подпишитесь на @kodsyz — каждую неделю новые разборы и материалы.`;

const G = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_PAGE_TOKEN; // токен только страницы Kodsyz
const PAGE_ID = process.env.PAGE_ID;
const IG_ID = process.env.IG_ID;
const ME = "kodsyz";

// Защита от наплыва: запуск раз в 5 минут → не больше 180 сообщений в директ и 60 ответов под комментариями в час
const PER_RUN_DM = 15;
const PER_RUN_PUBLIC = 5;
const RATE_CODES = new Set(["4", "17", "32", "613", "80002", "80006"]);
// Ответы под комментариями — случайные, чтобы не было одинаковых (одинаковые сотнями похожи на спам)
const PUBLIC_REPLIES = [
  "Отправили в директ — загляните в сообщения",
  "Готово, всё уже в директе",
  "Написали вам в личные сообщения",
  "Проверьте директ — материалы там",
  "Отправили, смотрите сообщения",
  "Лови в директе",
  "Уже в личке — откройте сообщения",
  "Отправили папку с материалами в директ",
  "Готово, загляните в директ",
  "Скинули всё в личные сообщения",
  "Ответили в директ",
  "Материалы уже в сообщениях",
];
const DIGIT_REPLY = {
  low: [
    "Тогда начните с мастер-класса: соберём приложение при вас, ссылка в шапке профиля",
    "Хорошее начало. Приходите на мастер-класс — ссылка в шапке, можно с телефона",
    "С этого и начинают. Мастер-класс онлайн, 60 минут — ссылка в шапке профиля",
  ],
  high: [
    "3 и больше — вам точно к нам. Приходите на мастер-класс, ссылка в шапке профиля",
    "Похоже, вайбкодинг ваше. Мастер-класс онлайн — ссылка в шапке",
    "Отличный результат. Покажем, как собрать первое приложение, — ссылка в шапке профиля",
  ],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class RateLimited extends Error {}

async function api(path, params = {}, method = "GET") {
  const q = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === "GET" ? await fetch(`${G}/${path}?${q}`) : await fetch(`${G}/${path}`, { method, body: q });
  const j = await res.json();
  if (j.error) {
    const code = String(j.error.code);
    if (RATE_CODES.has(code)) throw new RateLimited(`${code}: ${j.error.message}`);
    throw new Error(`${code}: ${j.error.message}`);
  }
  return j;
}

const norm = (s = "") => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
const keywordIn = (text) => norm(text).split(" ").find((w) => answers[w]) ?? null;
const digitIn = (text) => norm(text).split(" ").find((w) => /^[0-5]$/.test(w)) ?? null;
const hash = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

// все страницы ответа Graph API (до max элементов)
async function all(path, params, max = 200) {
  const out = [];
  let j = await api(path, params);
  out.push(...(j.data ?? []));
  while (j.paging?.next && out.length < max) {
    j = await (await fetch(j.paging.next)).json();
    if (j.error) break;
    out.push(...(j.data ?? []));
  }
  return out;
}

// Переписки: по каждому собеседнику — его сообщения и время наших ответов
async function conversations() {
  const convs = await all(`${PAGE_ID}/conversations`, {
    platform: "instagram",
    fields: "updated_time,participants,messages.limit(20){id,message,from,created_time}",
    limit: 50,
  });
  const byUser = new Map();
  for (const c of convs) {
    const other = (c.participants?.data ?? []).find((p) => p.username !== ME);
    if (!other) continue;
    const msgs = (c.messages?.data ?? []).map((m) => ({ ...m, t: Date.parse(m.created_time), mine: m.from?.username === ME }));
    const gotMaterials = msgs.some((m) => m.mine && (m.message ?? "").includes("/materials"));
    byUser.set(other.username, { id: other.id, msgs, gotMaterials });
  }
  return byUser;
}

const DAY = 24 * 3600 * 1000;

// Сводка: все кодовые слова за 7 дней и их статус
export async function scan() {
  const now = Date.now();
  const convs = await conversations();
  // отвечено: мы писали человеку после его сообщения или он уже получал папку (отправляем один раз)
  const answeredAfter = (user, t) => convs.get(user)?.gotMaterials || (convs.get(user)?.msgs ?? []).some((m) => m.mine && m.t >= t - 1000);
  const items = [];

  const media = await all(`${IG_ID}/media`, { fields: "id,caption,timestamp,permalink", limit: 25 }, 25);
  for (const m of media) {
    const comments = await all(`${m.id}/comments`, { fields: "id,text,username,timestamp,replies{username}", limit: 100 }, 500);
    for (const c of comments) {
      if (c.username === ME) continue;
      const t = Date.parse(c.timestamp);
      const word = keywordIn(c.text);
      const digit = word ? null : digitIn(c.text);
      if (!word && digit === null) continue;
      const publicDone = (c.replies?.data ?? []).some((r) => r.username === ME);
      const dmDone = word ? answeredAfter(c.username, t) : true;
      const old = now - t > 7 * DAY;
      items.push({
        source: "комментарий",
        id: c.id,
        user: c.username,
        text: c.text,
        word: word ? word.toUpperCase() : `цифра ${digit}`,
        digit,
        time: c.timestamp,
        post: m.permalink,
        publicDone,
        dmDone,
        status: dmDone && (publicDone || word) ? "отвечено" : old ? "окно истекло" : "ждёт",
      });
    }
  }
  for (const [user, c] of convs) {
    // последнее сообщение собеседника с кодовым словом, после которого мы не писали
    const theirs = c.msgs.filter((m) => !m.mine && keywordIn(m.message)).sort((a, b) => b.t - a.t)[0];
    if (!theirs || now - theirs.t > 7 * DAY) continue;
    const done = c.gotMaterials || c.msgs.some((m) => m.mine && m.t >= theirs.t - 1000);
    items.push({
      source: "директ",
      id: theirs.id,
      user,
      igsid: c.id,
      text: theirs.message,
      word: keywordIn(theirs.message).toUpperCase(),
      time: theirs.created_time,
      dmDone: done,
      publicDone: null,
      status: done ? "отвечено" : now - theirs.t > DAY ? "окно истекло" : "ждёт",
    });
  }
  items.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return items;
}

// Один проход: отвечаем всем «ждёт» в пределах лимитов
export async function run({ send = true } = {}) {
  const items = await scan();
  const log = [];
  let dms = 0;
  let pubs = 0;
  const sentTo = new Set(); // одному человеку — одна папка за проход
  try {
    for (const it of items.filter((x) => x.status === "ждёт")) {
      if (it.source === "комментарий" && it.digit !== null && it.digit !== undefined) {
        if (pubs >= PER_RUN_PUBLIC || it.publicDone) continue;
        if (send) await api(`${it.id}/replies`, { message: pick(DIGIT_REPLY[Number(it.digit) >= 3 ? "high" : "low"]) }, "POST");
        pubs++;
        log.push(`ответ под комментарием @${it.user} (${it.word})`);
        continue;
      }
      if (dms >= PER_RUN_DM) break;
      if (sentTo.has(it.user)) continue;
      const text = message(it.word.toLowerCase());
      const recipient = it.source === "комментарий" ? { comment_id: it.id } : { id: it.igsid };
      if (send) await api(`${IG_ID}/messages`, { recipient: JSON.stringify(recipient), message: JSON.stringify({ text }) }, "POST");
      dms++;
      sentTo.add(it.user);
      log.push(`директ @${it.user} — ${it.word}`);
      if (it.source === "комментарий" && !it.publicDone && pubs < PER_RUN_PUBLIC) {
        if (send) await api(`${it.id}/replies`, { message: pick(PUBLIC_REPLIES) }, "POST");
        pubs++;
      }
      await new Promise((r) => setTimeout(r, 700 + (hash(it.id) % 900)));
    }
  } catch (e) {
    if (e instanceof RateLimited) log.push(`Meta просит притормозить (${e.message}) — продолжим в следующий запуск`);
    else log.push(`ошибка: ${e.message}`);
  }
  return { sent: dms, public: pubs, log };
}

export const KEYWORDS = Object.keys(answers).map((w) => w.toUpperCase());
