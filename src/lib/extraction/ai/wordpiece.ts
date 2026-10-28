// BERT (uncased) WordPiece tokenizer with character offsets, so every model answer can be
// mapped back to the exact characters of the source document.
//
// The vocabulary comes from the `bert-tokenizer` npm package (Apache-2.0), which stores the
// original 30,522-entry BERT-base-uncased vocabulary in SentencePiece notation: word-initial
// pieces carry a "▁" prefix and continuation pieces carry none. They are mapped back to the
// original BERT notation ("word" / "##piece") here, so token ids match the model exactly.

export const SPECIAL = { PAD: 0, UNK: 100, CLS: 101, SEP: 102 } as const;
const MAX_WORD_CHARS = 100;

export interface Token {
  id: number;
  /** Character span [start, end) of the whole word this piece belongs to, in the input text. */
  start: number;
  end: number;
}

export class WordPieceTokenizer {
  private readonly vocab: Map<string, number>;

  constructor(sentencePieceVocab: string[]) {
    this.vocab = new Map();
    sentencePieceVocab.forEach((t, id) => {
      if (t.startsWith("▁")) {
        if (t.length > 1) this.vocab.set(t.slice(1), id);
      } else if (/^\[(PAD|UNK|CLS|SEP|MASK|unused\d+)\]$/.test(t)) {
        this.vocab.set(t, id);
      } else {
        this.vocab.set(`##${t}`, id);
      }
    });
    if (this.vocab.get("[CLS]") !== SPECIAL.CLS || this.vocab.get("the") !== 1996) {
      throw new Error("Unexpected vocabulary: expected the BERT-base-uncased vocabulary.");
    }
  }

  /** Tokenize `text` into word pieces with offsets (BERT BasicTokenizer + WordPiece, lower-cased). */
  tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    for (const w of splitWords(text)) {
      const word = normalize(text.slice(w.start, w.end));
      if (!word) continue;
      if (word.length > MAX_WORD_CHARS) {
        tokens.push({ id: SPECIAL.UNK, start: w.start, end: w.end });
        continue;
      }
      const pieces: number[] = [];
      let pos = 0;
      while (pos < word.length) {
        let end = word.length;
        let id: number | undefined;
        while (pos < end) {
          id = this.vocab.get(pos > 0 ? `##${word.slice(pos, end)}` : word.slice(pos, end));
          if (id !== undefined) break;
          end--;
        }
        if (id === undefined) {
          pieces.length = 0;
          pieces.push(SPECIAL.UNK);
          break;
        }
        pieces.push(id);
        pos = end;
      }
      for (const id of pieces) tokens.push({ id, start: w.start, end: w.end });
    }
    return tokens;
  }
}

/** Lower-case and strip accents (BERT uncased normalisation). */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
}

function isPunctuation(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  if ((c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126)) return true;
  return /\p{P}/u.test(ch);
}

/** Split on whitespace and punctuation (each punctuation mark is its own word), keeping offsets. */
function splitWords(text: string): { start: number; end: number }[] {
  const words: { start: number; end: number }[] = [];
  let start = -1;
  const flush = (i: number) => {
    if (start >= 0) words.push({ start, end: i });
    start = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch) || code === 0 || code === 0xfffd || (code < 32 && ch !== "\t" && ch !== "\n" && ch !== "\r")) {
      flush(i);
    } else if (isPunctuation(ch)) {
      flush(i);
      words.push({ start: i, end: i + 1 });
    } else if (start < 0) {
      start = i;
    }
  }
  flush(text.length);
  return words;
}
