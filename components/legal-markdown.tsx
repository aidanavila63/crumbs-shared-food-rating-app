// Round 78: draws the legal texts (lib/legal-text.ts). A small, safe subset of Markdown — headings,
// paragraphs, lists, tables, quotes, **bold**, *italic*, [links](…) — turned into React elements
// (never raw HTML). No hooks, so the static legal pages can use it.
import { Fragment, type ReactNode } from 'react'

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'quote'; lines: string[] }

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const heading = /^(#{1,4}) (.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] })
      i += 1
    } else if (/^\s*[-*] /.test(line) || /^\s*\d+\. /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line)
      const items: string[] = []
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))
        i += 1
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items })
    } else if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|(\s*-+\s*\|)+\s*$/.test(lines[i].replace(/---/g, '-')))
          rows.push(
            lines[i]
              .replace(/^\||\|$/g, '')
              .split(' | ')
              .map((c) => c.trim()),
          )
        i += 1
      }
      blocks.push({ kind: 'table', rows })
    } else if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        const text = lines[i].replace(/^>\s?/, '')
        if (text.trim()) quote.push(text)
        i += 1
      }
      blocks.push({ kind: 'quote', lines: quote })
    } else {
      blocks.push({ kind: 'p', text: line })
      i += 1
    }
  }
  return blocks
}

/** **bold**, *italic*, `code` and [text](https://…) inside a line. Everything else is plain text. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g
  let last = 0
  let key = 0
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={key++}>{inline(m[1])}</strong>)
    else if (m[2] !== undefined) out.push(<em key={key++}>{inline(m[2])}</em>)
    else if (m[3] !== undefined) out.push(<code key={key++}>{m[3]}</code>)
    else
      out.push(
        <a key={key++} href={m[5]} className="underline" {...(m[5].startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {m[4]}
        </a>,
      )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  // "\[" in the draft is an escaped bracket.
  return out.map((part) => (typeof part === 'string' ? part.replace(/\\([[\]])/g, '$1') : part))
}

export function LegalMarkdown({ md, skipTitle = false }: { md: string; skipTitle?: boolean }) {
  const blocks = parseBlocks(md)
  return (
    <div className="legal-text flex flex-col gap-3">
      {blocks.map((block, n) => {
        switch (block.kind) {
          case 'h':
            if (block.level <= 2)
              return skipTitle && n === 0 ? null : (
                <h1 key={n} className="mt-2 font-serif text-3xl font-bold">
                  {inline(block.text)}
                </h1>
              )
            return (
              <h2 key={n} id={slugify(block.text)} className="mt-4 scroll-mt-6 font-serif text-xl font-bold">
                {inline(block.text)}
              </h2>
            )
          case 'p':
            return (
              <p key={n} className="leading-7">
                {inline(block.text)}
              </p>
            )
          case 'ul':
          case 'ol': {
            const List = block.kind === 'ul' ? 'ul' : 'ol'
            return (
              <List key={n} className={`${block.kind === 'ul' ? 'list-disc' : 'list-decimal'} flex flex-col gap-1 pl-6 leading-7`}>
                {block.items.map((item, i) => (
                  <li key={i}>{inline(item)}</li>
                ))}
              </List>
            )
          }
          case 'table':
            return (
              <div key={n} className="overflow-x-auto">
                <table className="legal-table w-full text-sm">
                  <thead>
                    <tr>
                      {block.rows[0]?.map((cell, i) => (
                        <th key={i}>{inline(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.slice(1).map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, i) => (
                          <td key={i}>{inline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'quote':
            return (
              <blockquote key={n} className="border-l-4 border-[var(--border)] pl-3 text-sm text-muted-foreground">
                {block.lines.map((line, i) => (
                  <Fragment key={i}>
                    {inline(line)}
                    {i < block.lines.length - 1 && <br />}
                  </Fragment>
                ))}
              </blockquote>
            )
        }
      })}
    </div>
  )
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
