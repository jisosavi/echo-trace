export type SourceMeta = {
  country: string;
  flag: string;
  wikipedia: string;
};

const META: Record<string, SourceMeta> = {
  // State media
  'tass.com':              { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/TASS' },
  'en.kremlin.ru':         { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/Kremlin' },
  'kremlin.ru':            { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/Kremlin' },
  'government.ru':         { country: 'Russia',        flag: '🇷🇺', wikipedia: 'https://en.wikipedia.org/wiki/Government_of_Russia' },
  'english.news.cn':       { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/Xinhua_News_Agency' },
  'en.people.cn':          { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/People%27s_Daily' },
  'www.globaltimes.cn':    { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/Global_Times' },
  'www.chinadaily.com.cn': { country: 'China',         flag: '🇨🇳', wikipedia: 'https://en.wikipedia.org/wiki/China_Daily' },
  'kcna.kp':               { country: 'North Korea',   flag: '🇰🇵', wikipedia: 'https://en.wikipedia.org/wiki/Korean_Central_News_Agency' },
  'www.presstv.ir':        { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Press_TV' },
  'presstv.co.uk':         { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Press_TV' },
  'www.presstv.co.uk':     { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Press_TV' },
  'www.tehrantimes.com':   { country: 'Iran',          flag: '🇮🇷', wikipedia: 'https://en.wikipedia.org/wiki/Tehran_Times' },
  'en.granma.cu':          { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Granma_(newspaper)' },
  'www.cubadebate.cu':     { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Cubadebate' },
  'www.prensa-latina.cu':  { country: 'Cuba',          flag: '🇨🇺', wikipedia: 'https://en.wikipedia.org/wiki/Prensa_Latina' },
  'www.spa.gov.sa':        { country: 'Saudi Arabia',  flag: '🇸🇦', wikipedia: 'https://en.wikipedia.org/wiki/Saudi_Press_Agency' },
  'eng.belta.by':          { country: 'Belarus',       flag: '🇧🇾', wikipedia: 'https://en.wikipedia.org/wiki/Belarusian_Telegraph_Agency' },
  'www.sb.by':             { country: 'Belarus',       flag: '🇧🇾', wikipedia: 'https://en.wikipedia.org/wiki/SB._Belarus_Segodnya' },
  'shabait.com':           { country: 'Eritrea',       flag: '🇪🇷', wikipedia: 'https://en.wikipedia.org/wiki/Ministry_of_Information_(Eritrea)' },
  'tdh.gov.tm':            { country: 'Turkmenistan',  flag: '🇹🇲', wikipedia: 'https://en.wikipedia.org/wiki/Turkmenistan_State_News_Agency' },
  'www.gnlm.com.mm':       { country: 'Myanmar',       flag: '🇲🇲', wikipedia: 'https://en.wikipedia.org/wiki/Global_New_Light_of_Myanmar' },
  'eng.khovar.tj':         { country: 'Tajikistan',    flag: '🇹🇯', wikipedia: 'https://en.wikipedia.org/wiki/Khovar' },
  'eswatiniobserver.com':  { country: 'Eswatini',      flag: '🇸🇿', wikipedia: 'https://en.wikipedia.org/wiki/Eswatini_Observer' },
  // Control corpus
  'www.bbc.co.uk':         { country: 'United Kingdom', flag: '🇬🇧', wikipedia: 'https://en.wikipedia.org/wiki/BBC_News' },
  'yle.fi':                { country: 'Finland',       flag: '🇫🇮', wikipedia: 'https://en.wikipedia.org/wiki/Yle' },
  'www.svt.se':            { country: 'Sweden',        flag: '🇸🇪', wikipedia: 'https://en.wikipedia.org/wiki/Sveriges_Television' },
  'www.dw.com':            { country: 'Germany',       flag: '🇩🇪', wikipedia: 'https://en.wikipedia.org/wiki/Deutsche_Welle' },
  'nos.nl':                { country: 'Netherlands',   flag: '🇳🇱', wikipedia: 'https://en.wikipedia.org/wiki/Nederlandse_Omroep_Stichting' },
  'www.rfi.fr':            { country: 'France',        flag: '🇫🇷', wikipedia: 'https://en.wikipedia.org/wiki/Radio_France_Internationale' },
};

export function getSourceMeta(url: string): SourceMeta | null {
  try {
    const hostname = new URL(url).hostname;
    return META[hostname] ?? null;
  } catch {
    return null;
  }
}
