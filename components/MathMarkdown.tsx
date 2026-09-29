'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';

/**
 * Markdown with maths ($x^2$, $$...$$) and tables, as quick exam questions are written.
 * Raw HTML in the text is not rendered (react-markdown's default), so a paste can't inject
 * markup or scripts. `inline` drops the paragraph wrapper, for answer options.
 */
export function MathMarkdown({ children, inline = false, className }: { children: string; inline?: boolean; className?: string }) {
  return (
    <div className={cn('quick-md min-w-0 break-words', inline && '[&>p]:inline [&>p]:m-0', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
          table: ({ children }) => (
            <div className="my-2 max-w-full overflow-x-auto">
              <table className="w-auto border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border bg-muted/60 px-3 py-1.5 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-3 py-1.5">{children}</td>,
          ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
          code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
          pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-sm">{children}</pre>,
          img: () => null,
          a: ({ children }) => <span className="underline">{children}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
