// Additional FICTIONAL sample stories for fixture mode so the feed and the studio queue
// show more than one status. All outlets, people and numbers are invented.
import type { AssessmentSection, Claim, LensLane, OutputRecord, SourceRecord, StoryBundle } from "@openlens/schemas";

type Src = Pick<SourceRecord, "id" | "publisher" | "title" | "sourceType" | "text"> & { lens: SourceRecord["lens"]["rating"] };
type Cl = Pick<Claim, "id" | "text" | "claimType" | "state"> & { by?: string; src: string; passage: string; n?: number };

function bundle(opts: {
  id: string; title: string; summary: string; region: string; topics: string[]; languages: string[];
  status: StoryBundle["story"]["status"]; updatedAt: string; version?: number;
  sources: Src[]; claims: Cl[]; lanes?: Omit<LensLane, "modelGenerated">[];
  assessment?: { headline: string; sections: [AssessmentSection["kind"], string, string[]][] };
  timeline?: StoryBundle["timeline"]; context?: StoryBundle["context"]; outputs?: Partial<OutputRecord>[];
  corrections?: StoryBundle["corrections"];
}): StoryBundle {
  const { id, updatedAt } = opts;
  const version = opts.version ?? 1;
  return {
    story: {
      id, title: opts.title, summary: opts.summary, region: opts.region, topics: opts.topics,
      languages: opts.languages, riskTier: "low", status: opts.status, version,
      createdAt: updatedAt, updatedAt,
    },
    sources: opts.sources.map((s) => ({
      ...s, storyId: id, url: `https://example.com/fictional/${id}/${s.id}`, publishedAt: updatedAt, language: "en",
      lens: { rating: s.lens, ratingBasis: "fictional dev fixture" },
      rights: { license: "fixture", usage: "short quotes" },
    })),
    claims: opts.claims.map((c) => ({
      id: c.id, storyId: id, text: c.text, claimType: c.claimType, attributedTo: c.by, state: c.state,
      evidence: [{ sourceId: c.src, passage: c.passage }], independentSourceCount: c.n ?? 1, version,
    })),
    lanes: (opts.lanes ?? []).map((l) => ({ ...l, modelGenerated: true as const })),
    context: opts.context ?? [],
    timeline: opts.timeline ?? [],
    assessment: opts.assessment
      ? {
          storyId: id, ledgerVersion: version, headline: opts.assessment.headline, neutralSummary: opts.summary,
          sections: opts.assessment.sections.map(([kind, text, claimIds]) => ({ kind, text, claimIds })),
        }
      : null,
    outputs: (opts.outputs ?? []).map((o, i) => ({
      id: o.id ?? `${id}-out-${i}`, storyId: id, kind: o.kind ?? "script", channel: o.channel ?? "app",
      lang: o.lang ?? "en", tier: o.tier, claimIds: o.claimIds ?? [], ledgerVersion: version,
      status: o.status ?? "draft", payload: o.payload ?? {}, aiDisclosure: o.aiDisclosure ?? true,
      dependsOn: o.dependsOn ?? [], staleReason: o.staleReason, createdAt: updatedAt, updatedAt,
    })),
    publications: [],
    corrections: opts.corrections ?? [],
  };
}

