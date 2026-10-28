#!/usr/bin/env node
// trove 0.5.6: bundled CLI and engine (@trove/core, marked). Node 22+, no dependencies.

// bin/trove.mjs
import { existsSync as existsSync4, realpathSync as realpathSync4 } from "node:fs";
import { basename as basename5, dirname as dirname3, join as join5, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// ../core/src/types.ts
var DEFAULT_DOC_TYPES = [
  { id: "md", label: "Markdown", extensions: [".md", ".markdown"], kind: "markdown", enabled: true },
  { id: "html", label: "HTML", extensions: [".html", ".htm"], kind: "html", enabled: true },
  { id: "mdx", label: "MDX", extensions: [".mdx"], kind: "markdown", enabled: false },
  { id: "txt", label: "Plain text", extensions: [".txt"], kind: "text", enabled: false }
];
var DEFAULT_SETTINGS = {
  types: {},
  exclude: [],
  theme: "system",
  scope: "uncommitted",
  base: null,
  showNew: true
};
var AGENT_LABELS = { claude: "Claude", codex: "Codex", other: "the agent" };

// ../core/src/app.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, realpathSync as realpathSync2, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { createServer, request } from "node:http";
import { randomUUID } from "node:crypto";
import { basename as basename3, dirname as dirname2, extname, join as join3, relative, resolve, sep } from "node:path";

// ../core/src/vendor/marked.esm.mjs
function I() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var y = I();
function W(l3) {
  y = l3;
}
var A = { exec: () => null };
function C(l3) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
    return s || (s = l3(n), e[n] = s), s;
  };
}
function h(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
    let o = typeof r == "string" ? r : r.source;
    return o = o.replace(x.caret, "$1"), t = t.replace(s, o), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var _e = ((l3 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l3);
  } catch {
    return false;
  }
})();
var x = { codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, endingSpaceTabChar: /[ \t]$/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, leadingSpaceTab: /^[ \t]+/, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/g, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: C((l3) => new RegExp(`^ {0,${l3}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: C((l3) => new RegExp(`^ {0,${l3}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)), fencesBeginRegex: C((l3) => new RegExp(`^ {0,${l3}}(?:\`\`\`|~~~)`)), headingBeginRegex: C((l3) => new RegExp(`^ {0,${l3}}#`)), htmlBeginRegex: C((l3) => new RegExp(`^ {0,${l3}}(?:</?(?:${N})(?: +|$|/?>)|<(?:script|pre|style|textarea|!--))`, "i")), blockquoteBeginRegex: C((l3) => new RegExp(`^ {0,${l3}}>`)) };
var $e = /^(?:[ \t]*(?:\n|$))+/;
var Le = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var ze = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var G = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var Ae = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var J = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var ce = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var he = h(ce).replace(/bull/g, J).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Ee = h(ce).replace(/bull/g, J).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/hr/g, / {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var V = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
var Me = /^[^\n]+/;
var Y = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Ie = h(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", Y).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var Ce = h(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, J).getRegex();
var N = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var ee = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var Be = h("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", ee).replace("tag", N).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var de = (l3) => h(V).replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", l3).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex();
var De = de(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/);
var qe = de(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
var ve = h(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", qe).getRegex();
var te = { blockquote: ve, code: Le, def: Ie, fences: ze, heading: Ae, hr: G, html: Be, lheading: he, list: Ce, newline: $e, paragraph: De, table: A, text: Me };
var le = h("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex();
var Ze = { ...te, lheading: Ee, table: le, paragraph: h(V).replace("hr", G).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", le).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", N).getRegex() };
var He = { ...te, html: h(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", ee).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: A, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: h(V).replace("hr", G).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", he).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ge = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ne = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var ke = /^( {2,}|\\)\n(?!\s*$)[ \t]*/;
var Qe = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var $ = /[\p{P}\p{S}]/u;
var B = /[\s\p{P}\p{S}]/u;
var Q = /[^\s\p{P}\p{S}]/u;
var je = h(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, B).getRegex();
var Fe = /[\p{Pi}\p{Ps}"']/u;
var ge = /(?!~)[\p{P}\p{S}]/u;
var Ue = /(?!~)[\s\p{P}\p{S}]/u;
var Ke = /(?:[^\s\p{P}\p{S}]|~)/u;
var We = h(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", _e ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var fe = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var Xe = h(fe, "u").replace(/punct/g, $).getRegex();
var Je = h(fe, "u").replace(/punct/g, ge).getRegex();
var Ve = /^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/;
var Ye = h(Ve, "u").replace(/openQuote/g, Fe).replace(/punct/g, $).getRegex();
var me = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var et = h(me, "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
var tt = h(me, "gu").replace(/notPunctSpace/g, Ke).replace(/punctSpace/g, Ue).replace(/punct/g, ge).getRegex();
var nt = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)";
var rt = h(nt, "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
var st = h("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
var it = "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)";
var ot = h(it, "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
var at = h(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, $).getRegex();
var lt = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var ut = h(lt, "gu").replace(/notPunctSpace/g, Q).replace(/punctSpace/g, B).replace(/punct/g, $).getRegex();
var pt = h(/\\(punct)/, "gu").replace(/punct/g, $).getRegex();
var ct = h(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var ht = h(ee).replace("(?:-->|$)", "-->").getRegex();
var dt = h("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", ht).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var xe = /\[(?:\\[\s\S]|[^\[\]\\])*\]/;
var U = h(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace("brackets", xe).getRegex();
var kt = h(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", U).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var gt = h(/^!?\[(label)\]\[(ref)\]/).replace("label", U).replace("ref", Y).getRegex();
var ft = h(/^!?\[(ref)\](?:\[\])?/).replace("ref", Y).getRegex();
var ue = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/;
var mt = h(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace("brackets", xe).getRegex();
var xt = h("reflink|nolink(?!\\()", "g").replace("reflink", h(/^!?\[(label)\]\[(ref)\]/).replace("label", mt).replace("ref", ue).getRegex()).replace("nolink", h(/^!?\[(ref)\](?:\[\])?/).replace("ref", ue).getRegex()).getRegex();
var pe = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var bt = /[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/;
var Rt = h(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g, bt).getRegex();
var ne = { _backpedal: A, anyPunctuation: pt, autolink: ct, blockSkip: We, br: ke, code: Ne, del: A, delLDelim: A, delRDelim: A, emStrongLDelim: Xe, emStrongRDelimAst: et, emStrongRDelimUnd: st, escape: Ge, link: kt, nolink: ft, punctuation: je, reflink: gt, reflinkSearch: xt, tag: dt, text: Qe, url: A };
var Tt = { ...ne, emStrongLDelim: Ye, emStrongRDelimAst: rt, emStrongRDelimUnd: ot, link: h(/^!?\[(label)\]\((.*?)\)/).replace("label", U).getRegex(), reflink: h(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", U).getRegex() };
var X = { ...ne, emStrongRDelimAst: tt, emStrongLDelim: Je, delLDelim: at, delRDelim: ut, url: h(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("emailProtocol", Rt).replace("protocol", pe).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: h(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace("protocol", pe).replace(/emailProtocol/g, /(?:mailto|xmpp):/).getRegex() };
var Ot = { ...X, br: h(ke).replace("{2,}", "*").getRegex(), text: h(X.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var j = { normal: te, gfm: Ze, pedantic: He };
var D = { normal: ne, gfm: X, breaks: Ot, pedantic: Tt };
var wt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var be = (l3) => wt[l3];
function O(l3, e) {
  if (e) {
    if (x.escapeTest.test(l3)) return l3.replace(x.escapeReplace, be);
  } else if (x.escapeTestNoEncode.test(l3)) return l3.replace(x.escapeReplaceNoEncode, be);
  return l3;
}
function Re(l3) {
  return l3.replace(x.numericCharacterReference, (e, t, n) => {
    let s = t === void 0 ? Number.parseInt(n, 16) : Number.parseInt(t, 10);
    return s === 0 || s > 1114111 || s >= 55296 && s <= 57343 ? "\uFFFD" : String.fromCodePoint(s);
  });
}
function re(l3) {
  try {
    l3 = encodeURI(l3).replace(x.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function se(l3, e) {
  let t = l3.replace(x.findPipe, (r, o, i) => {
    let u = false, a = o;
    for (; --a >= 0 && i[a] === "\\"; ) u = !u;
    return u ? "|" : " |";
  }), n = t.split(x.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; s < n.length; s++) n[s] = n[s].trim().replace(x.slashPipe, "|");
  return n;
}
function L(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let s = 0;
  for (; s < n; ) {
    let r = l3.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return l3.slice(0, n - s);
}
function ie(l3) {
  let e = l3.split(`
`), t = e.length - 1;
  for (; t >= 0 && x.blankLine.test(e[t]); ) t--;
  return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
}
function q(l3) {
  return l3.trim().toLowerCase().toUpperCase().toLowerCase();
}
function Te(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function oe(l3, e = 0) {
  let t = e, n = "";
  for (let s of l3) if (s === "	") {
    let r = 4 - t % 4;
    n += " ".repeat(r), t += r;
  } else n += s, t++;
  return n;
}
function Oe(l3, e, t, n, s) {
  let r = e.href, o = e.title || null, i = l3[1].replace(s.other.outputLinkReplace, "$1"), u = l3[0].charAt(0) === "!";
  n.state.inLink = true;
  let a = n.state.linkEmitted, p = n.state.inRawBlock;
  n.state.linkEmitted = false;
  let c = n.inlineTokens(i), d = n.state.linkEmitted;
  if (n.state.linkEmitted = a, n.state.inLink = false, !u) {
    if (d) {
      n.state.inRawBlock = p;
      return;
    }
    n.state.linkEmitted = true;
  }
  return { type: u ? "image" : "link", raw: t, href: r, title: o, text: i, tokens: c };
}
function yt(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let o = r.match(t.other.beginningSpace);
    if (o === null) return r;
    let [i] = o;
    return r.slice(Math.min(i.length, s.length));
  }).join(`
`);
}
function we(l3, e, t, n) {
  if (!e.includes("<")) return false;
  for (let s = 0; s < e.length; s++) {
    if (e[s] === "\\") {
      s++;
      continue;
    }
    if (e[s] === "`") {
      let i = n.inline.code.exec(e.slice(s));
      if (i) {
        s += i[0].length - 1;
        continue;
      }
    }
    if (e[s] !== "<") continue;
    let r = l3.slice(t + s), o = n.inline.tag.exec(r) || n.inline.autolink.exec(r);
    if (o) {
      if (o[0].length > e.length - s) return true;
      s += o[0].length - 1;
    }
  }
  return false;
}
var P = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || y;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : ie(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = yt(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = L(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceTabChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: L(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: L(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = L(t[0], `
`).split(`
`), s = "", r = "", o = [];
      for (; n.length > 0; ) {
        let i = false, u = [], a;
        for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), i = true;
        else if (!i) u.push(n[a]);
        else break;
        n = n.slice(a);
        let p = u.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${p}` : p, r = r ? `${r}
${c}` : c;
        let d = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, o, true), this.lexer.state.top = d, n.length === 0) break;
        let m = o.at(-1);
        if (m?.type === "code") break;
        if (m?.type === "blockquote") {
          let b = m, g = n.join(`
`), w = b.raw + `
` + g.replace(this.rules.other.blockquoteSetextReplace2, ""), f = this.blockquote(w);
          o[o.length - 1] = f;
          let M = w.substring(f.raw.length).replace(/^\n/, ""), v = M ? M.split(`
`).length : 0, Z = v ? n.slice(0, -v) : n;
          Z.length > 0 && (s = `${s}
${Z.join(`
`)}`), r = r.substring(0, r.length - b.text.length) + f.text;
          break;
        } else if (m?.type === "list") {
          let b = m, g = b.raw + `
` + n.join(`
`), w = this.list(g);
          o[o.length - 1] = w, s = s.substring(0, s.length - m.raw.length) + w.raw, r = r.substring(0, r.length - b.raw.length) + w.raw, n = g.substring(o.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: o, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let o = this.rules.other.listItemRegex(n), i = false;
      for (; e; ) {
        let a = false, p = "", c = "";
        if (!(t = o.exec(e)) || this.rules.block.hr.test(e)) break;
        p = t[0], e = e.substring(p.length);
        let d = t[2].split(`
`, 1)[0], m = t[1].length, b = this.options.pedantic ? oe(d, m) : d.replace(this.rules.other.leadingSpaceTab, (M) => oe(M, m)), g = e.split(`
`, 1)[0], w = !b.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = b.trimStart()) : w ? f = m + 1 : (f = b.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = b.slice(f), f += m), w && this.rules.other.blankLine.test(g) && (p += g + `
`, e = e.substring(g.length + 1), a = true), !a) {
          let M = this.rules.other.nextBulletRegex(f), v = this.rules.other.hrRegex(f), Z = this.rules.other.fencesBeginRegex(f), ae = this.rules.other.headingBeginRegex(f), ye = this.rules.other.htmlBeginRegex(f), Pe = this.rules.other.blockquoteBeginRegex(f);
          for (; e; ) {
            let K = e.split(`
`, 1)[0], H;
            if (g = K, this.options.pedantic ? (g = g.replace(this.rules.other.listReplaceNesting, "  "), H = g) : H = g.replace(this.rules.other.leadingSpaceTab, (Se) => Se.replace(this.rules.other.tabCharGlobal, "    ")), Z.test(g) || ae.test(g) || ye.test(g) || Pe.test(g) || M.test(g) || v.test(g)) break;
            if (H.search(this.rules.other.nonSpaceChar) >= f || !g.trim()) c += `
` + H.slice(f);
            else {
              if (w || b.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || Z.test(b) || ae.test(b) || v.test(b)) break;
              c += `
` + g;
            }
            w = !g.trim(), p += K + `
`, e = e.substring(K.length + 1), b = H.slice(f);
          }
        }
        r.loose || (i ? r.loose = true : this.rules.other.doubleBlankLine.test(p) && (i = true)), r.items.push({ type: "list_item", raw: p, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), r.raw += p;
      }
      let u = r.items.at(-1);
      if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
      else return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) if (this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []), !r.loose) {
        let p = a.tokens.filter((d) => d.type === "space"), c = p.length > 0 && p.some((d) => this.rules.other.anyLine.test(d.raw));
        r.loose = c;
      }
      for (let a of r.items) {
        let p = a.tokens[0];
        if (a.task && (p?.type === "text" || p?.type === "paragraph")) {
          a.text = a.text.replace(this.rules.other.listReplaceTask, ""), p.raw = p.raw.replace(this.rules.other.listReplaceTask, ""), p.text = p.text.replace(this.rules.other.listReplaceTask, "");
          for (let d = this.lexer.inlineQueue.length - 1; d >= 0; d--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[d].src)) {
            this.lexer.inlineQueue[d].src = this.lexer.inlineQueue[d].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let c = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (c) {
            let d = { type: "checkbox", raw: c[0] + " ", checked: c[0] !== "[ ]" };
            a.checked = d.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = d.raw + a.tokens[0].raw, a.tokens[0].text = d.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(d)) : a.tokens.unshift({ type: "paragraph", raw: d.raw, text: d.raw, tokens: [d] }) : a.tokens.unshift(d);
          }
        } else a.task && (a.task = false);
      }
      if (r.loose) for (let a of r.items) {
        a.loose = true;
        for (let p of a.tokens) p.type === "text" && (p.type = "paragraph");
      }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = ie(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = q(t[1]).replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: L(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = se(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], o = { type: "table", raw: L(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let i of s) this.rules.other.tableAlignRight.test(i) ? o.align.push("right") : this.rules.other.tableAlignCenter.test(i) ? o.align.push("center") : this.rules.other.tableAlignLeft.test(i) ? o.align.push("left") : o.align.push(null);
      for (let i = 0; i < n.length; i++) o.header.push({ text: n[i], tokens: this.lexer.inline(n[i]), header: true, align: o.align[i] });
      for (let i of r) o.rows.push(se(i, o.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: o.align[a] })));
      return o;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: L(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[0].charAt(0) === "!" ? 2 : 1;
      if (!this.options.pedantic && we(e, t[1], n, this.rules)) return;
      let s = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(s)) {
        if (!this.rules.other.endAngleBracket.test(s)) return;
        let i = L(s.slice(0, -1), "\\");
        if ((s.length - i.length) % 2 === 0) return;
      } else {
        let i = Te(t[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let a = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
          t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, a).trim(), t[3] = "";
        }
      }
      let r = t[2], o = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(r);
        i && (r = i[1], o = i[3]);
      } else o = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(s) ? r = r.slice(1) : r = r.slice(1, -1)), Oe(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: o && o.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = n[0].charAt(0) === "!" ? 2 : 1;
      if (!this.options.pedantic && we(e, n[1], s, this.rules)) return;
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), o = t[q(r)];
      if (!o) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return Oe(n, o, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let o = [...s[0]].length - 1, i, u, a = o, p = 0, c = s[0][0], d = n === c, m = c === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (m.lastIndex = 0, t = t.slice(-1 * e.length + o); (s = m.exec(t)) !== null; ) {
        if (i = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !i) continue;
        if (u = [...i].length, s[3] || s[4]) {
          a += u;
          continue;
        } else if (s[5] || s[6]) {
          if (o % 3 && !((o + u) % 3)) {
            p += u;
            continue;
          }
          if (d) break;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a + p);
        let b = [...s[0]][0].length, g = e.slice(0, o + s.index + b + u);
        if (Math.min(o, u) % 2) {
          let f = g.slice(1, -1);
          return { type: "em", raw: g, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let w = g.slice(2, -2);
        return { type: "strong", raw: g, text: w, tokens: this.lexer.inlineTokens(w) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s) return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let o = [...s[0]].length - 1, i, u, a = o, p = this.rules.inline.delRDelim;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + o); (s = p.exec(t)) !== null; ) {
        if (i = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !i || (u = [...i].length, u !== o)) continue;
        if (s[3] || s[4]) {
          a += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a);
        let c = [...s[0]][0].length, d = e.slice(0, o + s.index + c + u), m = d.slice(o, -o);
        return { type: "del", raw: d, text: m, tokens: this.lexer.inlineTokens(m) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, autolink: true, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@") n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, autolink: true, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: n ? t[0] : Re(t[0]), escaped: n };
    }
  }
};
var R = class l {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || y, this.options.tokenizer = this.options.tokenizer || new P(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, linkEmitted: false, top: true };
    let t = { other: x, block: j.normal, inline: D.normal };
    this.options.pedantic ? (t.block = j.pedantic, t.inline = D.pedantic) : this.options.gfm && (t.block = j.gfm, this.options.breaks ? t.inline = D.breaks : t.inline = D.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: j, inline: D };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(x.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(x.tabCharGlobal, "    ").replace(x.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((i) => (r = i.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let i = t.at(-1);
        r.raw.length === 1 && i !== void 0 ? i.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let i = t.at(-1);
        i?.type === "paragraph" || i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.at(-1).src = i.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let i = t.at(-1);
        i?.type === "paragraph" || i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.raw, this.inlineQueue.at(-1).src = i.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let o = e;
      if (this.options.extensions?.startBlock) {
        let i = 1 / 0, u = e.slice(1), a;
        this.options.extensions.startBlock.forEach((p) => {
          a = p.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (i = Math.min(i, a));
        }), i < 1 / 0 && i >= 0 && (o = e.substring(0, i + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(o))) {
        let i = t.at(-1);
        n && i?.type === "paragraph" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = i.text) : t.push(r), n = o.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let i = t.at(-1);
        i?.type === "text" ? (i.raw += (i.raw.endsWith(`
`) ? "" : `
`) + r.raw, i.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = i.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  linkInText(e) {
    if (!e.includes("[")) return false;
    let t = this.tokenizer.rules.inline.link;
    for (let n of e.matchAll(this.tokenizer.rules.inline.blockSkip)) if (t.test(n[0]) && e.charAt(n.index - 1) !== "!") return true;
    for (let n of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)) {
      let s = n[0], r = s.lastIndexOf("[");
      if (!(s.charAt(0) === "!" || !Object.hasOwn(this.tokens.links, q(s.slice(r + 1, -1)))) && !(r > 1 && this.linkInText(s.slice(1, r - 1)))) return true;
    }
    return false;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e;
    if (this.tokens.links && e.includes("[")) {
      let i = this.tokenizer.rules.inline.reflinkSearch, u = (a) => {
        let p = a.lastIndexOf("[");
        if (!Object.hasOwn(this.tokens.links, q(a.slice(p + 1, -1)))) return a;
        if (p > 1 && a.charAt(0) !== "!") {
          let c = a.slice(1, p - 1);
          if (this.linkInText(c)) return "[" + c.replace(i, u) + "][" + "a".repeat(a.length - p - 2) + "]";
        }
        return "[" + "a".repeat(a.length - 2) + "]";
      };
      n = n.replace(i, u);
    }
    n = n.replace(this.tokenizer.rules.inline.anyPunctuation, (i) => "+".repeat(i.length)), n = n.replace(this.tokenizer.rules.inline.blockSkip, (i, u, a) => {
      let p = a ? a.length : 0;
      return i.slice(0, p) + "[" + "a".repeat(i.length - p - 2) + "]";
    }), n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, r = "", o = 1 / 0;
    for (; e; ) {
      if (e.length < o) o = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      s || (r = ""), s = false;
      let i;
      if (this.options.extensions?.inline?.some((a) => (i = a.call({ lexer: this }, e, t)) ? (e = e.substring(i.raw.length), t.push(i), true) : false)) continue;
      if (i = this.tokenizer.escape(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.tag(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.link(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(i.raw.length);
        let a = t.at(-1);
        i.type === "text" && a?.type === "text" ? (a.raw += i.raw, a.text += i.text) : t.push(i);
        continue;
      }
      if (i = this.tokenizer.emStrong(e, n, r)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.codespan(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.br(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.del(e, n, r)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (i = this.tokenizer.autolink(e)) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      if (!this.state.inLink && (i = this.tokenizer.url(e))) {
        e = e.substring(i.raw.length), t.push(i);
        continue;
      }
      let u = e;
      if (this.options.extensions?.startInline) {
        let a = 1 / 0, p = e.slice(1), c;
        this.options.extensions.startInline.forEach((d) => {
          c = d.call({ lexer: this }, p), typeof c == "number" && c >= 0 && (a = Math.min(a, c));
        }), a < 1 / 0 && a >= 0 && (u = e.substring(0, a + 1));
      }
      if (i = this.tokenizer.inlineText(u)) {
        e = e.substring(i.raw.length), i.raw.slice(-1) !== "_" && (r = i.raw.slice(-1)), s = true;
        let a = t.at(-1);
        a?.type === "text" ? (a.raw += i.raw, a.text += i.text) : t.push(i);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(t);
    else throw new Error(t);
  }
};
var S = class {
  options;
  parser;
  constructor(e) {
    this.options = e || y;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(x.notSpaceStart)?.[0], r = e ? e.replace(x.endingNewline, "") + `
` : "";
    return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, s = "";
    for (let i = 0; i < e.items.length; i++) {
      let u = e.items[i];
      s += this.listitem(u);
    }
    let r = t ? "ol" : "ul", o = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + o + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0; r < e.rows.length; r++) {
      let o = e.rows[r];
      n = "";
      for (let i = 0; i < o.length; i++) n += this.tablecell(o[i]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, text: n, tokens: s, autolink: r }) {
    let o = r ? O(n, true) : this.parser.parseInline(s), i = re(e);
    if (i === null) return o;
    e = O(i, r);
    let u = '<a href="' + e + '"';
    return t && (u += ' title="' + O(t) + '"'), u += ">" + o + "</a>", u;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = re(e);
    if (r === null) return O(n);
    e = r;
    let o = `<img src="${O(e)}" alt="${O(n)}"`;
    return t && (o += ` title="${O(t)}"`), o += ">", o;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
  }
};
var z = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var T = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || y, this.options.renderer = this.options.renderer || new S(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new z();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let o = s, i = this.options.extensions.renderers[o.type].call({ parser: this }, o);
        if (i !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "checkbox", "html", "def", "paragraph", "text"].includes(o.type)) {
          t += i || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let o = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0; s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let i = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (i !== false || !["escape", "html", "link", "image", "checkbox", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += i || "";
          continue;
        }
      }
      let o = r;
      switch (o.type) {
        case "escape": {
          n += t.text(o);
          break;
        }
        case "html": {
          n += t.html(o);
          break;
        }
        case "link": {
          n += t.link(o);
          break;
        }
        case "image": {
          n += t.image(o);
          break;
        }
        case "checkbox": {
          n += t.checkbox(o);
          break;
        }
        case "strong": {
          n += t.strong(o);
          break;
        }
        case "em": {
          n += t.em(o);
          break;
        }
        case "codespan": {
          n += t.codespan(o);
          break;
        }
        case "br": {
          n += t.br(o);
          break;
        }
        case "del": {
          n += t.del(o);
          break;
        }
        case "text": {
          n += t.text(o);
          break;
        }
        default: {
          let i = 'Token with "' + o.type + '" type was not found.';
          if (this.options.silent) return console.error(i), "";
          throw new Error(i);
        }
      }
    }
    return n;
  }
};
var _ = class {
  options;
  block;
  constructor(e) {
    this.options = e || y;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? R.lex : R.lexInline;
  }
  provideParser(e = this.block) {
    return e ? T.parse : T.parseInline;
  }
};
var F = class {
  defaults = I();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = T;
  Renderer = S;
  TextRenderer = z;
  Lexer = R;
  Tokenizer = P;
  Hooks = _;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
      case "table": {
        let r = s;
        for (let o of r.header) n = n.concat(this.walkTokens(o.tokens, t));
        for (let o of r.rows) for (let i of o) n = n.concat(this.walkTokens(i.tokens, t));
        break;
      }
      case "list": {
        let r = s;
        n = n.concat(this.walkTokens(r.items, t));
        break;
      }
      default: {
        let r = s;
        this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((o) => {
          let i = r[o].flat(1 / 0);
          n = n.concat(this.walkTokens(i, t));
        }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name) throw new Error("extension name required");
        if ("renderer" in r) {
          let o = t.renderers[r.name];
          o ? t.renderers[r.name] = function(...i) {
            let u = r.renderer.apply(this, i);
            return u === false && (u = o.apply(this, i)), u;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let o = t[r.level];
          o ? o.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new S(this.defaults);
        for (let o in n.renderer) {
          if (!(o in r)) throw new Error(`renderer '${o}' does not exist`);
          if (["options", "parser"].includes(o)) continue;
          let i = o, u = n.renderer[i], a = r[i];
          r[i] = (...p) => {
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new P(this.defaults);
        for (let o in n.tokenizer) {
          if (!(o in r)) throw new Error(`tokenizer '${o}' does not exist`);
          if (["options", "rules", "lexer"].includes(o)) continue;
          let i = o, u = n.tokenizer[i], a = r[i];
          r[i] = (...p) => {
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new _();
        for (let o in n.hooks) {
          if (!(o in r)) throw new Error(`hook '${o}' does not exist`);
          if (["options", "block"].includes(o)) continue;
          let i = o, u = n.hooks[i], a = r[i];
          _.passThroughHooks.has(o) ? r[i] = (p) => {
            if (this.defaults.async && _.passThroughHooksRespectAsync.has(o)) return (async () => {
              let d = await u.call(r, p);
              return a.call(r, d);
            })();
            let c = u.call(r, p);
            return a.call(r, c);
          } : r[i] = (...p) => {
            if (this.defaults.async) return (async () => {
              let d = await u.apply(r, p);
              return d === false && (d = await a.apply(r, p)), d;
            })();
            let c = u.apply(r, p);
            return c === false && (c = a.apply(r, p)), c;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, o = n.walkTokens;
        s.walkTokens = function(i) {
          let u = [];
          return u.push(o.call(this, i)), r && (u = u.concat(r.call(this, i))), u;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return R.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return T.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, o = { ...this.defaults, ...r }, i = this.onError(!!o.silent, !!o.async);
      if (this.defaults.async === true && r.async === false) return i(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return i(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return i(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (o.hooks && (o.hooks.options = o, o.hooks.block = e), o.async) return (async () => {
        let u = o.hooks ? await o.hooks.preprocess(n) : n, p = await (o.hooks ? await o.hooks.provideLexer(e) : e ? R.lex : R.lexInline)(u, o), c = o.hooks ? await o.hooks.processAllTokens(p) : p;
        o.walkTokens && await Promise.all(this.walkTokens(c, o.walkTokens));
        let m = await (o.hooks ? await o.hooks.provideParser(e) : e ? T.parse : T.parseInline)(c, o);
        return o.hooks ? await o.hooks.postprocess(m) : m;
      })().catch(i);
      try {
        o.hooks && (n = o.hooks.preprocess(n));
        let a = (o.hooks ? o.hooks.provideLexer(e) : e ? R.lex : R.lexInline)(n, o);
        o.hooks && (a = o.hooks.processAllTokens(a)), o.walkTokens && this.walkTokens(a, o.walkTokens);
        let c = (o.hooks ? o.hooks.provideParser(e) : e ? T.parse : T.parseInline)(a, o);
        return o.hooks && (c = o.hooks.postprocess(c)), c;
      } catch (u) {
        return i(u);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var E = new F();
function k(l3, e) {
  return E.parse(l3, e);
}
k.options = k.setOptions = function(l3) {
  return E.setOptions(l3), k.defaults = E.defaults, W(k.defaults), k;
};
k.getDefaults = I;
k.defaults = y;
function Pt(...l3) {
  return E.use(...l3), k.defaults = E.defaults, W(k.defaults), k;
}
k.use = Pt;
k.walkTokens = function(l3, e) {
  return E.walkTokens(l3, e);
};
k.parseInline = E.parseInline;
k.Parser = T;
k.parser = T.parse;
k.Renderer = S;
k.TextRenderer = z;
k.Lexer = R;
k.lexer = R.lex;
k.Tokenizer = P;
k.Hooks = _;
k.parse = k;
var gn = k.options;
var fn = k.setOptions;
var mn = k.walkTokens;
var xn = k.parseInline;
var Rn = T.parse;
var Tn = R.lex;

// ../core/src/anchor.ts
var FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
var CONTEXT = 32;
function blocks(src) {
  const out2 = [];
  const fm = src.match(FRONT_MATTER);
  if (fm) out2.push({ type: "frontmatter", raw: fm[0], path: [] });
  const tokens = Tn(src.slice(fm ? fm[0].length : 0));
  const path = [];
  for (const token of tokens) {
    if (token.type === "space" && out2.length) {
      out2[out2.length - 1].raw += token.raw;
      continue;
    }
    if (token.type === "heading") {
      path.length = token.depth - 1;
      path[token.depth - 1] = token.text;
    }
    out2.push({ type: token.type, raw: token.raw, token, path: path.filter((h2) => h2 !== void 0) });
  }
  out2.links = tokens.links;
  return out2;
}
function splice(src, i, raw2) {
  const all = blocks(src);
  if (!Number.isInteger(i) || !all[i]) throw new RangeError(`no block ${i}`);
  all[i].raw = raw2.trimEnd() + all[i].raw.match(/\s*$/)[0];
  return all.map((b) => b.raw).join("");
}
function makeAnchor(text, start, end, path, raw2 = "") {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    path,
    raw: raw2.slice(0, 400)
  };
}
function findAnchor(items, anchor) {
  if (!anchor?.quote) return null;
  const key = anchor.path.join("\n");
  for (const inSection of [true, false]) {
    let best = null;
    items.forEach(({ text, path }, i) => {
      if (inSection && path.join("\n") !== key) return;
      for (let s = text.indexOf(anchor.quote); s !== -1; s = text.indexOf(anchor.quote, s + 1)) {
        const end = s + anchor.quote.length;
        const score = shared(text.slice(0, s), anchor.prefix, true) + shared(text.slice(end), anchor.suffix, false);
        if (!best || score > best.score) best = { i, start: s, end, score };
      }
    });
    if (best) return best;
  }
  return null;
}
var stateOf = (f) => f.state !== "queue" ? f.state : f.updated ? "updated" : f.edited ? "edited" : f.drafts ? "drafts" : "pending";
var countStates = (files) => files.reduce(
  (c, f) => (c[stateOf(f)]++, c),
  { accepted: 0, rejected: 0, skipped: 0, updated: 0, edited: 0, drafts: 0, working: 0, pending: 0 }
);
function matchBlocks(oldRaws, newRaws) {
  const key = (r) => r.trim();
  const changed = /* @__PURE__ */ new Map();
  const removed = [];
  let i = 0, j2 = 0;
  for (const [pi, pj] of [...lcs(oldRaws.map(key), newRaws.map(key)), [oldRaws.length, newRaws.length]]) {
    let from = i;
    for (; j2 < pj; j2++) {
      let best = -1, score = 0.5;
      for (let k2 = from; k2 < pi; k2++) {
        const s = similarity(oldRaws[k2], newRaws[j2]);
        if (s >= score) [best, score] = [k2, s];
      }
      if (best === -1) {
        changed.set(j2, null);
        continue;
      }
      for (; from < best; from++) removed.push({ before: j2, raw: oldRaws[from] });
      changed.set(j2, oldRaws[best]);
      from = best + 1;
    }
    for (; from < pi; from++) removed.push({ before: pj, raw: oldRaws[from] });
    [i, j2] = [pi + 1, pj + 1];
  }
  return { changed, removed };
}
function wordDiff(a, b) {
  const split = (s) => s.match(/[\p{L}\p{N}_]+\s*|[^\p{L}\p{N}_\s]+\s*|\s+/gu) ?? [];
  const x2 = split(a), y2 = split(b);
  const out2 = [];
  const push = (op, text, old = "") => {
    const last = out2[out2.length - 1];
    if (last?.op !== op) return out2.push(op === "=" ? { op, text, old } : { op, text });
    last.text += text;
    if (last.op === "=") last.old += old;
  };
  const trim = (t) => t.trimEnd();
  let i = 0, j2 = 0;
  for (const [pi, pj] of [...lcs(x2.map(trim), y2.map(trim)), [x2.length, y2.length]]) {
    while (i < pi) push("-", x2[i++]);
    while (j2 < pj) push("+", y2[j2++]);
    if (i < x2.length) push("=", y2[j2++], x2[i++]);
  }
  return out2;
}
function addedSpans(ops) {
  const out2 = [];
  let at2 = 0;
  for (const { op, text } of ops) {
    if (op === "-") continue;
    const end = at2 + text.trimEnd().length;
    if (op === "+" && end > at2) out2.push([at2, end]);
    at2 += text.length;
  }
  return out2;
}
function subtractSpans(a, b) {
  const out2 = [];
  for (let [s, e] of a) {
    for (const [bs, be2] of b) {
      if (be2 <= s || bs >= e) continue;
      if (bs > s) out2.push([s, bs]);
      s = Math.max(s, be2);
    }
    if (s < e) out2.push([s, e]);
  }
  return out2;
}
var similarity = (a, b) => {
  const ops = wordDiff(a, b);
  const len = (op) => ops.reduce((n, o) => n + (o.op === op ? o.text.length : 0), 0);
  return 2 * len("=") / (a.length + b.length || 1);
};
function lcs(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j2 = b.length - 1; j2 >= 0; j2--) t[i][j2] = a[i] === b[j2] ? t[i + 1][j2 + 1] + 1 : Math.max(t[i + 1][j2], t[i][j2 + 1]);
  const out2 = [];
  for (let i = 0, j2 = 0; i < a.length && j2 < b.length; ) {
    if (a[i] === b[j2]) out2.push([i++, j2++]);
    else if (t[i + 1][j2] >= t[i][j2 + 1]) i++;
    else j2++;
  }
  return out2;
}
function shared(a, b, fromEnd) {
  let n = 0;
  while (n < a.length && n < b.length && (fromEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++;
  return n;
}

// ../core/src/settings.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var settingsFile = (stateDir) => join(stateDir, "settings.json");
function loadSettings(stateDir) {
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(settingsFile(stateDir), "utf8"));
  } catch {
  }
  let s = DEFAULT_SETTINGS;
  for (const [k2, v] of Object.entries(saved ?? {})) try {
    s = mergeSettings(s, { [k2]: v });
  } catch {
  }
  return s;
}
var saveSettings = (stateDir, s) => writeFileSync(settingsFile(stateDir), JSON.stringify(s, null, 1));
function mergeSettings(base, patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("settings must be an object");
  const p = patch;
  const out2 = { ...base, types: { ...base.types }, exclude: [...base.exclude] };
  const bad = (key) => {
    throw new TypeError(`bad setting: ${key}`);
  };
  if ("types" in p) {
    if (!p.types || typeof p.types !== "object" || Array.isArray(p.types) || !Object.values(p.types).every((v) => typeof v === "boolean")) bad("types");
    Object.assign(out2.types, p.types);
  }
  if ("exclude" in p) {
    if (!Array.isArray(p.exclude) || !p.exclude.every((g) => typeof g === "string" && g.trim())) bad("exclude");
    out2.exclude = p.exclude.map((g) => g.trim());
  }
  if ("theme" in p) {
    if (!["system", "light", "dark"].includes(p.theme)) bad("theme");
    out2.theme = p.theme;
  }
  if ("scope" in p) {
    if (!["uncommitted", "branch"].includes(p.scope)) bad("scope");
    out2.scope = p.scope;
  }
  if ("base" in p) {
    if (p.base !== null && (typeof p.base !== "string" || !p.base.trim())) bad("base");
    out2.base = p.base === null ? null : p.base.trim();
  }
  if ("showNew" in p) {
    if (typeof p.showNew !== "boolean") bad("showNew");
    out2.showNew = p.showNew;
  }
  return out2;
}
var enabledTypes = (s) => DEFAULT_DOC_TYPES.filter((t) => s.types[t.id] ?? t.enabled);
function kindOf(path, s) {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return enabledTypes(s).find((t) => t.extensions.some((e) => name.endsWith(e) && name.length > e.length))?.kind ?? null;
}
var globRe = (g) => new RegExp("^" + g.replace(/\*\*\/|\/\*\*$|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (m) => m === "**/" ? "(?:.*/)?" : m === "/**" ? "/.*" : m === "**" ? ".*" : m === "*" ? "[^/]*" : m === "?" ? "[^/]" : "\\" + m) + "$");
var excluded = (path, s) => s.exclude.some((g) => globRe(g).test(path));
var included = (path, s) => kindOf(path, s) !== null && !excluded(path, s);

// ../core/src/presence.ts
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
var out = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3e3 });
  } catch {
    return null;
  }
};
function peerOf(port) {
  const pids = (out("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:ESTABLISHED"]) ?? "").split("\n").map(Number);
  return pids.find((p) => p > 0 && p !== process.pid) ?? null;
}
function agentAbove(pid, id) {
  if (id === "other") return null;
  for (let hops = 0; pid && pid > 1 && hops < 30; hops++) {
    const line = out("ps", ["-o", "ppid=", "-o", "comm=", "-p", String(pid)])?.trim();
    if (!line) return null;
    const [, ppid, comm] = line.match(/^(\d+)\s+(.*)$/) ?? [];
    const exe = basename(comm ?? "");
    if (exe === id) return pid;
    if (exe === "node" && new RegExp(`/${id}(?:-code)?[/\\s]|/${id}$`).test(out("ps", ["-o", "args=", "-p", String(pid)]) ?? "")) return pid;
    pid = Number(ppid);
  }
  return null;
}
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

// ../core/src/source.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { basename as basename2, dirname, join as join2 } from "node:path";
var sha = (text) => createHash("sha1").update(text).digest("hex");
function gitAt(cwd) {
  const git = (...args) => execFileSync2("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20, stdio: "pipe" });
  const tryGit = (...args) => {
    try {
      return git(...args);
    } catch {
      return null;
    }
  };
  const branch = () => tryGit("symbolic-ref", "--short", "-q", "HEAD")?.trim() || null;
  const defaultBase = () => {
    const origin = tryGit("rev-parse", "--abbrev-ref", "origin/HEAD")?.trim();
    if (origin && origin !== "origin/HEAD") return origin;
    return ["main", "master"].find((b) => tryGit("rev-parse", "--verify", "--quiet", `refs/heads/${b}`)) ?? null;
  };
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const head = () => tryGit("rev-parse", "--short", "HEAD")?.trim() ?? "";
  const place = (top) => {
    const blocks2 = (tryGit("worktree", "list", "--porcelain") ?? "").split("\n\n").map((block) => new Map(block.split("\n").filter(Boolean).map((l3) => [l3.split(" ")[0], l3.slice(l3.indexOf(" ") + 1)]))).filter((kv) => kv.has("worktree"));
    const main2 = blocks2[0] ? real(blocks2[0].get("worktree")) : top;
    const worktrees = blocks2.filter((kv) => !kv.has("bare")).map((kv) => {
      const path = real(kv.get("worktree"));
      return { path, name: basename2(path), branch: kv.get("branch")?.replace(/^refs\/heads\//, "") ?? null, head: (kv.get("HEAD") ?? "").slice(0, 7), current: path === top, main: path === main2 };
    });
    const here2 = worktrees.find((w) => w.current);
    return {
      repo: { root: main2, name: basename2(main2) },
      worktree: { path: top, name: basename2(top), branch: here2 ? here2.branch : branch(), main: top === main2 },
      worktrees
    };
  };
  const branches = (top) => (tryGit("for-each-ref", "--format=%(refname:short)%00%(HEAD)%00%(worktreepath)%00%(upstream:short)%00%(committerdate:iso-strict)", "refs/heads") ?? "").split("\n").filter(Boolean).map((l3) => {
    const [name, star, wt2, upstream, date] = l3.split("\0");
    const path = wt2 ? real(wt2) : null;
    return { name, current: star === "*", worktree: path && path !== top ? path : null, ...upstream ? { upstream } : {}, lastCommit: date };
  });
  return { git, tryGit, branch, defaultBase, head, place, branches };
}
var pathspec = (s) => {
  const exts = enabledTypes(s).flatMap((t) => t.extensions.map((e) => `*${e}`));
  return exts.length ? [...exts, ...s.exclude.map((e) => `:(exclude,glob)${e}`)] : null;
};
function changesIn(git, s) {
  const spec = pathspec(s);
  if (!spec) return 0;
  const parts = git("status", "--porcelain=v1", "-z", "-uall", "--", ...spec).split("\0");
  let n = 0;
  for (let k2 = 0; k2 < parts.length; k2++) if (parts[k2]) {
    n++;
    if (/^[RC]/.test(parts[k2])) k2++;
  }
  return n;
}
function withChanges(worktrees) {
  return worktrees.map((w) => {
    const g = gitAt(w.path);
    const dir = g.tryGit("rev-parse", "--absolute-git-dir")?.trim();
    let changes = 0;
    try {
      if (dir) changes = changesIn(g.git, loadSettings(join2(dir, "trove")));
    } catch {
    }
    return { ...w, changes };
  });
}
var gitTop = (dir) => {
  try {
    return realpathSync(gitAt(dir).git("rev-parse", "--show-toplevel").trim());
  } catch {
    return null;
  }
};
function probeGit(path) {
  let dir = path;
  try {
    if (!statSync(path).isDirectory()) dir = dirname(path);
  } catch {
    return null;
  }
  const top = gitTop(dir);
  if (!top) return null;
  const g = gitAt(top);
  const branches = (g.tryGit("for-each-ref", "--format=%(refname:short)%00%(symref)", "refs/heads", "refs/remotes") ?? "").split("\n").map((l3) => l3.split("\0")).filter(([name, sym]) => name && !sym).map(([name]) => name);
  const place = g.place(top);
  return { branch: g.branch(), branches, defaultBase: g.defaultBase(), local: g.branches(top), ...place, worktrees: withChanges(place.worktrees) };
}
function openSource(root) {
  const top = gitTop(statSync(root).isDirectory() ? root : dirname(root));
  if (!top) throw new Error(`not a git repository: ${root}`);
  const g = gitAt(top);
  const { git, tryGit, branch, defaultBase } = g;
  const gitDir = git("rev-parse", "--absolute-git-dir").trim();
  const stateDir = join2(gitDir, "trove");
  if (!existsSync(stateDir) && existsSync(join2(gitDir, "doc-review"))) renameSync(join2(gitDir, "doc-review"), stateDir);
  mkdirSync(stateDir, { recursive: true });
  const show = (spec) => tryGit("show", spec);
  const resolveBase = (s) => s.base ?? defaultBase();
  const mergeBase = (s) => {
    const b = resolveBase(s);
    return b && tryGit("merge-base", b, "HEAD")?.trim() || null;
  };
  const unstage = (rel) => {
    try {
      git("restore", "--staged", "--", rel);
    } catch {
    }
  };
  const entry = (path, kind, untracked, staged) => ({ path, kind, untracked, staged });
  return {
    root: top,
    // realpath of the toplevel
    stateDir,
    /** The branch scope's base ref: Settings.base, or auto. */
    resolveBase,
    branch,
    head: g.head,
    branches: () => g.branches(top),
    /** The repository, this root as a worktree of it, and every worktree (main checkout first). */
    place: () => g.place(top),
    /** Changed paths of the enabled doc types, staged or not: what a switch carries along or trips on. */
    dirty: (s) => changesIn(git, s),
    /** `git switch <branch>`; null when done, else git's own message. Never stashes, never discards. */
    switchTo(name) {
      try {
        git("switch", "--no-guess", name);
        return null;
      } catch (e) {
        return String(e.stderr || e.message).trim();
      }
    },
    unstage,
    unaccept: unstage,
    accept: (...rels) => {
      if (rels.length) git("add", "--", ...rels);
    },
    /** The index copy (`:path`), or null when untracked. */
    indexed: (rel) => show(`:${rel}`),
    /** Take the file out of the change set: back to HEAD in index and worktree, or, if HEAD lacks it, out of the index and off disk. */
    reject(rel) {
      if (show(`HEAD:${rel}`) !== null) return void git("restore", "--source=HEAD", "--staged", "--worktree", "--", rel);
      try {
        git("rm", "--cached", "-q", "--", rel);
      } catch {
      }
      rmSync(join2(top, rel), { force: true });
    },
    /**
     * The queue. What git lists is added to `seen`, and seen files stay listed (as committed) after
     * git stops reporting them. Paths in `hide` (rejected ones) are listed only when git status
     * reports them, never from `seen` or the branch diff.
     */
    list(s, seen, hide = /* @__PURE__ */ new Set()) {
      const spec = pathspec(s);
      if (!spec) return [];
      const parts = git("status", "--porcelain=v1", "-z", "-uall", "--", ...spec).split("\0");
      const out2 = [];
      for (let k2 = 0; k2 < parts.length; k2++) {
        const [x2, y2, path] = [parts[k2][0], parts[k2][1], parts[k2].slice(3)];
        if (!path) continue;
        if (x2 === "R" || x2 === "C") k2++;
        if (y2 === "D" || x2 === "D" && y2 === " ") continue;
        const kind = kindOf(path, s);
        if (kind) out2.push(entry(path, kind, x2 === "?", y2 === " "));
      }
      const have = new Set(out2.map((f) => f.path));
      for (const path of seen) {
        if (!have.has(path) && !hide.has(path) && included(path, s) && existsSync(join2(top, path))) out2.push({ ...entry(path, kindOf(path, s), false, true), committed: true });
      }
      for (const f of out2) {
        seen.add(f.path);
        have.add(f.path);
      }
      const mb = s.scope === "branch" ? mergeBase(s) : null;
      if (mb) {
        for (const path of git("diff", "--name-only", "-z", "--diff-filter=d", mb, "HEAD", "--", ...spec).split("\0")) {
          const kind = path && !have.has(path) && !hide.has(path) && existsSync(join2(top, path)) ? kindOf(path, s) : null;
          if (kind) out2.push(entry(path, kind, false, true));
        }
      }
      return out2;
    },
    // What `text` is new against, for the page's Show new: the staged copy, or HEAD's once the file
    // is staged as it is (accepted). In branch scope a file committed as it is diffs against the
    // merge-base, so the branch's own changes show. Null for a file git has no earlier copy of.
    baseOf(rel, text, s) {
      const staged = show(`:${rel}`);
      if (staged !== null && staged !== text) return staged;
      const head = show(`HEAD:${rel}`);
      const mb = s.scope === "branch" && head === text ? mergeBase(s) : null;
      return mb ? show(`${mb}:${rel}`) : head;
    }
  };
}

// ../core/src/app.ts
var MAX_BYTES = 512 * 1024;
var CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'";
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};
function locate(text, needle, hint) {
  let best = -1;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    if (best === -1 || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
    if (!needle) break;
  }
  return needle ? best : Math.min(hint, text.length);
}
function createApp(o) {
  const source = openSource(resolve(o.root));
  const { root: top, stateDir: dir } = source;
  const log = o.log ?? console.log;
  const quietMs = o.quietMs ?? 5e3;
  const uiDir = o.uiDir ? realpathSync2(o.uiDir) : null;
  const files = { drafts: join3(dir, "drafts.json"), edits: join3(dir, "edits.json"), batches: join3(dir, "batches.jsonl"), events: join3(dir, "events.log"), state: join3(dir, "state.json") };
  let stored = loadSettings(dir);
  const overrides = {};
  if (o.scope !== void 0) overrides.scope = o.scope;
  if (o.base !== void 0) overrides.base = o.base;
  if (o.exclude !== void 0) overrides.exclude = o.exclude;
  let current = mergeSettings(stored, overrides);
  let saved = {};
  try {
    saved = JSON.parse(readFileSync2(files.state, "utf8"));
  } catch {
  }
  const working = new Map(
    Object.entries(saved.working ?? {}).map(([p, w]) => [p, { ...w, last: w.hash, at: 0 }])
  );
  let question = saved.question ?? null;
  const updated = new Map(Object.entries(saved.updated ?? {}));
  const seen = new Set(saved.seen ?? []);
  const skipped = new Set(saved.skipped ?? []);
  const rejected = new Map(Object.entries(saved.rejected ?? {}));
  const attached = (id, label, pid) => ({ id, label: label || AGENT_LABELS[id], at: (/* @__PURE__ */ new Date()).toISOString(), ...pid ? { pid } : {} });
  const serving = o.agent === void 0 ? process.env.CLAUDECODE ? "claude" : null : o.agent;
  let agent = serving ? attached(serving, void 0, agentAbove(process.pid, serving)) : saved.agent ?? null;
  let attachedHere = !!serving;
  const agentInfo = () => agent ? { id: agent.id, label: agent.label, at: agent.at, connected: agent.pid ? alive(agent.pid) : attachedHere } : { id: "other", label: AGENT_LABELS.other, connected: false, at: null };
  const Who = () => {
    const l3 = agentInfo().label;
    return l3[0].toUpperCase() + l3.slice(1);
  };
  const BUSY = () => [409, { error: `${Who()} is working on this file` }];
  const saveState = () => writeFileSync2(files.state, JSON.stringify({
    working: Object.fromEntries([...working].map(([p, w]) => [p, { hash: w.hash, text: w.text }])),
    updated: Object.fromEntries(updated),
    question,
    seen: [...seen],
    skipped: [...skipped],
    rejected: Object.fromEntries(rejected),
    agent
  }));
  if (serving) saveState();
  const REJECTED = [409, { error: "Rejected: restore it first" }];
  const activity = [];
  const note = (kind, text, more = {}) => {
    activity.push({ at: (/* @__PURE__ */ new Date()).toISOString(), kind, text, ...more });
    activity.splice(0, activity.length - 100);
  };
  const sentEntry = (b) => ({ at: b.sentAt, kind: "batch", text: b.id, comments: b.items.length, paths: [...new Set(b.items.map((c) => c.path))] });
  try {
    activity.push(...readFileSync2(files.batches, "utf8").trim().split("\n").slice(-100).map((l3) => sentEntry(JSON.parse(l3))));
  } catch {
  }
  function list() {
    const before = seen.size;
    const out2 = source.list(current, seen, new Set(rejected.keys()));
    let dropped = false;
    for (const f of out2) {
      if (rejected.delete(f.path)) dropped = true;
      if (skipped.has(f.path)) f.skipped = true;
    }
    for (const path of rejected.keys()) if (included(path, current)) out2.push({ path, kind: kindOf(path, current), untracked: false, staged: false, rejected: true });
    if (seen.size !== before || dropped) saveState();
    return out2.sort((a, b) => a.path < b.path ? -1 : 1);
  }
  function find(p) {
    if (typeof p !== "string") return null;
    let abs = resolve(top, p);
    try {
      abs = realpathSync2(abs);
    } catch {
    }
    const rel = relative(top, abs).split(sep).join("/");
    return list().find((f) => f.path === rel) ?? null;
  }
  const listed = (p) => find(p)?.path ?? null;
  const read = (rel) => readFileSync2(join3(top, rel), "utf8");
  const write = (rel, text) => writeFileSync2(join3(top, rel), text);
  const hashOf = (rel) => {
    try {
      return sha(read(rel));
    } catch {
      return null;
    }
  };
  const drafts = () => {
    try {
      return JSON.parse(readFileSync2(files.drafts, "utf8"));
    } catch {
      return {};
    }
  };
  const saveDrafts = (d) => writeFileSync2(files.drafts, JSON.stringify(d, null, 1));
  const edits = () => {
    try {
      return JSON.parse(readFileSync2(files.edits, "utf8"));
    } catch {
      return {};
    }
  };
  const saveEdits = (e) => writeFileSync2(files.edits, JSON.stringify(e));
  const dropEdit = (rel) => {
    const e = edits();
    if (e[rel]) {
      delete e[rel];
      saveEdits(e);
    }
  };
  const editRows = (rel, text) => (edits()[rel]?.blocks ?? []).map((b) => ({ ...b, ok: locate(text, b.after, b.at) !== -1 }));
  function release(rel) {
    const w = working.get(rel);
    if (!w) return false;
    working.delete(rel);
    if (hashOf(rel) !== w.hash) updated.set(rel, w.text);
    saveState();
    note("release", rel);
    return true;
  }
  function tick(now = Date.now()) {
    for (const [rel, w] of working) {
      const h2 = hashOf(rel);
      if (h2 === w.hash) continue;
      if (h2 !== w.last) Object.assign(w, { last: h2, at: now });
      else if (now - w.at >= quietMs) release(rel);
    }
    follow();
  }
  const size = (f) => {
    try {
      return statSync2(f).size;
    } catch {
      return 0;
    }
  };
  let eventsAt = size(files.events);
  function follow() {
    const n = size(files.events);
    if (n === eventsAt) return;
    if (n < eventsAt) eventsAt = 0;
    const tail = readFileSync2(files.events).subarray(eventsAt);
    const end = tail.lastIndexOf(10) + 1;
    eventsAt += end;
    for (const line of tail.subarray(0, end).toString("utf8").split("\n")) if (line && !line.startsWith("batch ")) note("event", line);
  }
  const port = () => {
    const a = server.address();
    return a && typeof a === "object" ? a.port : 0;
  };
  const pick = ({ repo, worktree }) => ({ repo, worktree });
  const info = () => ({
    kind: "git",
    root: top,
    name: basename3(top),
    ...pick(source.place()),
    branch: source.branch(),
    base: current.scope === "branch" ? source.resolveBase(current) : null,
    scope: current.scope,
    agent: agent?.id === "claude" ? "claude" : "other",
    agentInfo: agentInfo(),
    port: port(),
    stateDir: dir,
    eventsLog: files.events,
    batchesLog: files.batches,
    doneCommand: (o.doneCommand ?? ((p) => `trove done <file> --port ${p}`))(port())
  });
  const git = () => {
    const place = source.place();
    return {
      root: top,
      ...place,
      worktrees: withChanges(place.worktrees),
      branch: source.branch(),
      head: source.head(),
      branches: source.branches(),
      dirty: source.dirty(current),
      base: current.scope === "branch" ? source.resolveBase(current) : null
    };
  };
  const routes = {
    "GET /api/files": () => {
      const d = drafts();
      const e = edits();
      const all = list().map((f) => ({
        ...f,
        state: working.has(f.path) ? "working" : f.rejected ? "rejected" : f.staged ? "accepted" : f.skipped ? "skipped" : "queue",
        updated: updated.has(f.path),
        edited: !!e[f.path],
        drafts: d[f.path]?.length ?? 0
      }));
      return [200, { files: all, question }];
    },
    // Every listed file's drafts, for the page's All files view; drafts for paths no longer in the
    // review set are left out.
    "GET /api/drafts": () => {
      const d = drafts();
      const listedPaths = new Set(list().map((f) => f.path));
      const edited = Object.keys(edits()).filter((p) => listedPaths.has(p));
      return [200, {
        drafts: Object.fromEntries(Object.entries(d).filter(([p]) => listedPaths.has(p))),
        edits: Object.fromEntries(edited.map((p) => [p, editRows(p, read(p))]))
      }];
    },
    "GET /api/file": (q2) => {
      const f = find(q2.get("path"));
      if (!f) return [404, { error: "not in the review set" }];
      const rel = f.path;
      const gone = rejected.get(rel);
      if (gone) return [200, {
        path: rel,
        kind: f.kind,
        text: gone.text,
        base: existsSync2(join3(top, rel)) ? read(rel) : null,
        since: null,
        hash: sha(gone.text),
        locked: true,
        rejected: true,
        drafts: [],
        edited: false,
        revertable: false,
        edits: []
      }];
      const text = read(rel);
      const edit = edits()[rel];
      return [200, {
        path: rel,
        kind: f.kind,
        text,
        base: source.baseOf(rel, text, current),
        since: updated.get(rel) ?? null,
        hash: sha(text),
        locked: working.has(rel),
        drafts: drafts()[rel] ?? [],
        edited: !!edit,
        revertable: edit?.saved === sha(text),
        edits: editRows(rel, text)
      }];
    },
    "POST /api/drafts": (_2, { path, drafts: list2 }) => {
      const rel = listed(path);
      if (!rel || !Array.isArray(list2)) return [400, { error: "path and drafts[] required" }];
      if (rejected.has(rel)) return REJECTED;
      const d = drafts();
      if (list2.length) d[rel] = list2;
      else delete d[rel];
      saveDrafts(d);
      return [200, { ok: true }];
    },
    // Accepts only the text the user last saw: a file that changed since is refused.
    "POST /api/accept": (_2, { path, hash }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: "not in the review set" }];
      if (working.has(rel)) return BUSY();
      if (rejected.has(rel)) return REJECTED;
      const now = hashOf(rel);
      if (now !== hash) return [409, { error: "The file changed; read it again before accepting", hash: now }];
      source.accept(rel);
      updated.delete(rel);
      skipped.delete(rel);
      saveState();
      dropEdit(rel);
      return [200, { ok: true }];
    },
    // Skip: come back to it later. Only the editor's mark; git is untouched.
    "POST /api/skip": (_2, { path, on }) => {
      const rel = listed(path);
      if (!rel || typeof on !== "boolean") return [400, { error: "path and on required" }];
      if (working.has(rel)) return BUSY();
      if (rejected.has(rel)) return REJECTED;
      if (on) skipped.add(rel);
      else skipped.delete(rel);
      saveState();
      return [200, { ok: true }];
    },
    // Reject: take the change out of the change set (see the source's reject). The working text, the index
    // copy and the file's drafts are saved first, so Restore can put them back. Refused on a version
    // the user did not see. Its edits are dropped.
    "POST /api/reject": (_2, { path, hash }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: "not in the review set" }];
      if (working.has(rel)) return BUSY();
      if (rejected.has(rel)) return [409, { error: "Already rejected" }];
      const text = read(rel);
      if (sha(text) !== hash) return [409, { error: "The file changed; read it again before rejecting", hash: sha(text) }];
      const d = drafts();
      rejected.set(rel, { text, staged: source.indexed(rel), drafts: d[rel] ?? [], at: (/* @__PURE__ */ new Date()).toISOString() });
      updated.delete(rel);
      skipped.delete(rel);
      saveState();
      source.reject(rel);
      if (d[rel]) {
        delete d[rel];
        saveDrafts(d);
      }
      dropEdit(rel);
      return [200, { ok: true }];
    },
    // Restore a rejected file: the index copy (staged), then the working text, then its drafts.
    "POST /api/restore": (_2, { path }) => {
      const rel = listed(path);
      const gone = rel && rejected.get(rel);
      if (!rel || !gone) return [404, { error: "not rejected" }];
      mkdirSync2(dirname2(join3(top, rel)), { recursive: true });
      if (gone.staged !== null) {
        write(rel, gone.staged);
        source.accept(rel);
      }
      write(rel, gone.text);
      if (gone.drafts.length) saveDrafts({ ...drafts(), [rel]: gone.drafts });
      rejected.delete(rel);
      saveState();
      return [200, { ok: true }];
    },
    // Accept all: the listed, free (not working, not rejected) paths given, in one git add. No hash check:
    // the user chose to accept files as they are now, seen or not.
    "POST /api/accept-all": (_2, { paths }) => {
      if (!Array.isArray(paths)) return [400, { error: "paths required" }];
      const rels = [...new Set(paths.map(listed).filter((r) => !!r && !working.has(r) && !rejected.has(r)))];
      source.accept(...rels);
      for (const rel of rels) {
        updated.delete(rel);
        skipped.delete(rel);
        dropEdit(rel);
      }
      saveState();
      return [200, { accepted: rels.length }];
    },
    "POST /api/unaccept": (_2, { path }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: "not in the review set" }];
      if (working.has(rel)) return BUSY();
      if (rejected.has(rel)) return REJECTED;
      source.unaccept(rel);
      return [200, { ok: true }];
    },
    "POST /api/save": (_2, { path, hash, index, raw: raw2 }) => {
      const f = find(path);
      if (!f || typeof raw2 !== "string") return [400, { error: "path and raw required" }];
      const rel = f.path;
      if (working.has(rel)) return BUSY();
      if (rejected.has(rel)) return REJECTED;
      const text = read(rel);
      if (sha(text) !== hash) return [409, { error: "The file changed since you started editing", hash: sha(text) }];
      let next = raw2;
      let block = { before: text, after: raw2, path: [], index: null, at: 0 };
      if (f.kind === "markdown") {
        try {
          next = splice(text, index, raw2);
        } catch {
          return [400, { error: `no block ${index}` }];
        }
        const all = blocks(text);
        block = {
          before: all[index].raw.trimEnd(),
          after: raw2.trimEnd(),
          path: all[index].path,
          index,
          at: all.slice(0, index).reduce((n, b) => n + b.raw.length, 0)
        };
      }
      source.unstage(rel);
      write(rel, next);
      const e = edits();
      const rec = e[rel] ??= { before: text, blocks: [] };
      rec.saved = sha(next);
      rec.blocks ??= [];
      const same = rec.blocks.filter((b) => b.after === block.before).sort((x2, y2) => Math.abs(x2.at - block.at) - Math.abs(y2.at - block.at))[0];
      if (same) Object.assign(same, { after: block.after, index: block.index, at: block.at, time: (/* @__PURE__ */ new Date()).toISOString() });
      else rec.blocks.push({ id: randomUUID().slice(0, 8), ...block, time: (/* @__PURE__ */ new Date()).toISOString() });
      rec.blocks = rec.blocks.filter((b) => b.before !== b.after);
      saveEdits(e);
      return [200, { hash: sha(next) }];
    },
    // Back to the text before the user's first edit in this review, never to the index or HEAD, so
    // the agent's and earlier uncommitted work is kept. Refused once the file changed after the edit.
    // With `edit` (an id), reverts that one block edit: puts its `before` back where its `after` now
    // sits (nearest its old position), touching nothing else. Hash-checked like Save when `hash`
    // is given. Never accepts.
    "POST /api/revert": (_2, { path, edit: id, hash }) => {
      const rel = listed(path);
      if (rel && rejected.has(rel)) return REJECTED;
      const e = edits();
      const edit = rel && e[rel];
      if (!rel || !edit) return [404, { error: "no edits to revert" }];
      if (working.has(rel)) return BUSY();
      const text = read(rel);
      if (id === void 0) {
        if (sha(text) !== edit.saved) return [409, { error: "The file changed since your edit" }];
        write(rel, edit.before);
        dropEdit(rel);
        return [200, { hash: sha(edit.before) }];
      }
      const one = edit.blocks?.find((b) => b.id === id);
      if (!one) return [404, { error: "no such edit" }];
      if (hash !== void 0 && sha(text) !== hash) return [409, { error: "The file changed; read it again", hash: sha(text) }];
      const at2 = locate(text, one.after, one.at);
      if (at2 === -1) return [409, { error: "The text changed since your edit" }];
      const next = text.slice(0, at2) + one.before + text.slice(at2 + one.after.length);
      write(rel, next);
      edit.blocks = edit.blocks.filter((b) => b !== one);
      if (edit.blocks.length) {
        edit.saved = sha(next);
        saveEdits(e);
      } else dropEdit(rel);
      return [200, { hash: sha(next) }];
    },
    // Sends drafts, skipping files the agent is working on and rejected ones. Optional filters: `paths` (only these
    // files, each checked like any other path) and `kind` ('change' or 'explain'). What is not
    // sent stays a draft.
    "POST /api/send": (_2, { paths, kind }) => {
      if (paths !== void 0 && !Array.isArray(paths)) return [400, { error: "paths must be a list" }];
      if (kind !== void 0 && kind !== "change" && kind !== "explain") return [400, { error: "kind is change or explain" }];
      const only = paths && new Set(paths.map(listed).filter(Boolean));
      const d = drafts();
      const items = [];
      const keep = {};
      for (const [path, list2] of Object.entries(d)) {
        const rel = listed(path);
        const take = rel && !working.has(rel) && !rejected.has(rel) && (!only || only.has(rel)) ? list2.filter((c) => !kind || c.kind === kind) : [];
        items.push(...take.map((c) => ({ path: rel, kind: c.kind, note: c.note, anchor: c.anchor })));
        const rest = list2.filter((c) => !take.includes(c));
        if (rest.length) keep[path] = rest;
      }
      if (!items.length) return [400, { error: "no comments to send" }];
      const changed = [...new Set(items.filter((c) => c.kind === "change").map((c) => c.path))];
      for (const rel of changed) {
        source.unstage(rel);
        const h2 = hashOf(rel);
        working.set(rel, { hash: h2, last: h2, at: 0, text: read(rel) });
      }
      saveState();
      const id = randomUUID().slice(0, 8);
      const sentPaths = new Set(items.map((c) => c.path));
      appendFileSync(files.batches, `${JSON.stringify({ id, sentAt: (/* @__PURE__ */ new Date()).toISOString(), items })}
`);
      note("batch", id, { comments: items.length, paths: [...sentPaths] });
      saveDrafts(keep);
      const notice = `batch ${id}: ${items.length} ${items.length === 1 ? "comment" : "comments"} on ${sentPaths.size} ${sentPaths.size === 1 ? "file" : "files"}. Read it with: grep -F ${id} '${files.batches}'`;
      appendFileSync(files.events, `${notice}
`);
      log(notice);
      return [200, { id, comments: items.length, files: sentPaths.size, locked: changed }];
    },
    // Create PR: once nothing waits for review, ask the agent to commit what is staged and open a pull
    // request. Trove itself never commits; this is one line in the events log, like a batch's notice.
    "POST /api/pr": () => {
      const rows = list();
      if (rows.some((f) => working.has(f.path) || !f.staged && !f.rejected && !f.skipped)) return [409, { error: "Files are still waiting for review" }];
      const staged = rows.filter((f) => f.staged && !f.committed).length;
      if (!staged) return [400, { error: "nothing staged" }];
      const id = randomUUID().slice(0, 8);
      const notice = `pr ${id}: the review is done; commit the ${staged} staged ${staged === 1 ? "file" : "files"} and open a pull request.`;
      appendFileSync(files.events, `${notice}
`);
      log(notice);
      return [200, { id, files: staged }];
    },
    // `ask` (kind 'question') or `reply` (kind 'reply') from the agent: the page shows that something
    // waits for the user in the agent's session. An empty text (`ask --clear`, or the page's dismiss)
    // takes it down.
    "POST /api/ask": (_2, { text, kind = "question" }) => {
      if (typeof text !== "string" || !["question", "reply"].includes(kind)) return [400, { error: "text, and kind question or reply" }];
      question = text.trim() ? { text: text.trim().slice(0, 300), kind, at: (/* @__PURE__ */ new Date()).toISOString() } : null;
      saveState();
      if (question) note(kind, question.text);
      return [200, { question }];
    },
    // `done <file>` from the agent and the page's Unlock button.
    "POST /api/release": (_2, { path }) => {
      const rel = listed(path);
      if (!rel) return [404, { error: `not in the review set: ${path}` }];
      return [200, { released: release(rel), updated: updated.has(rel) }];
    },
    "GET /api/source": () => [200, info()],
    "GET /api/activity": () => (follow(), [200, { entries: activity }]),
    // `trove attach` / `trove detach`: who is on the other end of the loop. id null clears it.
    "POST /api/agent": (_2, { id, label }, req) => {
      if (id !== null && !Object.hasOwn(AGENT_LABELS, id)) return [400, { error: "id is claude, codex, other or null" }];
      if (label !== void 0 && (typeof label !== "string" || label.length > 40)) return [400, { error: "label is a short string" }];
      if (id === null && agent) note("detach", agent.label);
      agent = id === null ? null : attached(id, label?.trim(), agentAbove(peerOf(req.socket.remotePort), id));
      attachedHere = id !== null;
      saveState();
      if (agent) note("attach", agent.label);
      return [200, agentInfo()];
    },
    "GET /api/git": () => [200, git()],
    // The same as running `git switch <branch>` by hand, no more: no stash, no discard. Git itself
    // refuses when uncommitted changes would be overwritten; its message is the answer.
    "POST /api/switch": (_2, { branch }) => {
      const target = typeof branch === "string" ? source.branches().find((b) => b.name === branch) : void 0;
      if (!target) return [404, { error: `no such branch: ${branch}` }];
      if (target.current) return [200, git()];
      if (target.worktree) return [409, { error: `${branch} is checked out in ${target.worktree}`, worktree: target.worktree }];
      if (working.size) return [409, { error: `${Who()} is working on a file` }];
      const failed = source.switchTo(branch);
      if (failed) return [409, { error: failed }];
      seen.clear();
      list();
      saveState();
      return [200, git()];
    },
    "GET /api/settings": () => [200, current],
    // A partial merge. Keys this run got from options (--scope, --exclude) give way to the user's
    // choice. Types, exclude, scope and base apply on the next list(), which every request runs.
    "POST /api/settings": (_2, body) => {
      try {
        stored = mergeSettings(stored, body);
      } catch (error) {
        return [400, { error: error.message }];
      }
      for (const key of Object.keys(body)) delete overrides[key];
      saveSettings(dir, stored);
      current = mergeSettings(stored, overrides);
      return [200, current];
    }
  };
  function asset(pathname) {
    if (!uiDir) return null;
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const abs = resolve(uiDir, `.${rel === "/" ? "/index.html" : rel}`);
    if (!abs.startsWith(uiDir + sep)) return null;
    try {
      return statSync2(abs).isFile() ? abs : null;
    } catch {
      return null;
    }
  }
  const handle = (req, res) => {
    const { pathname, searchParams } = new URL(req.url ?? "/", "http://x");
    const local = req.socket.localPort;
    const reply = (status, body, headers = {}) => res.writeHead(status, { "cache-control": "no-store", ...headers }).end(body);
    const json = ([status, body]) => reply(status, JSON.stringify(body), { "content-type": "application/json" });
    if (![`127.0.0.1:${local}`, `localhost:${local}`].includes(req.headers.host ?? "")) return reply(403);
    if (!pathname.startsWith("/api/")) {
      if (req.method !== "GET") return reply(404);
      if (pathname.startsWith("/raw/")) {
        let rel;
        try {
          rel = decodeURIComponent(pathname.slice(5));
        } catch {
          return reply(404);
        }
        const abs = resolve(top, rel);
        if (!abs.startsWith(top + sep) || abs.startsWith(join3(top, ".git") + sep)) return reply(404);
        let body = rejected.get(relative(top, abs).split(sep).join("/"))?.text;
        if (body == null) try {
          if (statSync2(abs).isFile()) body = readFileSync2(abs);
        } catch {
        }
        if (body == null) return reply(404);
        return reply(200, body, { "content-type": TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream" });
      }
      const file = asset(pathname);
      if (file) return reply(200, readFileSync2(file), { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "content-security-policy": CSP });
      if (pathname === "/" && !uiDir) return reply(404, "No UI is built for this server; it answers /api/ only. Pass --ui <dir>.\n", { "content-type": "text/plain; charset=utf-8" });
      return reply(404);
    }
    const route = routes[`${req.method} ${pathname}`];
    if (!route) return reply(404);
    const run = (body) => {
      try {
        json(route(searchParams, body, req));
      } catch (error) {
        json([500, { error: error.message }]);
      }
    };
    if (req.method === "GET") return run();
    if (req.headers.origin !== `http://${req.headers.host}`) return reply(403);
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) return reply(415);
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_BYTES) chunks.push(chunk);
    });
    req.on("end", () => {
      if (bytes > MAX_BYTES) return reply(413);
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(400);
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) return reply(400);
      run(body);
    });
  };
  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  return {
    server,
    info,
    list,
    tick,
    git,
    settings: () => current,
    close: () => new Promise((ok) => {
      server.close(() => ok());
      server.closeAllConnections();
    })
  };
}
async function serve(options) {
  const app = createApp(options);
  await new Promise((ok, fail) => {
    app.server.once("error", fail).listen(options.port ?? 0, "127.0.0.1", () => {
      app.server.off("error", fail);
      ok();
    });
  });
  const timer = setInterval(() => app.tick(), 1e3).unref();
  app.server.on("close", () => clearInterval(timer));
  const port = app.server.address().port;
  return { app, port, url: `http://127.0.0.1:${port}` };
}
function call(port, method, path, body, headers = {}) {
  return new Promise((ok, fail) => {
    const req = request(
      { host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", origin: `http://127.0.0.1:${port}`, ...headers } },
      (res) => {
        let text = "";
        res.setEncoding("utf8").on("data", (c) => text += c).on("end", () => {
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = text;
          }
          ok({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", fail).end(body === void 0 ? void 0 : JSON.stringify(body));
  });
}

// ../core/src/selftest.ts
import assert from "node:assert/strict";
import { execFileSync as execFileSync3 } from "node:child_process";
import { appendFileSync as appendFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync3, mkdtempSync, readFileSync as readFileSync3, realpathSync as realpathSync3, rmSync as rmSync2, symlinkSync, writeFileSync as writeFileSync3 } from "node:fs";
import { request as request2 } from "node:http";
import { tmpdir } from "node:os";
import { basename as basename4, join as join4 } from "node:path";
var listen = async (o) => {
  const app = createApp({ log: () => {
  }, agent: "other", ...o });
  await new Promise((ok) => app.server.listen(0, "127.0.0.1", ok));
  return { app, port: app.server.address().port };
};
var raw = (port, path) => new Promise((ok) => request2({ host: "127.0.0.1", port, path }, (res) => {
  let text = "";
  res.setEncoding("utf8").on("data", (c) => text += c).on("end", () => ok({ status: res.statusCode ?? 0, type: String(res.headers["content-type"]), csp: String(res.headers["content-security-policy"]), text }));
}).end());
var gitIn = (root) => (...args) => execFileSync3("git", args, { cwd: root, encoding: "utf8" });
var newRepo = (prefix) => {
  const root = mkdtempSync(join4(tmpdir(), prefix));
  const sh = gitIn(root);
  sh("init", "-q", "-b", "main");
  sh("config", "user.email", "t@t");
  sh("config", "user.name", "t");
  return { root, sh };
};
async function selftest() {
  const temps = [];
  try {
    await pure();
    await gitCase(temps);
    await branchCase(temps);
    await switchCase(temps);
    await agentCase(temps);
    notARepo(temps);
  } finally {
    for (const t of temps) rmSync2(t, { recursive: true, force: true });
  }
}
async function pure() {
  assert.deepEqual(countStates([
    { state: "working", drafts: 2, updated: true, edited: true },
    { state: "rejected", updated: false, edited: false, drafts: 0 },
    { state: "skipped", updated: true, edited: false, drafts: 1 },
    { state: "accepted", updated: true, edited: true, drafts: 0 },
    { state: "queue", updated: true, edited: true, drafts: 1 },
    { state: "queue", updated: false, edited: true, drafts: 1 },
    { state: "queue", updated: false, edited: false, drafts: 1 },
    { state: "queue", updated: false, edited: false, drafts: 0 }
  ]), { working: 1, rejected: 1, skipped: 1, accepted: 1, updated: 1, edited: 1, drafts: 1, pending: 1 });
  const items = [
    { text: "Intro says use a badge here.", path: ["A"] },
    { text: "Use a badge for counts. Use a badge for status.", path: ["A", "B"] }
  ];
  const a = makeAnchor(items[1].text, 24, 47, ["A", "B"]);
  assert.equal(a.quote, "Use a badge for status.");
  const edited = [items[0], { text: "New first line. " + items[1].text, path: ["A", "B"] }];
  assert.deepEqual(findAnchor(edited, a), { i: 1, start: 40, end: 63, score: 24 });
  const tie = makeAnchor(items[1].text, 0, 11, ["A", "B"]);
  assert.equal(findAnchor(items, tie)?.start, 0);
  const second = makeAnchor(items[1].text, 24, 35, ["A", "B"]);
  assert.equal(findAnchor(items, second)?.start, 24, "prefix picks the second occurrence");
  const moved = { ...makeAnchor(items[0].text, 0, 5, ["Old heading"]) };
  assert.equal(findAnchor(items, moved)?.i, 0, "a renamed section falls back to the whole file");
  assert.equal(findAnchor(items, { ...a, quote: "gone" }), null);
  const b = blocks(DOC);
  assert.equal(b.map((x2) => x2.raw).join(""), DOC);
  assert.deepEqual(b.map((x2) => x2.type), ["frontmatter", "heading", "paragraph", "heading", "list"]);
  assert.deepEqual(b[4].path, ["A", "B"]);
  assert.equal(splice(DOC, 2, "Para 1."), DOC.replace("Para one.", "Para 1."));
  const m = matchBlocks(
    ["# A\n\n", "Use a badge for counts.\n\n", "Old aside.\n\n", "End.\n"],
    ["# A\n\n", "Use a badge for status counts.\n\n", "Brand new section here.\n\n", "End.\n"]
  );
  assert.deepEqual([...m.changed], [[1, "Use a badge for counts.\n\n"], [2, null]]);
  assert.deepEqual(m.removed, [{ before: 3, raw: "Old aside.\n\n" }]);
  assert.deepEqual(matchBlocks(["x\n"], ["x\n"]), { changed: /* @__PURE__ */ new Map(), removed: [] });
  assert.deepEqual(
    wordDiff("Use a badge for counts.", "Use a badge for status counts."),
    [{ op: "=", text: "Use a badge for ", old: "Use a badge for " }, { op: "+", text: "status " }, { op: "=", text: "counts.", old: "counts." }]
  );
  assert.deepEqual(
    wordDiff("hide content.", "hide content more"),
    [{ op: "=", text: "hide content ", old: "hide content" }, { op: "-", text: "." }, { op: "+", text: "more" }],
    "trailing space does not break a match, and the old spelling is kept"
  );
  assert.deepEqual(addedSpans(wordDiff("Use a badge.", "Use a big badge now.")), [[6, 9], [16, 19]]);
  assert.deepEqual(subtractSpans([[0, 10], [20, 30]], [[2, 4], [8, 22]]), [[0, 2], [4, 8], [22, 30]], "cuts holes and trims ends");
  assert.deepEqual(subtractSpans([[5, 9]], [[0, 20]]), [], "a span covered whole is gone");
}
var DOC = "---\ntitle: T\n---\n# A\n\nPara one.\n\n## B\n\n- x\n- y\n";
async function gitCase(temps) {
  const doc = DOC;
  const { root, sh } = newRepo("trove-git-");
  temps.push(root);
  writeFileSync3(join4(root, "a.md"), doc);
  mkdirSync3(join4(root, "gen"));
  writeFileSync3(join4(root, "gen/x.md"), "# gen\n");
  writeFileSync3(join4(root, "r.md"), "# R\n");
  sh("add", ".");
  sh("commit", "-qm", "base");
  sh("mv", "r.md", "r \xE9 \xF1.md");
  writeFileSync3(join4(root, "a.md"), doc.replace("Para one.", "Para one, changed."));
  writeFileSync3(join4(root, "b.md"), "# B\n");
  for (const out2 of ["x.mdx", "t.txt", "c.html"]) writeFileSync3(join4(root, out2), "<h1>C</h1><p>Hi</p>\n");
  writeFileSync3(join4(root, "gen/x.md"), "# gen 2\n");
  const gitDir = join4(root, ".git");
  mkdirSync3(join4(gitDir, "doc-review"));
  writeFileSync3(join4(gitDir, "doc-review", "events.log"), "old\n");
  const ui = mkdtempSync(join4(tmpdir(), "trove-ui-"));
  temps.push(ui);
  mkdirSync3(join4(ui, "assets"));
  writeFileSync3(join4(ui, "index.html"), "<!doctype html><title>Trove</title>");
  writeFileSync3(join4(ui, "assets", "app.js"), "export {};\n");
  writeFileSync3(join4(tmpdir(), "trove-outside.txt"), "secret");
  const lines = [];
  const opts = { root, exclude: ["gen/**"] };
  const { app, port } = await listen({ ...opts, quietMs: 300, log: (l3) => lines.push(l3), uiDir: ui });
  const stateDir = app.info().stateDir;
  const files = { drafts: join4(stateDir, "drafts.json"), edits: join4(stateDir, "edits.json"), batches: join4(stateDir, "batches.jsonl") };
  assert.equal(readFileSync3(join4(gitDir, "trove", "events.log"), "utf8"), "old\n", "doc-review/ became trove/");
  assert.equal(existsSync3(join4(gitDir, "doc-review")), false);
  const post = (path, body, headers) => call(port, "POST", path, body, headers);
  const get = (path, p = port) => call(p, "GET", path);
  const states = async () => Object.fromEntries((await get("/api/files")).body.files.map((f) => [f.path, f.state]));
  const staged = () => sh("diff", "--cached", "--name-only").trim();
  const restart = async () => await listen(opts);
  assert.deepEqual(await states(), { "a.md": "queue", "b.md": "queue", "c.html": "queue", "r \xE9 \xF1.md": "accepted" }, "only .md and .html; excluded and committed files stay out; a rename lists its new path once");
  sh("commit", "-qm", "rename");
  const baseOfFile = async (p) => (await get(`/api/file?path=${encodeURIComponent(p)}`)).body.base;
  assert.equal(await baseOfFile("a.md"), doc, "base: the staged copy");
  assert.equal(await baseOfFile("b.md"), null, "base: nothing for an untracked file");
  assert.equal((await get("/api/file?path=c.html")).body.kind, "html");
  assert.equal((await get("/api/file?path=a.md")).body.kind, "markdown");
  const info = (await get("/api/source")).body;
  assert.deepEqual(
    [info.kind, info.branch, info.scope, info.base, info.agent, info.port, info.doneCommand],
    ["git", "main", "uncommitted", null, "other", port, `trove done <file> --port ${port}`]
  );
  assert.equal(info.eventsLog, join4(stateDir, "events.log"));
  assert.deepEqual((await get("/api/settings")).body.exclude, ["gen/**"], "options override settings for this run");
  assert.equal((await post("/api/settings", { theme: "loud" })).status, 400);
  assert.equal((await post("/api/settings", { theme: "dark" }, { origin: "https://evil.example" })).status, 403);
  const s1 = await post("/api/settings", { theme: "dark", types: { txt: true } });
  assert.deepEqual([s1.status, s1.body.theme, s1.body.exclude], [200, "dark", ["gen/**"]]);
  assert.equal((await states())["t.txt"], "queue", "turning a type on lists it on the next request");
  assert.equal((await get("/api/file?path=t.txt")).body.kind, "text");
  await post("/api/settings", { types: { txt: false } });
  assert.equal((await states())["t.txt"], void 0);
  assert.equal(JSON.parse(readFileSync3(join4(stateDir, "settings.json"), "utf8")).theme, "dark", "saved per source");
  assert.equal(JSON.parse(readFileSync3(join4(stateDir, "settings.json"), "utf8")).exclude.length, 0, "a run override is not saved");
  assert.deepEqual(probeGit(join4(root, "gen"))?.branch, "main");
  symlinkSync(join4(root, "gone.md"), join4(root, "l.md"));
  assert.equal((await get("/api/file?path=l.md")).status, 500);
  assert.equal((await get("/api/files")).status, 200);
  rmSync2(join4(root, "l.md"));
  const page = await raw(port, "/");
  assert.deepEqual([page.status, page.type, page.text], [200, "text/html; charset=utf-8", "<!doctype html><title>Trove</title>"]);
  assert.match(page.csp, /script-src 'self';/, "no inline scripts");
  assert.equal((await raw(port, "/assets/app.js")).type, "text/javascript; charset=utf-8");
  for (const p of ["/../trove-outside.txt", "/%2e%2e/trove-outside.txt", "/assets/nope.js", "/api/nope"]) assert.equal((await raw(port, p)).status, 404, p);
  const frame = await raw(port, "/raw/c.html");
  assert.deepEqual([frame.status, frame.type, frame.csp, frame.text], [200, "text/html; charset=utf-8", "undefined", "<h1>C</h1><p>Hi</p>\n"]);
  for (const p of ["/raw/../trove-outside.txt", "/raw/%2e%2e/trove-outside.txt", "/raw/.git/config", "/raw/nope.html", "/raw/gen"]) assert.equal((await raw(port, p)).status, 404, p);
  const bare = await listen(opts);
  assert.equal((await raw(bare.port, "/")).status, 404, "no uiDir: no page");
  assert.equal((await get("/api/files", bare.port)).status, 200, "but the API answers");
  await bare.app.close();
  const html = (await get("/api/file?path=c.html")).body;
  assert.equal((await post("/api/save", { path: "c.html", hash: html.hash, raw: "<p>Whole</p>\n" })).status, 200);
  assert.equal(readFileSync3(join4(root, "c.html"), "utf8"), "<p>Whole</p>\n");
  assert.equal(staged(), "", "an HTML save does not stage");
  assert.equal((await post("/api/accept", { path: "c.html", hash: sha("<p>Whole</p>\n") })).status, 200);
  assert.equal((await states())["c.html"], "accepted");
  assert.equal((await post("/api/unaccept", { path: "c.html" })).status, 200);
  assert.equal((await states())["c.html"], "queue", "undo accept unstages");
  assert.equal(staged(), "");
  const all = await post("/api/accept-all", { paths: ["a.md", "c.html", "c.html", "nope.md", "../etc/passwd"] });
  assert.deepEqual([all.status, all.body], [200, { accepted: 2 }], "accept all: listed paths once, the rest passed over");
  assert.deepEqual(await states(), { "a.md": "accepted", "b.md": "queue", "c.html": "accepted", "r \xE9 \xF1.md": "accepted" });
  for (const path of ["a.md", "c.html"]) assert.equal((await post("/api/unaccept", { path })).status, 200);
  assert.equal(staged(), "");
  assert.equal((await post("/api/accept", { path: "a.md" }, { host: "evil.example" })).status, 403);
  assert.equal((await post("/api/accept", { path: "a.md" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/accept", { path: "a.md" }, { origin: "" })).status, 403);
  assert.equal((await post("/api/accept", { path: "a.md" }, { "content-type": "text/plain" })).status, 415);
  assert.equal((await post("/api/drafts", { path: "a.md", drafts: ["x".repeat(600 * 1024)] })).status, 413);
  for (const path of ["../etc/passwd", "gen/x.md", join4(root, ".git/config")]) {
    assert.equal((await get(`/api/file?path=${encodeURIComponent(path)}`)).status, 404, path);
  }
  assert.equal(staged(), "", "nothing refused touched the index");
  const shown = (await get("/api/file?path=a.md")).body.hash;
  const stale = await post("/api/accept", { path: "a.md", hash: "stale" });
  assert.deepEqual([stale.status, stale.body.hash], [409, shown], "accepting a version the user did not see is refused");
  assert.equal(staged(), "", "a refused accept leaves the index alone");
  assert.equal((await post("/api/accept", { path: "a.md", hash: shown })).status, 200);
  assert.equal(staged(), "a.md");
  assert.equal((await states())["a.md"], "accepted");
  sh("commit", "-qm", "committed elsewhere");
  assert.equal((await states())["a.md"], "accepted", "a file seen this session stays listed after git stops reporting it");
  const committedRow = async (p) => (await get("/api/files", p)).body.files.find((f) => f.path === "a.md");
  assert.equal((await committedRow(port)).committed, true, "and is marked committed");
  const later2 = await restart();
  assert.equal((await committedRow(later2.port))?.committed, true, "still listed as committed after a restart");
  await later2.app.close();
  const file = (await get("/api/file?path=a.md")).body;
  assert.equal((await post("/api/save", { path: "a.md", hash: "stale", index: 2, raw: "X" })).status, 409);
  sh("add", "a.md");
  const beforeEdit = readFileSync3(join4(root, "a.md"), "utf8");
  const saved = await post("/api/save", { path: "a.md", hash: file.hash, index: 2, raw: "Para one, edited." });
  assert.equal(saved.status, 200);
  assert.equal(staged(), "", "a save unstages and does not stage");
  const row = async (p) => (await get("/api/files")).body.files.find((f) => f.path === p);
  assert.deepEqual([(await row("a.md")).state, (await row("a.md")).edited], ["queue", true]);
  const again = await restart();
  assert.equal((await get("/api/files", again.port)).body.files.find((f) => f.path === "a.md").edited, true, "Edited survives a restart");
  await again.app.close();
  assert.equal((await post("/api/save", { path: "a.md", hash: saved.body.hash, index: 2, raw: "Para one, twice." })).status, 200);
  assert.equal((await post("/api/revert", { path: "a.md" })).status, 200);
  assert.equal(readFileSync3(join4(root, "a.md"), "utf8"), beforeEdit, "revert restores the text before the first edit");
  assert.deepEqual([(await row("a.md")).edited, staged()], [false, ""]);
  assert.equal((await post("/api/revert", { path: "a.md" })).status, 404, "nothing left to revert");
  const s2 = await post("/api/save", { path: "a.md", hash: sha(beforeEdit), index: 2, raw: "Para two." });
  assert.equal(s2.status, 200);
  writeFileSync3(join4(root, "a.md"), readFileSync3(join4(root, "a.md"), "utf8") + "\nMore.\n");
  assert.equal((await get("/api/file?path=a.md")).body.revertable, false);
  assert.equal((await post("/api/revert", { path: "a.md" })).status, 409);
  writeFileSync3(join4(root, "a.md"), doc.replace("Para one.", "Para two."));
  const now = (await get("/api/file?path=a.md")).body.hash;
  assert.equal((await post("/api/accept", { path: "a.md", hash: now })).status, 200);
  assert.deepEqual([(await row("a.md")).state, (await row("a.md")).edited], ["accepted", false]);
  assert.equal(JSON.parse(readFileSync3(files.edits, "utf8"))["a.md"], void 0, "the snapshot is gone");
  const base = readFileSync3(join4(root, "a.md"), "utf8");
  const saveBlock = async (index, raw2) => post("/api/save", { path: "a.md", hash: sha(readFileSync3(join4(root, "a.md"), "utf8")), index, raw: raw2 });
  await saveBlock(2, "Para X.");
  await saveBlock(2, "Para Y.");
  await saveBlock(4, "- z");
  const editsNow = (await get("/api/file?path=a.md")).body.edits;
  assert.deepEqual(editsNow.map((x2) => [x2.index, x2.before, x2.after, x2.ok]), [[2, "Para two.", "Para Y.", true], [4, "- x\n- y", "- z", true]]);
  const later = await restart();
  assert.equal((await get("/api/file?path=a.md", later.port)).body.edits.length, 2, "edits survive a restart");
  await later.app.close();
  const withList = readFileSync3(join4(root, "a.md"), "utf8");
  assert.equal((await post("/api/revert", { path: "a.md", edit: editsNow[0].id, hash: sha(withList) })).status, 200);
  assert.equal(readFileSync3(join4(root, "a.md"), "utf8"), withList.replace("Para Y.", "Para two."), "only that block changed");
  assert.equal(staged(), "", "reverting does not stage");
  writeFileSync3(join4(root, "a.md"), readFileSync3(join4(root, "a.md"), "utf8").replace("- z", "- w"));
  assert.equal((await get("/api/file?path=a.md")).body.edits[0].ok, false);
  assert.equal((await post("/api/revert", { path: "a.md", edit: editsNow[1].id })).status, 409, "refused once the text changed");
  writeFileSync3(join4(root, "a.md"), readFileSync3(join4(root, "a.md"), "utf8").replace("- w", "- z"));
  assert.equal((await post("/api/revert", { path: "a.md", edit: editsNow[1].id })).status, 200);
  assert.equal(readFileSync3(join4(root, "a.md"), "utf8"), base, "both reverts give back the original bytes");
  assert.equal((await row("a.md")).edited, false, "the last revert clears Edited");
  await saveBlock(2, "Para Z.");
  assert.equal((await post("/api/accept", { path: "a.md", hash: sha(readFileSync3(join4(root, "a.md"), "utf8")) })).status, 200);
  assert.deepEqual((await get("/api/file?path=a.md")).body.edits, [], "Accept clears the edits");
  const anchor = makeAnchor("Para two.", 0, 4, ["A"]);
  await post("/api/drafts", { path: "a.md", drafts: [{ kind: "change", note: "shorter", anchor }] });
  await post("/api/drafts", { path: "b.md", drafts: [{ kind: "explain", note: "why?", anchor }] });
  assert.equal(JSON.parse(readFileSync3(files.drafts, "utf8"))["a.md"][0].note, "shorter");
  const stored = JSON.parse(readFileSync3(files.drafts, "utf8"));
  writeFileSync3(files.drafts, JSON.stringify({ ...stored, "gone.md": [{ kind: "change", note: "x", anchor }] }));
  assert.deepEqual(Object.keys((await get("/api/drafts")).body.drafts).sort(), ["a.md", "b.md"], "only listed files");
  assert.equal((await call(port, "GET", "/api/drafts", void 0, { host: "evil.example" })).status, 403);
  writeFileSync3(files.drafts, JSON.stringify(stored));
  const atSend = readFileSync3(join4(root, "a.md"), "utf8");
  const sent = await post("/api/send", {});
  assert.deepEqual([sent.body.comments, sent.body.files, sent.body.locked], [2, 2, ["a.md"]]);
  assert.deepEqual(await states(), { "a.md": "working", "b.md": "queue", "c.html": "queue", "r \xE9 \xF1.md": "accepted" }, "explain-only files do not lock");
  assert.equal(staged(), "", "sending unstages");
  assert.deepEqual(lines, [`batch ${sent.body.id}: 2 comments on 2 files. Read it with: grep -F ${sent.body.id} '${files.batches}'`]);
  assert.equal(readFileSync3(join4(stateDir, "events.log"), "utf8"), `old
${lines[0]}
`, "the notice goes to the events log");
  assert.equal(JSON.parse(readFileSync3(files.batches, "utf8")).items.length, 2);
  assert.deepEqual(JSON.parse(readFileSync3(files.drafts, "utf8")), {});
  const busy = await post("/api/accept", { path: "a.md", hash: sha(readFileSync3(join4(root, "a.md"), "utf8")) });
  assert.deepEqual([busy.status, busy.body.error], [409, "The agent is working on this file"], "locked: no accept");
  assert.equal((await post("/api/unaccept", { path: "a.md" })).status, 409, "locked: no undo accept");
  assert.equal((await post("/api/save", { path: "a.md", hash: sha(readFileSync3(join4(root, "a.md"), "utf8")), index: 2, raw: "Y" })).status, 409, "locked: no edit");
  assert.equal((await post("/api/send", {})).status, 400, "nothing left to send");
  await post("/api/drafts", { path: "a.md", drafts: [{ kind: "change", note: "later", anchor }] });
  await post("/api/drafts", { path: "b.md", drafts: [{ kind: "explain", note: "now", anchor }] });
  const partial = await post("/api/send", {});
  assert.deepEqual([partial.body.comments, partial.body.locked], [1, []]);
  assert.equal(JSON.parse(readFileSync3(files.batches, "utf8").trim().split("\n").at(-1)).items[0].path, "b.md");
  assert.deepEqual(Object.keys((await get("/api/drafts")).body.drafts), ["a.md"], "the locked file keeps its drafts");
  const ex = { kind: "explain", note: "why", anchor };
  const ch = { kind: "change", note: "fix", anchor };
  await post("/api/drafts", { path: "b.md", drafts: [ch, ex] });
  await post("/api/drafts", { path: "c.html", drafts: [ex] });
  const onlyC = await post("/api/send", { paths: ["c.html"] });
  assert.deepEqual([onlyC.body.comments, onlyC.body.files], [1, 1]);
  assert.deepEqual((await get("/api/drafts")).body.drafts["b.md"].length, 2, "other files keep their drafts");
  const explains = await post("/api/send", { kind: "explain" });
  assert.deepEqual([explains.body.comments, explains.body.locked], [1, []]);
  assert.deepEqual((await get("/api/drafts")).body.drafts["b.md"], [ch], "the change comment stays a draft");
  assert.equal((await post("/api/send", { kind: "nope" })).status, 400);
  assert.equal((await post("/api/send", { paths: ["../x.md"] })).status, 400, "a path outside the set sends nothing");
  await post("/api/drafts", { path: "b.md", drafts: [] });
  assert.equal((await post("/api/ask", { text: "Which tier?" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await post("/api/ask", { text: "  Which tier?  " })).body.question.text, "Which tier?");
  assert.equal((await get("/api/files")).body.question.text, "Which tier?");
  const reopened = await restart();
  assert.equal((await get("/api/files", reopened.port)).body.question.text, "Which tier?", "a waiting question survives a restart");
  await reopened.app.close();
  assert.equal((await post("/api/ask", { text: "Answered 2 explain comments", kind: "reply" })).body.question.kind, "reply");
  assert.equal((await post("/api/ask", { text: "x", kind: "nope" })).status, 400);
  await post("/api/ask", { text: "" });
  assert.equal((await get("/api/files")).body.question, null, "an empty text clears it");
  writeFileSync3(join4(root, "a.md"), doc.replace("Para one.", "Para, by the agent."));
  assert.deepEqual((await post("/api/release", { path: join4(root, "a.md") })).body, { released: true, updated: true });
  const after = (await get("/api/files")).body.files.find((f) => f.path === "a.md");
  assert.deepEqual([after.state, after.updated], ["queue", true]);
  assert.equal((await get("/api/file?path=a.md")).body.since, atSend, "an updated file keeps its text from the send");
  const restarted = await restart();
  assert.equal((await get("/api/file?path=a.md", restarted.port)).body.since, atSend, "the snapshot survives a restart");
  await restarted.app.close();
  const working = async () => Object.values(await states()).filter((s) => s === "working").length;
  await post("/api/drafts", { path: "a.md", drafts: [{ kind: "change", note: "again", anchor }] });
  await post("/api/send", {});
  app.tick(0);
  assert.equal(await working(), 1, "unchanged stays locked");
  writeFileSync3(join4(root, "a.md"), "edited\n");
  app.tick(1e3);
  assert.equal(await working(), 1, "still changing stays locked");
  app.tick(1200);
  assert.equal(await working(), 1);
  app.tick(1300);
  assert.equal(await working(), 0, "quiet long enough releases");
  await post("/api/drafts", { path: "b.md", drafts: [{ kind: "change", note: "x", anchor }] });
  await post("/api/send", {});
  const relaunched = await restart();
  assert.equal((await get("/api/files", relaunched.port)).body.files.find((f) => f.path === "b.md").state, "working", "a lock survives a restart");
  await relaunched.app.close();
  assert.deepEqual((await post("/api/release", { path: "b.md" })).body, { released: true, updated: false });
  const indexed = (p) => sh("diff", "--cached", "--name-only", "--", p).trim();
  assert.equal((await post("/api/skip", { path: "b.md", on: true })).status, 200);
  assert.deepEqual([(await states())["b.md"], indexed("b.md")], ["skipped", ""], "skipping touches no git state");
  await post("/api/skip", { path: "b.md", on: false });
  assert.equal((await states())["b.md"], "queue");
  writeFileSync3(join4(root, "a.md"), doc.replace("Para one.", "Para, to reject."));
  const aText = readFileSync3(join4(root, "a.md"), "utf8");
  await post("/api/skip", { path: "a.md", on: true });
  assert.equal((await post("/api/reject", { path: "a.md", hash: "stale" })).status, 409);
  assert.equal((await post("/api/reject", { path: "a.md", hash: sha(aText) })).status, 200);
  assert.equal(readFileSync3(join4(root, "a.md"), "utf8"), sh("show", "HEAD:a.md"), "a tracked file goes back to HEAD");
  assert.deepEqual([(await states())["a.md"], indexed("a.md")], ["rejected", ""]);
  const shownGone = (await get("/api/file?path=a.md")).body;
  assert.deepEqual([shownGone.text, shownGone.locked, shownGone.rejected, shownGone.base], [aText, true, true, sh("show", "HEAD:a.md")], "a rejected file shows what was rejected, read-only, against the file now");
  assert.deepEqual((await post("/api/accept", { path: "a.md", hash: sha(aText) })).body, { error: "Rejected: restore it first" }, "no accepting a rejected file");
  assert.equal((await post("/api/save", { path: "a.md", hash: sha(aText), index: 2, raw: "X" })).status, 409, "no editing a rejected file");
  assert.equal((await post("/api/reject", { path: "a.md", hash: sha(aText) })).status, 409, "already rejected");
  assert.equal((await post("/api/restore", { path: "a.md" })).status, 200);
  assert.deepEqual([readFileSync3(join4(root, "a.md"), "utf8"), (await states())["a.md"]], [aText, "queue"], "restore puts it back, no longer skipped");
  await post("/api/drafts", { path: "b.md", drafts: [{ kind: "change", note: "keep me", anchor }] });
  const bText = readFileSync3(join4(root, "b.md"), "utf8");
  assert.equal((await post("/api/reject", { path: "b.md", hash: sha(bText) })).status, 200);
  assert.equal(existsSync3(join4(root, "b.md")), false, "a new file is deleted");
  assert.equal((await get("/api/drafts")).body.drafts["b.md"], void 0, "its drafts go with it");
  assert.equal((await post("/api/send", { paths: ["b.md"] })).status, 400, "nothing of a rejected file is sent");
  const afterRestart = await restart();
  assert.equal((await get("/api/files", afterRestart.port)).body.files.find((f) => f.path === "b.md")?.state, "rejected", "the backup survives a restart");
  await afterRestart.app.close();
  assert.equal((await post("/api/restore", { path: "b.md" })).status, 200);
  assert.equal(readFileSync3(join4(root, "b.md"), "utf8"), bText);
  assert.equal((await get("/api/drafts")).body.drafts["b.md"][0].note, "keep me", "and its drafts come back");
  assert.equal((await post("/api/reject", { path: "b.md", hash: sha(bText) })).status, 200);
  writeFileSync3(join4(root, "b.md"), "# B, regenerated\n");
  assert.equal((await states())["b.md"], "queue");
  assert.equal((await post("/api/restore", { path: "b.md" })).status, 404);
  assert.equal((await post("/api/pr", {})).status, 409, "pending files: no PR");
  await post("/api/accept-all", { paths: Object.keys(await states()) });
  const head = sh("rev-parse", "HEAD");
  const pr = await post("/api/pr", {});
  assert.equal(pr.status, 200);
  assert.equal(lines.at(-1), `pr ${pr.body.id}: the review is done; commit the ${pr.body.files} staged files and open a pull request.`);
  assert.equal(readFileSync3(join4(stateDir, "events.log"), "utf8").trim().split("\n").at(-1), lines.at(-1), "the request goes to the events log");
  assert.equal(sh("rev-parse", "HEAD"), head, "Trove never commits");
  await app.close();
  rmSync2(join4(tmpdir(), "trove-outside.txt"), { force: true });
}
async function branchCase(temps) {
  const { root, sh } = newRepo("trove-branch-");
  temps.push(root);
  for (const f of ["old.md", "same.md", "edit.md"]) writeFileSync3(join4(root, f), `# ${f}
`);
  sh("add", ".");
  sh("commit", "-qm", "base");
  sh("checkout", "-qb", "feature");
  writeFileSync3(join4(root, "edit.md"), "# edit.md\n\nOn the branch.\n");
  writeFileSync3(join4(root, "new.md"), "# new\n");
  sh("add", ".");
  sh("commit", "-qm", "branch work");
  writeFileSync3(join4(root, "old.md"), "# old.md, uncommitted\n");
  const probe = probeGit(root);
  assert.deepEqual(
    [probe.branch, probe.branches, probe.defaultBase, probe.local.map((b) => [b.name, b.current, b.worktree])],
    ["feature", ["feature", "main"], "main", [["feature", true, null], ["main", false, null]]]
  );
  const { app, port } = await listen({ root });
  const rows = async () => Object.fromEntries((await call(port, "GET", "/api/files")).body.files.map((f) => [f.path, f.state]));
  assert.deepEqual(await rows(), { "old.md": "queue" }, "uncommitted: the working tree only");
  const s = await call(port, "POST", "/api/settings", { scope: "branch" });
  assert.equal(s.body.scope, "branch");
  assert.deepEqual(await rows(), { "edit.md": "accepted", "new.md": "accepted", "old.md": "queue" }, "branch: committed changes list as accepted");
  const info = (await call(port, "GET", "/api/source")).body;
  assert.deepEqual([info.scope, info.base, info.branch], ["branch", "main", "feature"]);
  const edit = (await call(port, "GET", "/api/file?path=edit.md")).body;
  assert.equal(edit.base, "# edit.md\n", "Show new marks against the merge-base");
  assert.equal((await call(port, "GET", "/api/file?path=new.md")).body.base, null, "a file the branch added has no earlier copy");
  const saved = await call(port, "POST", "/api/save", { path: "edit.md", hash: edit.hash, index: 1, raw: "Edited on review." });
  assert.equal(saved.status, 200);
  assert.equal((await rows())["edit.md"], "queue");
  assert.equal((await call(port, "POST", "/api/accept", { path: "edit.md", hash: saved.body.hash })).status, 200);
  assert.equal((await rows())["edit.md"], "accepted");
  await call(port, "POST", "/api/settings", { base: "feature" });
  assert.deepEqual(Object.keys(await rows()), ["edit.md", "old.md"], "base = HEAD: only uncommitted work (and what was seen)");
  await call(port, "POST", "/api/settings", { scope: "uncommitted", base: null });
  assert.equal((await rows())["new.md"], void 0, "back to uncommitted: branch files never seen are not listed as committed");
  await app.close();
  const cli = await listen({ root, scope: "branch" });
  assert.equal(cli.app.settings().scope, "branch");
  assert.equal(JSON.parse(readFileSync3(join4(cli.app.info().stateDir, "settings.json"), "utf8")).scope, "uncommitted");
  await cli.app.close();
}
async function switchCase(temps) {
  const { root, sh } = newRepo("trove-switch-");
  const wtDir = mkdtempSync(join4(tmpdir(), "trove-wt-"));
  temps.push(root, wtDir);
  writeFileSync3(join4(root, "a.md"), "# A\n");
  writeFileSync3(join4(root, "b.md"), "# B\n");
  sh("add", ".");
  sh("commit", "-qm", "base");
  sh("branch", "wt");
  sh("checkout", "-qb", "free");
  writeFileSync3(join4(root, "a.md"), "# A on free\n");
  sh("commit", "-qam", "free");
  sh("checkout", "-q", "main");
  rmSync2(wtDir, { recursive: true });
  sh("worktree", "add", "-q", wtDir, "wt");
  const wtPath = realpathSync3(wtDir);
  const { app, port } = await listen({ root });
  const get = async (path) => (await call(port, "GET", path)).body;
  const sw = (branch) => call(port, "POST", "/api/switch", { branch });
  const paths = async () => (await get("/api/files")).files.map((f) => f.path);
  const info = await get("/api/git");
  assert.deepEqual(
    [info.branch, info.branches.map((b) => [b.name, b.current, b.worktree])],
    ["main", [["free", false, null], ["main", true, null], ["wt", false, wtPath]]],
    "the worktree branch says where it is checked out"
  );
  assert.deepEqual(info.worktrees.map((w) => [w.path, w.branch, w.current]), [[realpathSync3(root), "main", true], [wtPath, "wt", false]]);
  assert.equal(info.dirty, 0);
  assert.equal(probeGit(wtDir)?.branch, "wt", "a worktree is a repository of its own");
  const main2 = realpathSync3(root);
  assert.deepEqual([info.repo, info.worktree], [{ root: main2, name: basename4(main2) }, { path: main2, name: basename4(main2), branch: "main", main: true }]);
  sh("worktree", "add", "-q", "-b", "nested", join4(root, ".claude/worktrees/nested"));
  const nested = realpathSync3(join4(root, ".claude/worktrees/nested"));
  mkdirSync3(join4(nested, "docs"));
  const probe = probeGit(join4(nested, "docs"));
  assert.deepEqual([probe.branch, probe.repo, probe.worktree], ["nested", { root: main2, name: basename4(main2) }, { path: nested, name: "nested", branch: "nested", main: false }]);
  const rows = (list) => list.map((w) => [w.path, w.name, w.branch, w.current, w.main]).sort((a, b) => Number(b[4]) - Number(a[4]) || a[0].localeCompare(b[0]));
  assert.deepEqual(rows(probe.worktrees), rows([
    { path: main2, name: basename4(main2), branch: "main", current: false, main: true },
    { path: wtPath, name: basename4(wtPath), branch: "wt", current: false, main: false },
    { path: nested, name: "nested", branch: "nested", current: true, main: false }
  ]));
  assert.equal(probe.worktrees[0].path, main2, "the main checkout first");
  const nestedApp = await listen({ root: join4(nested, "docs") });
  const nestedSource = (await call(nestedApp.port, "GET", "/api/source")).body;
  assert.deepEqual([nestedSource.root, nestedSource.repo.name, nestedSource.worktree.name, nestedSource.worktree.main], [nested, basename4(main2), "nested", false]);
  await nestedApp.app.close();
  const again = await get("/api/git");
  assert.deepEqual([again.worktrees.length, again.dirty, again.worktree.main], [3, 0, true]);
  writeFileSync3(join4(root, "b.md"), "# B, uncommitted\n");
  writeFileSync3(join4(root, "a.md"), "# A, uncommitted\n");
  assert.equal((await get("/api/git")).dirty, 2);
  assert.deepEqual(
    (await get("/api/git")).worktrees.map((w) => [w.path, w.changes]).filter(([p]) => p !== nested),
    [[main2, 2], [wtPath, 0]],
    "each worktree counts its own changes"
  );
  assert.equal(probeGit(wtDir).worktrees.find((w) => w.main).changes, 2, "a probe from another worktree sees them too");
  const refused = await sw("free");
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /overwritten/, "git's own message");
  assert.deepEqual([(await get("/api/git")).branch, readFileSync3(join4(root, "a.md"), "utf8")], ["main", "# A, uncommitted\n"], "nothing changed");
  sh("checkout", "--", "a.md");
  const busy = await sw("wt");
  assert.deepEqual([busy.status, busy.body.worktree], [409, wtPath], "a branch checked out elsewhere: open that worktree instead");
  assert.equal((await sw("nope")).status, 404);
  await call(port, "POST", "/api/drafts", { path: "b.md", drafts: [{ kind: "change", note: "n", anchor: { quote: "B", prefix: "", suffix: "", path: [], raw: "" } }] });
  assert.equal((await call(port, "POST", "/api/send", {})).status, 200);
  assert.match((await sw("free")).body.error, /working on a file/, "no switching under the agent");
  await call(port, "POST", "/api/release", { path: "b.md" });
  assert.deepEqual(await paths(), ["b.md"]);
  const done = await sw("free");
  assert.deepEqual([done.status, done.body.branch, done.body.dirty], [200, "free", 1]);
  assert.deepEqual(
    [await paths(), readFileSync3(join4(root, "a.md"), "utf8"), (await get("/api/source")).branch],
    [["b.md"], "# A on free\n", "free"],
    "the queue re-lists on the new branch; uncommitted work comes along, as with git switch"
  );
  assert.equal((await sw("free")).status, 200, "the current branch is a no-op");
  await app.close();
  sh("worktree", "remove", "--force", wtDir);
  sh("worktree", "remove", "--force", nested);
}
async function agentCase(temps) {
  const { root } = newRepo("trove-agent-");
  temps.push(root);
  writeFileSync3(join4(root, "a.md"), "# A\n\nText.\n");
  assert.deepEqual([alive(process.pid), alive(2 ** 22 + 7), agentAbove(process.pid, "other")], [true, false, null]);
  const opts = { root, agent: null };
  let { app, port } = await listen(opts);
  const source = async () => (await call(port, "GET", "/api/source")).body;
  const none = { id: "other", label: "the agent", connected: false, at: null };
  assert.deepEqual([(await source()).agentInfo, (await source()).agent], [none, "other"], "nothing attached");
  assert.equal((await call(port, "POST", "/api/agent", { id: "cursor" })).status, 400);
  const codex = await call(port, "POST", "/api/agent", { id: "codex" });
  assert.deepEqual([codex.status, codex.body.id, codex.body.label, codex.body.connected], [200, "codex", "Codex", true]);
  assert.deepEqual([(await source()).agentInfo, (await source()).agent], [codex.body, "other"], "/api/source reflects it");
  const anchor = { quote: "Text", prefix: "", suffix: "", path: [], raw: "" };
  await call(port, "POST", "/api/drafts", { path: "a.md", drafts: [{ kind: "change", note: "n", anchor }] });
  const sent = (await call(port, "POST", "/api/send", {})).body;
  const hash = sha(readFileSync3(join4(root, "a.md"), "utf8"));
  assert.equal((await call(port, "POST", "/api/accept", { path: "a.md", hash })).body.error, "Codex is working on this file", "BUSY names it");
  await call(port, "POST", "/api/agent", { id: "other", label: "Cursor" });
  assert.equal((await call(port, "POST", "/api/accept", { path: "a.md", hash })).body.error, "Cursor is working on this file", "a label of its own");
  const claude = (await call(port, "POST", "/api/agent", { id: "claude" })).body;
  await app.close();
  ({ app, port } = await listen(opts));
  assert.deepEqual(
    [(await source()).agentInfo, (await source()).agent],
    [{ ...claude, connected: false }, "claude"],
    "who attached survives a restart; with no process to follow, connected does not"
  );
  assert.deepEqual((await call(port, "POST", "/api/agent", { id: null })).body, none, "detach");
  appendFileSync2((await source()).eventsLog, "pr 7: opened\n");
  const activity = (await call(port, "GET", "/api/activity")).body.entries.map((e) => [e.kind, e.text, e.comments]);
  assert.deepEqual(activity, [["batch", sent.id, 1], ["detach", "Claude", void 0], ["event", "pr 7: opened", void 0]]);
  assert.equal((await call(port, "GET", "/api/activity", void 0, { host: "evil.example" })).status, 403);
  assert.equal((await call(port, "POST", "/api/accept", { path: "a.md", hash })).body.error, "The agent is working on this file");
  await app.close();
  ({ app, port } = await listen(opts));
  assert.deepEqual((await source()).agentInfo, none, "detach survives a restart");
  await app.close();
  ({ app, port } = await listen({ root, agent: "claude" }));
  assert.deepEqual([(await source()).agentInfo.label, (await source()).agentInfo.connected], ["Claude", true], "the serving agent is attached");
  await app.close();
}
function notARepo(temps) {
  const root = mkdtempSync(join4(tmpdir(), "trove-plain-"));
  temps.push(root);
  writeFileSync3(join4(root, "a.md"), "# A\n");
  assert.equal(probeGit(root), null);
  assert.throws(() => createApp({ root, log: () => {
  } }), { message: `not a git repository: ${root}` });
}

// bin/trove.mjs
var USAGE = 'usage: trove serve [--root <path>] [--port 4824] [--exclude <glob>]... [--scope uncommitted|branch] [--base <ref>] [--ui <dir>] | attach --port N [--agent claude|codex|other] | detach --port N | info --port N | done <file> [--port 4824] | ask "<question>" | reply "<summary>" | ask --clear [--port 4824] | --selftest';
var here = dirname3(fileURLToPath(import.meta.url));
var invoked = () => {
  const script = process.argv[1] ?? "";
  if (basename5(script) === "trove") return "trove";
  const path = realpathSync4(script);
  return /[\s'"$`\\]/.test(path) ? `node '${path.replaceAll("'", String.raw`'\''`)}'` : `node ${path}`;
};
var defaultUi = () => [join5(here, "ui"), resolve2(here, "../../ui/dist")].find((d) => existsSync4(join5(d, "index.html"))) ?? null;
async function firstLine(port) {
  const [source, files, git] = await Promise.all(["/api/source", "/api/files", "/api/git"].map((p) => call(port, "GET", p)));
  if ([source, files, git].some((r) => r.status !== 200) || !source.body?.eventsLog) throw new Error(`port ${port} is not a Trove server`);
  const queued = files.body.files.filter((f) => !f.staged).length;
  return `reviewing ${queued} files on ${git.body.branch ?? git.body.head}${git.body.worktree && !git.body.worktree.main ? ` (${git.body.worktree.name})` : ""} at http://127.0.0.1:${port}; notices in ${source.body.eventsLog}; after each file run: ${invoked()} done <file> --port ${port}`;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--selftest") {
    await selftest();
    console.log("selftest ok");
    return;
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      root: { type: "string", default: "." },
      port: { type: "string", default: "4824" },
      exclude: { type: "string", multiple: true },
      scope: { type: "string" },
      base: { type: "string" },
      ui: { type: "string" },
      clear: { type: "boolean" },
      agent: { type: "string", default: "claude" }
    }
  });
  const port = Number(values.port);
  const failed = (e) => ({ status: 0, body: { error: e.message } });
  if ((command === "ask" || command === "reply") && (positionals[0] || values.clear)) {
    const kind = command === "reply" ? "reply" : "question";
    const r = await call(port, "POST", "/api/ask", { text: values.clear ? "" : positionals.join(" "), kind }).catch(failed);
    console.log(r.status === 200 ? r.body.question ? `the page shows your ${kind} is waiting` : "cleared" : `${command} failed: ${r.body?.error ?? r.status}`);
    process.exitCode = r.status === 200 ? 0 : 1;
    return;
  }
  if (command === "done" && positionals[0]) {
    const file = existsSync4(positionals[0]) ? resolve2(positionals[0]) : positionals[0];
    const r = await call(port, "POST", "/api/release", { path: file }).catch(failed);
    console.log(r.status === 200 ? r.body.released ? `released ${positionals[0]}` : `${positionals[0]} was not locked` : `done failed: ${r.body?.error ?? r.status}`);
    process.exitCode = r.status === 200 ? 0 : 1;
    return;
  }
  if (command === "attach" || command === "detach" || command === "info") {
    if (command === "attach" && !["claude", "codex", "other"].includes(values.agent)) {
      console.log(USAGE);
      process.exitCode = 1;
      return;
    }
    try {
      if (command !== "info") {
        const r = await call(port, "POST", "/api/agent", { id: command === "attach" ? values.agent : null });
        if (r.status !== 200) throw new Error(`port ${port} is not a Trove server`);
      }
      console.log(command === "detach" ? `detached from port ${port}` : await firstLine(port));
    } catch (error) {
      console.log(error.code === "ECONNREFUSED" ? `nothing is serving on port ${port}: start one with trove serve, or pass the right --port` : `${command} failed: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }
  if (command !== "serve" || values.scope && !["uncommitted", "branch"].includes(values.scope)) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const cmd = invoked();
  try {
    const { port: bound } = await serve({
      root: resolve2(values.root),
      port,
      exclude: values.exclude,
      scope: (
        /** @type {'uncommitted' | 'branch' | undefined} */
        values.scope
      ),
      base: values.base,
      uiDir: values.ui ? resolve2(values.ui) : defaultUi(),
      doneCommand: (p) => `${cmd} done <file> --port ${p}`
    });
    console.log(await firstLine(bound));
  } catch (error) {
    console.log(error.code === "EADDRINUSE" ? `port ${port} is busy: another session is probably serving. Stop it, or pass --port.` : error.message.startsWith("not a git repository") ? error.message : `server failed: ${error.message}`);
    process.exitCode = 1;
  }
}
main();
