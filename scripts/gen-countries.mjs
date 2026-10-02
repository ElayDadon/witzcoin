import fs from 'fs';

// ISO-3166-1 alpha-2 -> ISO-4217 currency
const CUR = `AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN
BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BM:BMD BN:BND BO:BOB BQ:USD BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD
CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:XCG CY:EUR CZ:CZK
DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB
FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD
HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR
JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD KZ:KZT
LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD
MA:MAD MC:EUR MD:MDL ME:EUR MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN
NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD
OM:OMR PA:PAB PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PR:USD PS:ILS PT:EUR PW:USD PY:PYG
QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF
SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SX:XCG SY:SYP SZ:SZL
TC:USD TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD TZ:TZS
UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF WS:WST
XK:EUR YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG`
  .split(/\s+/).filter(Boolean)
  .reduce((m, p) => { const [k, v] = p.split(':'); m[k] = v; return m; }, {});

const he = new Intl.DisplayNames(['he'], { type: 'region' });
const en = new Intl.DisplayNames(['en'], { type: 'region' });

const flag = (cc) => String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));

const rows = Object.keys(CUR).sort().map(cc => {
  const nameHe = he.of(cc);
  const nameEn = en.of(cc);
  if (!nameHe || nameHe === cc) return null;
  return { code: cc, he: nameHe, en: nameEn, flag: flag(cc), currency: CUR[cc] };
}).filter(Boolean);

// Most common Israeli travel destinations float to the top of the picker
const POPULAR = ['GR','IT','TH','US','FR','ES','GE','CY','TR','GB','NL','PT','JP','VN','AE','CZ','DE','HU','AL','ME'];

const out = `// AUTO-GENERATED — do not edit by hand. See scripts/gen-countries.mjs
export type Country = {
  code: string;   // ISO 3166-1 alpha-2
  he: string;     // Hebrew name
  en: string;     // English name
  flag: string;   // emoji flag
  currency: string; // default ISO 4217 currency
};

export const POPULAR_COUNTRIES = ${JSON.stringify(POPULAR)};

export const COUNTRIES: Country[] = [
${rows.map(r => `  { code: '${r.code}', he: ${JSON.stringify(r.he)}, en: ${JSON.stringify(r.en)}, flag: '${r.flag}', currency: '${r.currency}' },`).join('\n')}
];

export const COUNTRY_BY_CODE: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

/** Countries ordered for the picker: popular destinations first, then Hebrew alphabetical. */
export function orderedCountries(): Country[] {
  const pop = POPULAR_COUNTRIES.map((c) => COUNTRY_BY_CODE[c]).filter(Boolean);
  const rest = COUNTRIES.filter((c) => !POPULAR_COUNTRIES.includes(c.code))
    .sort((a, b) => a.he.localeCompare(b.he, 'he'));
  return [...pop, ...rest];
}

/** Free-text search over Hebrew name, English name and country code. */
export function searchCountries(q: string): Country[] {
  const s = q.trim().toLowerCase();
  if (!s) return orderedCountries();
  return orderedCountries().filter(
    (c) =>
      c.he.includes(s) ||
      c.en.toLowerCase().includes(s) ||
      c.code.toLowerCase() === s
  );
}
`;

fs.mkdirSync('/home/claude/witzcoin/src/lib', { recursive: true });
fs.writeFileSync('/home/claude/witzcoin/src/lib/countries.ts', out);
console.log('countries:', rows.length);
console.log('sample:', rows.filter(r=>['IL','GR','JP','GE'].includes(r.code)).map(r=>`${r.flag} ${r.he} (${r.currency})`).join(' | '));