const heatwave = bundle({
  id: "sample-heatwave-schools",
  title: "Schools shift to morning shifts as heatwave alert extended (FICTIONAL SAMPLE)",
  summary:
    "The state education department has moved government schools to a 7:30–11:30 schedule for two weeks after the weather office extended its heatwave alert. Teachers' unions back the move but say midday-meal logistics are unclear; a parents' group wants exams postponed.",
  region: "IN-TG",
  topics: ["education", "climate"],
  languages: ["en", "te", "hi"],
  status: "corrected",
  version: 2,
  updatedAt: "2026-10-12T07:40:00Z",
  sources: [
    { id: "h1", publisher: "FICTIONAL Deccan Ledger", title: "Schools move to half-day as heat alert extended", sourceType: "reporting", lens: "center",
      text: "The education department ordered government schools to run from 7:30 am to 11:30 am for the next two weeks. The weather office extended its heatwave alert until 26 October. Officials said midday meals would be served before dismissal." },
    { id: "h2", publisher: "FICTIONAL Teachers' Forum", title: "Union welcomes timing change, flags meal gaps", sourceType: "commentary", lens: "left",
      text: "The teachers' union welcomed the decision but said many schools lack staff to serve meals before 11:30 am. Union secretary K. Lalitha said the department should hire temporary cooks." },
    { id: "h3", publisher: "FICTIONAL Market Morning", title: "Parents' group seeks exam delay", sourceType: "analysis", lens: "right",
      text: "A parents' association said the shortened day leaves too little time to finish the syllabus and asked the board to postpone half-yearly exams by one week. The department has not responded to the request." },
  ],
  claims: [
    { id: "hc1", text: "Government schools will run from 7:30 am to 11:30 am for two weeks.", claimType: "fact", state: "supported", src: "h1", passage: "The education department ordered government schools to run from 7:30 am to 11:30 am for the next two weeks.", n: 2 },
    { id: "hc2", text: "The heatwave alert has been extended until 26 October.", claimType: "fact", state: "supported", src: "h1", passage: "The weather office extended its heatwave alert until 26 October." },
    { id: "hc3", text: "Many schools lack staff to serve meals before 11:30 am.", claimType: "allegation", by: "Teachers' union", state: "contested", src: "h2", passage: "many schools lack staff to serve meals before 11:30 am" },
    { id: "hc4", text: "The board should postpone half-yearly exams by one week.", claimType: "opinion", by: "Parents' association", state: "attributed", src: "h3", passage: "asked the board to postpone half-yearly exams by one week" },
    { id: "hc5", text: "The department has not responded to the exam-delay request.", claimType: "fact", state: "unverified", src: "h3", passage: "The department has not responded to the request." },
  ],
  lanes: [
    { lens: "left", sourceIds: ["h2"], summary: "Supports shorter hours; centres staffing gaps for midday meals.", emphasizes: ["Cook shortages", "Hire temporary staff"], doesNotEstablish: ["How many schools are affected"], claimIds: ["hc3"] },
    { lens: "center", sourceIds: ["h1"], summary: "Reports the order, the dates and the official meal plan.", emphasizes: ["New timings", "Alert extended to 26 Oct"], doesNotEstablish: ["Whether meal plan is feasible"], claimIds: ["hc1", "hc2"] },
    { lens: "right", sourceIds: ["h3"], summary: "Frames the change through lost teaching time and exam readiness.", emphasizes: ["Syllabus pressure", "Exam delay request"], doesNotEstablish: ["Measured learning loss"], claimIds: ["hc4", "hc5"] },
  ],
  assessment: {
    headline: "Heat alert extended; schools move to 7:30–11:30 for two weeks",
    sections: [
      ["established", "Schools run 7:30–11:30 am for two weeks; the heat alert runs to 26 October.", ["hc1", "hc2"]],
      ["contested", "Whether schools can serve midday meals before dismissal is disputed by the teachers' union.", ["hc3"]],
      ["unknown", "The department's response to the exam-delay request is not known.", ["hc5", "hc4"]],
      ["would_change", "A department circular on meal staffing or exam dates would update this assessment.", ["hc3", "hc4"]],
    ],
  },
  timeline: [
    { date: "2026-10-09", text: "Heatwave alert issued", claimIds: [], contextIds: [] },
    { date: "2026-10-11", text: "Alert extended to 26 Oct; school timings changed", claimIds: ["hc1", "hc2"], contextIds: [] },
  ],
  corrections: [
    { id: "corr-h-1", storyId: "sample-heatwave-schools", at: "2026-10-12T07:40:00Z", by: "editor@dev",
      reason: "Alert end date corrected from 24 to 26 October per weather office bulletin.", changedClaimIds: ["hc2"],
      fromVersion: 1, toVersion: 2, impactedOutputIds: [], impactedPublicationIds: [] },
  ],
});

