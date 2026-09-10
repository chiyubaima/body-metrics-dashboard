import { InputError } from './model.ts';
import type { KnowledgeSource } from './coach-tool-types.ts';

// Only application-owned, general terms cross this boundary. No free-text query.
export const knowledgeTopics = {
  protein: 'protein',
  resistance: 'resistance training',
  aerobic: 'aerobic exercise',
  weight: 'body weight',
  nutrition: 'dietary intake',
  recovery: 'exercise recovery',
  sleep: 'sleep',
  muscle: 'muscle hypertrophy',
  overload: 'progressive overload',
  frequency: 'training frequency',
  warmup: 'warm up exercise',
  sedentary: 'sedentary behavior',
  hydration: 'hydration',
  timing: 'nutrient timing',
  pain: 'exercise musculoskeletal pain',
  waist: 'waist circumference',
  bodyfat: 'body composition',
  stretching: 'stretching',
  energy: 'energy balance',
} as const;
const populations = {
  adults:
    '(TITLE_ABS:"healthy adults" OR TITLE_ABS:"healthy subjects" OR TITLE_ABS:"healthy participants" OR TITLE_ABS:"trained men" OR TITLE_ABS:"trained women")',
  older_adults:
    '(TITLE_ABS:"older adults" OR TITLE_ABS:"older people" OR TITLE_ABS:"elderly")',
  all: '',
} as const;
export const knowledgePopulationLabels = {
  adults: '健康成人关键词',
  older_adults: '老年人关键词',
  all: '不限人群',
} as const;
const plain = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(?:lt|gt|amp|quot|apos);/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
export async function searchKnowledge(
  topics: unknown,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  population: unknown = 'adults',
): Promise<KnowledgeSource[]> {
  if (
    !Array.isArray(topics) ||
    !topics.length ||
    topics.length > 3 ||
    topics.some(
      (t) => typeof t !== 'string' || !Object.hasOwn(knowledgeTopics, t),
    )
  )
    throw new InputError('请选择1～3个支持的通用研究主题。');
  if (typeof population !== 'string' || !Object.hasOwn(populations, population))
    throw new InputError('研究人群需为健康成人、老年人或不限人群。');
  const populationFilter = populations[population as keyof typeof populations];
  const query =
    [...new Set(topics)]
      .map(
        (t, index) =>
          `(${index === 0 ? 'TITLE' : 'TITLE_ABS'}:"${knowledgeTopics[t as keyof typeof knowledgeTopics]}")`,
      )
      .join(' AND ') +
    (populationFilter ? ` AND ${populationFilter}` : '') +
    ' AND SRC:MED AND HAS_ABSTRACT:y AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"guideline")';
  const url = new URL(
    'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
  );
  url.search = new URLSearchParams({
    query,
    format: 'json',
    pageSize: '4',
    resultType: 'core',
  }).toString();
  try {
    const response = await fetcher(url, {
      // Workerd supports manual/follow; the status check below rejects redirects.
      redirect: 'manual',
      signal: AbortSignal.any([
        AbortSignal.timeout(12_000),
        ...(signal ? [signal] : []),
      ]),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let raw = '',
      total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 350_000) throw new Error();
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.resultList?.result)) throw new Error();
    const seen = new Set<string>();
    return parsed.resultList.result
      .slice(0, 4)
      .flatMap((item: Record<string, unknown>) => {
        const id =
            typeof item.id === 'string' || typeof item.id === 'number'
              ? String(item.id)
              : '',
          title = plain(item.title, 400),
          abstract = plain(item.abstractText, 5000);
        if (
          item.source !== 'MED' ||
          !/^\d{1,10}$/.test(id) ||
          !title ||
          !abstract ||
          seen.has(id)
        )
          return [];
        seen.add(id);
        const journalInfo = item.journalInfo as
          | { journal?: { title?: string } }
          | undefined;
        return [
          {
            id: `pubmed:${id}`,
            title,
            abstract,
            year: plain(
              typeof item.pubYear === 'number'
                ? String(item.pubYear)
                : item.pubYear,
              4,
            ),
            journal: plain(journalInfo?.journal?.title, 200),
            url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
            coverage: 'abstract' as const,
          },
        ];
      });
  } catch {
    throw new InputError(
      '研究来源暂时连接不上。可以重试这条消息；本次没有查到可引用资料。',
    );
  }
}
