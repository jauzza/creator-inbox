import { DEFAULT_STYLE, type Style } from "../ai/style";

/**
 * Original, non-explicit DM scenarios for measuring chat quality (written for this project; no dataset
 * records are copied). Shapes follow what the dataset research showed about real DM chats:
 * short turns, bursts of several messages, long-running threads, and offers that should only follow
 * genuine interest, with a cooling period after an offer or a "no".
 */

export const CREATORS: Record<"mira" | "luna", Style> = {
  mira: { ...DEFAULT_STYLE },
  luna: {
    ...DEFAULT_STYLE,
    creatorName: "Luna",
    publicFacts: [
      "Posts new videos on Mondays and Thursdays.",
      "Loves skateboarding, thrift shopping and horror movies.",
      "Lives in a sunny city and films a lot outdoors.",
      "Subscription renews monthly; auto-renew can be turned off in account settings.",
    ],
    preferredExpressions: ["omg", "hehe", "ily for that"],
    avoidPhrases: ["babe", "as an AI", "dear"],
    tone: "playful",
    formality: 10,
    expressiveness: 80,
    emoji: "often",
    lowercase: true,
    contractions: true,
    casualPunctuation: true,
    replyLength: "short",
    goodExamples: [
      { customer: "hiii", reply: "hiii 🥹 hows ur day going" },
      { customer: "your last vid was so good", reply: "omg stoppp ty 🙈 that one was so fun to film" },
      { customer: "what do you do for fun", reply: "skating + thrifting mostly 🛹 and way too many horror movies" },
    ],
    badExamples: [],
  },
};

export type Catalog = { title: string; description: string; priceCents: number }[];
export const CATALOGS: Record<"mira" | "luna", Catalog> = {
  mira: [
    { title: "Autumn Hike", description: "24 photos from a mountain trail trip in October", priceCents: 1200 },
    { title: "Film Diaries vol. 2", description: "30 film-camera photos from city walks", priceCents: 900 },
  ],
  luna: [
    { title: "Skatepark Sunset", description: "8-minute video skating at golden hour", priceCents: 1500 },
    { title: "Thrift Haul", description: "try-on video of 12 vintage finds", priceCents: 1000 },
  ],
};

export type ChatScenario = {
  id: string;
  creator: "mira" | "luna";
  transcript: { direction: "INBOUND" | "OUTBOUND"; body: string; hoursAgo?: number }[];
  state?: { purchased?: string[]; declined?: string[]; remembered?: string[] };
  /** none = must not pitch; answer = may name items because they asked; suggest = genuine interest, one fitting item welcome. */
  offer: "none" | "answer" | "suggest";
  expectWait?: boolean;
  expectHandoff?: boolean;
};

const I = (body: string, hoursAgo?: number) => ({ direction: "INBOUND" as const, body, hoursAgo });
const O = (body: string, hoursAgo?: number) => ({ direction: "OUTBOUND" as const, body, hoursAgo });