const ev = bundle({
  id: "sample-ev-subsidy",
  title: "State proposes ₹15,000 top-up for electric two-wheelers (FICTIONAL SAMPLE)",
  summary:
    "A draft state EV policy proposes a ₹15,000 purchase incentive for electric two-wheelers and 500 new public chargers by 2028. Dealers welcome it; a fiscal think tank questions the cost estimate.",
  region: "IN-KA",
  topics: ["energy", "transport"],
  languages: ["en", "hi"],
  status: "in_review",
  updatedAt: "2026-10-12T05:15:00Z",
  sources: [
    { id: "e1", publisher: "FICTIONAL State Gazette", title: "Draft EV policy 2026–2030", sourceType: "primary", lens: "unrated",
      text: "The draft policy proposes an incentive of 15,000 rupees per electric two-wheeler and 500 public charging points by 2028. Public comments are invited for 30 days." },
    { id: "e2", publisher: "FICTIONAL Auto Wire", title: "Dealers cheer draft subsidy", sourceType: "reporting", lens: "center",
      text: "Dealers' association president S. Kumar said the incentive could double monthly sales. The policy does not specify how the subsidy will be funded." },
    { id: "e3", publisher: "FICTIONAL Fiscal Watch", title: "Who pays for the EV push?", sourceType: "analysis", lens: "right",
      text: "Our estimate puts the annual cost at 900 crore rupees, well above the 400 crore figure cited by officials." },
  ],
  claims: [
    { id: "ec1", text: "The draft policy proposes a 15,000 rupee incentive per electric two-wheeler.", claimType: "fact", state: "supported", src: "e1", passage: "The draft policy proposes an incentive of 15,000 rupees per electric two-wheeler" },
    { id: "ec2", text: "The draft targets 500 public charging points by 2028.", claimType: "fact", state: "supported", src: "e1", passage: "500 public charging points by 2028" },
    { id: "ec3", text: "The incentive could double monthly EV sales.", claimType: "forecast", by: "S. Kumar", state: "attributed", src: "e2", passage: "the incentive could double monthly sales" },
    { id: "ec4", text: "The annual cost of the scheme will be 900 crore rupees.", claimType: "forecast", by: "Fiscal Watch", state: "contested", src: "e3", passage: "Our estimate puts the annual cost at 900 crore rupees" },
  ],
  lanes: [
    { lens: "center", sourceIds: ["e2"], summary: "Focuses on industry reaction and the unfunded detail.", emphasizes: ["Sales outlook"], doesNotEstablish: ["Funding source"], claimIds: ["ec3"] },
    { lens: "right", sourceIds: ["e3"], summary: "Frames the policy around fiscal cost.", emphasizes: ["Cost overrun risk"], doesNotEstablish: ["Methodology of the 900 crore estimate"], claimIds: ["ec4"] },
  ],
  assessment: {
    headline: "Draft EV policy offers ₹15,000 per two-wheeler; cost is disputed",
    sections: [
      ["established", "The draft proposes ₹15,000 per e-two-wheeler and 500 chargers by 2028.", ["ec1", "ec2"]],
      ["contested", "The scheme's annual cost is disputed (₹400 crore official vs ₹900 crore estimate).", ["ec4"]],
    ],
  },
  outputs: [
    { id: "ev-script-en", kind: "script", lang: "en", status: "qa", claimIds: ["ec1", "ec2"],
      payload: { title: "Draft EV policy: what's in it", presenter: "arjun-en", lines: [
        { label: "WHAT", text: "A draft policy proposes ₹15,000 per electric two-wheeler.", claimIds: ["ec1"] },
        { label: "CHARGERS", text: "It targets 500 public chargers by 2028.", claimIds: ["ec2"] },
        { label: "DEBATE", text: "The cost is disputed.", claimIds: ["ec4"] },
      ] } },
  ],
});

const water = bundle({
  id: "sample-water-tariff",
  title: "City water board weighs tiered tariff (FICTIONAL SAMPLE)",
  summary: "Research in progress: the water board is reported to be considering a tiered household tariff.",
  region: "IN-MH",
  topics: ["civic", "water"],
  languages: ["en", "hi"],
  status: "researching",
  updatedAt: "2026-10-12T09:05:00Z",
  sources: [
    { id: "w1", publisher: "FICTIONAL Harbour Times", title: "Water board mulls tiered tariff", sourceType: "reporting", lens: "center",
      text: "The water board is considering a three-slab household tariff, two officials said on condition of anonymity." },
  ],
  claims: [
    { id: "wc1", text: "The water board is considering a three-slab household tariff.", claimType: "allegation", by: "Two anonymous officials", state: "unverified", src: "w1", passage: "The water board is considering a three-slab household tariff" },
  ],
});

export const EXTRA_BUNDLES: StoryBundle[] = [heatwave, ev, water];
