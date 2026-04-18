export type SourceMeta = {
  country: string;
  flag: string;
  wikipedia: string;
};

const META: Record<string, SourceMeta> = {
  'tass.com':             { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/TASS' },
  'en.kremlin.ru':        { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/Kremlin' },
  'kremlin.ru':           { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/Kremlin' },
  'english.news.cn':      { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/Xinhua_News_Agency' },
  'en.people.cn':         { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/People%27s_Daily' },
  'www.globaltimes.cn':   { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/Global_Times' },
  'www.chinadaily.com.cn':{ country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/China_Daily' },
  'www.presstv.ir':       { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Press_TV' },
  'www.tehrantimes.com':  { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Tehran_Times' },
  'en.granma.cu':         { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Granma_(newspaper)' },
  'www.cubadebate.cu':    { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Cubadebate' },
  'www.prensa-latina.cu': { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Prensa_Latina' },
  'sana.sy':              { country: 'Syria',         flag: '🇸🇾', wikipedia: 'https://en.wikipedia.org/wiki/Syrian_Arab_News_Agency' },
  'magyarnemzet.hu':      { country: 'Hungary',       flag: '🇭🇺', wikipedia: 'https://en.wikipedia.org/wiki/Magyar_Nemzet' },
  'pestisracok.hu':       { country: 'Hungary',       flag: '🇭🇺', wikipedia: 'https://en.wikipedia.org/wiki/Pesti_Sr%C3%A1cok' },
  'hirado.hu':            { country: 'Hungary',       flag: '🇭🇺', wikipedia: 'https://en.wikipedia.org/wiki/MTVA' },
  'www.aljazeera.com':    { country: 'Qatar',         flag: '🇶🇦', wikipedia: 'https://en.wikipedia.org/wiki/Al_Jazeera' },
  'saudigazette.com.sa':  { country: 'Saudi Arabia',  flag: '🇸🇦', wikipedia: 'https://en.wikipedia.org/wiki/Saudi_Gazette' },
  'www.middleeasteye.net':{ country: 'UK',            flag: '🇬🇧', wikipedia: 'https://en.wikipedia.org/wiki/Middle_East_Eye' },
  'www.saba.ye':          { country: 'Yemen',         flag: '🇾🇪', wikipedia: 'https://en.wikipedia.org/wiki/Saba_News_Agency' },
  'www.gnlm.com.mm':      { country: 'Myanmar',       flag: '🇲🇲', wikipedia: 'https://en.wikipedia.org/wiki/Global_New_Light_of_Myanmar' },
  'shabait.com':          { country: 'Eritrea',       flag: '🇪🇷', wikipedia: 'https://en.wikipedia.org/wiki/Eritrean_Ministry_of_Information' },
  'tdh.gov.tm':           { country: 'Turkmenistan',  flag: '🇹🇲', wikipedia: 'https://en.wikipedia.org/wiki/Turkmenistan_today_(newspaper)' },
  'spsrasd.info':         { country: 'Western Sahara',flag: '🏴', wikipedia: 'https://en.wikipedia.org/wiki/Sahrawi_Arab_Democratic_Republic' },
  'www.foxnews.com':      { country: 'USA',           flag: '🇺🇸', wikipedia: 'https://en.wikipedia.org/wiki/Fox_News' },
};

export function getSourceMeta(url: string): SourceMeta | null {
  try {
    const hostname = new URL(url).hostname;
    return META[hostname] ?? null;
  } catch {
    return null;
  }
}