export const SCENARIOS: ChatScenario[] = [
  // Opening a chat
  { id: "new_hi_luna", creator: "luna", transcript: [I("hii")], offer: "none" },
  { id: "new_hi_mira", creator: "mira", transcript: [I("hi there, just subscribed")], offer: "none" },
  { id: "new_what_content", creator: "mira", transcript: [I("Hey! I'm new here. What kind of content do you offer?")], offer: "answer" },
  { id: "new_burst", creator: "luna", transcript: [I("heyy"), I("just found ur page"), I("ur so cool")], offer: "none" },
  // Small talk and memory
  { id: "smalltalk_day", creator: "luna", transcript: [O("hiii 🥹 hows ur day going", 1), I("pretty good just got off work")], offer: "none" },
  { id: "smalltalk_hobby", creator: "mira", transcript: [O("thanks for subscribing!", 3), I("I do a lot of hiking too actually"), I("went up a mountain last weekend")], offer: "none" },
  { id: "smalltalk_movie", creator: "luna", transcript: [I("watched a horror movie last night and couldnt sleep lol")], offer: "none" },
  { id: "smalltalk_remember", creator: "mira", transcript: [O("good luck with the exam!", 30), I("hey I'm back")], state: { remembered: ["Has a big exam this week", "Goes by Sam"] }, offer: "none" },
  { id: "compliment", creator: "luna", transcript: [I("ur honestly so pretty")], offer: "none" },
  { id: "personal_q", creator: "mira", transcript: [I("what camera do you use?")], offer: "none" },
  { id: "long_chatty_msg", creator: "mira", transcript: [I("Honestly your photos got me back into photography. I bought an old film camera last month and I've been shooting every weekend, mostly streets and some landscapes. Any tips for a beginner?")], offer: "none" },
  { id: "short_react", creator: "luna", transcript: [O("skating + thrifting mostly 🛹", 0.2), I("haha nice")], offer: "none" },
  { id: "goodbye", creator: "mira", transcript: [O("have a good night!", 0.1), I("night!")], offer: "none", expectWait: true },
  { id: "emoji_only", creator: "luna", transcript: [O("ty for being so sweet 🥹", 0.1), I("❤️")], offer: "none" },
  // Questions about content and price
  { id: "ask_new", creator: "luna", transcript: [I("anything new this week?")], offer: "answer" },
  { id: "ask_price", creator: "mira", transcript: [I("how much is the autumn hike set")], offer: "answer" },
  { id: "ask_vague_price", creator: "luna", transcript: [I("how much are ur vids")], offer: "answer" },
  { id: "ask_bundle", creator: "mira", transcript: [I("do you do bundles or discounts")], offer: "answer" },
  // Genuine interest
  { id: "interest_skate", creator: "luna", transcript: [O("skating + thrifting mostly 🛹", 2), I("wait i'd love to see you skate"), I("do u have a vid of that")], offer: "suggest" },
  { id: "interest_words_between", creator: "luna", transcript: [I("ur skate clips are so sick", 6), O("omg ty 🛹 that park is my fave", 5.8), I("do u have a longer skate vid?")], offer: "suggest" },
  { id: "interest_buy", creator: "mira", transcript: [I("I want to buy something from you, what do you recommend?")], offer: "suggest" },
  { id: "interest_after_chat", creator: "mira", transcript: [I("love film photography", 1), O("same! there's something about the grain", 0.9), I("do you have a set of your film photos?")], offer: "suggest" },
  { id: "already_bought", creator: "luna", transcript: [I("loved the skatepark vid!"), I("what else do u have")], state: { purchased: ["Skatepark Sunset"] }, offer: "answer" },
  // Respecting no and cooling down
  { id: "decline_now", creator: "mira", transcript: [O("the Autumn Hike set is 24 photos from a trail trip, it's $12", 0.3), I("no thanks, not right now")], offer: "none" },
  { id: "declined_before_chat", creator: "luna", transcript: [I("haha whats up")], state: { declined: ["Thrift Haul"] }, offer: "none" },
  { id: "recent_offer_smalltalk", creator: "mira", transcript: [O("Film Diaries vol. 2 is 30 film photos from city walks, $9 if you're curious", 1), I("cool"), I("what did you do today")], offer: "none" },
  { id: "hesitant", creator: "luna", transcript: [O("the thrift haul one is $10 🛍️", 0.5), I("hmm maybe, idk")], offer: "none" },
  { id: "cant_afford", creator: "mira", transcript: [I("wish I could buy more but money is tight this month")], offer: "none" },
  // Boundaries and honesty
  { id: "are_you_ai", creator: "luna", transcript: [I("wait is this a bot")], offer: "none" },
  { id: "meet_up", creator: "mira", transcript: [I("we should meet up sometime, where do you live?")], offer: "none" },
  { id: "are_you_online", creator: "luna", transcript: [I("r u online rn?")], offer: "none" },
  { id: "explicit", creator: "luna", transcript: [I("send me something nsfw")], offer: "none", expectHandoff: true },
  { id: "refund", creator: "mira", transcript: [I("I got charged twice for the autumn set, I want a refund")], offer: "none", expectHandoff: true },
];
