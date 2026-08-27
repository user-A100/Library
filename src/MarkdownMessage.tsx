import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const citationPattern = /【来源\s*(\d+)(?:\s*·\s*p\.?\s*(\d+))?(?:\s*·\s*(?:block|块)\s*:?\s*([\w-]+))?\s*】/gi;

export function linkifyCitationMarkers(content: string) {
  return content.replace(citationPattern, (label, sourceIndex: string, page = "", blockId = "") => (
    `[${label}](#research-citation=${encodeURIComponent(sourceIndex)}:${encodeURIComponent(page)}:${encodeURIComponent(blockId)})`
  ));
}

export function parseCitationHref(href?: string) {
  const prefix = "#research-citation=";
  if (!href?.startsWith(prefix)) return null;
  const [sourceIndex, page, blockId] = href.slice(prefix.length).split(":").map((value) => decodeURIComponent(value || ""));
  const parsedSourceIndex = Number(sourceIndex);
  if (!Number.isFinite(parsedSourceIndex) || parsedSourceIndex < 1) return null;
  return {
    sourceIndex: parsedSourceIndex,
    page: page ? Number(page) : undefined,
    blockId: blockId || undefined,
  };
}

type MarkdownMessageProps = {
  content: string;
  onCitationClick?: (sourceIndex: number, page?: number, blockId?: string) => void;
};

export function MarkdownMessage({ content, onCitationClick }: MarkdownMessageProps) {
  return (
    <div className="notebook-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href, ...props }) => {
            const citation = parseCitationHref(href);
            if (citation && onCitationClick) {
              return (
                <button
                  className="notebook-inline-citation"
                  type="button"
                  title={`打开来源 ${citation.sourceIndex}${citation.page ? `第 ${citation.page} 页` : ""}`}
                  aria-label={`打开来源 ${citation.sourceIndex}${citation.page ? `第 ${citation.page} 页` : ""}`}
                  onClick={() => onCitationClick(citation.sourceIndex, citation.page, citation.blockId)}
                >
                  <span>{children}</span>
                  <b aria-hidden="true">↗</b>
                </button>
              );
            }
            return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {linkifyCitationMarkers(content)}
      </Markdown>
    </div>
  );
}
