"use client";

import React from "react";

// ─── Lightweight JSX / JS syntax highlighter ─────────────────────────
const SYNTAX_COLORS = {
  keyword:  "#8b5cf6", // purple
  string:   "#059669", // green
  comment:  "#9ca3af", // gray
  tag:      "#2563eb", // blue
  attr:     "#d97706", // amber
  number:   "#e11d48", // rose
  func:     "#0891b2", // cyan
  punct:    "#6b7280", // slate
  default:  "#374151", // dark gray
};

type TokenType = keyof typeof SYNTAX_COLORS;

interface Token {
  type: TokenType;
  value: string;
}

const JS_KEYWORDS = new Set([
  "import","export","from","default","const","let","var","function","return",
  "if","else","switch","case","break","for","while","do","new","typeof",
  "instanceof","class","extends","async","await","try","catch","finally",
  "throw","this","null","undefined","true","false","of","in","yield",
]);

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|(<\/?[A-Z][\w.]*|<\/?[a-z][\w-]*)|(\b[A-Z][\w]*(?=\s*[({<]))|(\b[a-z_$][\w$]*(?=\s*\())|(\b[a-z_$][\w$]*\b)|([{}()[\];,=<>+\-*/.!&|?:]+)|(\s+)|([\s\S])/g;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [
      ,
      comment,
      str,
      num,
      tag,
      component,
      funcCall,
      word,
      punct,
      ws,
      other,
    ] = match;

    if (comment)        tokens.push({ type: "comment", value: comment });
    else if (str)       tokens.push({ type: "string", value: str });
    else if (num)       tokens.push({ type: "number", value: num });
    else if (tag)       tokens.push({ type: "tag", value: tag });
    else if (component) tokens.push({ type: "tag", value: component });
    else if (funcCall)  tokens.push({ type: "func", value: funcCall });
    else if (word) {
      if (JS_KEYWORDS.has(word)) tokens.push({ type: "keyword", value: word });
      else tokens.push({ type: "default", value: word });
    }
    else if (punct)     tokens.push({ type: "punct", value: punct });
    else if (ws)        tokens.push({ type: "default", value: ws });
    else if (other)     tokens.push({ type: "default", value: other });
  }
  return tokens;
}

/**
 * Tokenise a JSX/JS string into styled spans.
 * It's intentionally simple (regex-based, not a real parser).
 */
export default function SyntaxHighlight({ code }: { code: string }) {
  const tokens = tokenize(code);
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: SYNTAX_COLORS[t.type] ?? SYNTAX_COLORS.default }}>
          {t.value}
        </span>
      ))}
    </>
  );
}
