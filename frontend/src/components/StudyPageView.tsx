import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Page } from "../schemas/package";
import { ProgressBar } from "./ProgressBar";
import "./StudyPageView.css";

interface StudyPageViewProps {
  page: Page;
  pageIndex: number; // 0-based
  pageCount: number;
  allPagesVisited: boolean;
  onNext: () => void;
  onSkipToQuestions: () => void;
}

// Allowed elements — prevents XSS from YAML content
const ALLOWED_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "a",
  "br",
] as const;

export function StudyPageView({
  page,
  pageIndex,
  pageCount,
  allPagesVisited,
  onNext,
  onSkipToQuestions,
}: StudyPageViewProps) {
  const current = pageIndex + 1;
  const isLast = current === pageCount;
  const label = `Page ${current} of ${pageCount}`;

  return (
    <section className="study-page-view" aria-label={`Study: ${page.title}`}>
      <div className="study-page-view__progress">
        <ProgressBar current={current} total={pageCount} label={label} />
      </div>

      <h2 className="study-page-view__title">{page.title}</h2>

      <article className="study-page-view__content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          allowedElements={ALLOWED_ELEMENTS as unknown as string[]}
          components={{
            // Map h1 → h3 so document outline stays valid (page h1 is LessonPage's h1)
            h1: ({ children }) => <h3>{children}</h3>,
            h2: ({ children }) => <h4>{children}</h4>,
            // Open links in new tab safely
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {page.content}
        </ReactMarkdown>
      </article>

      <div className="study-page-view__actions">
        {!isLast && (
          <button
            type="button"
            className="study-page-view__btn study-page-view__btn--primary"
            onClick={onNext}
          >
            Next Page →
          </button>
        )}
        {isLast && (
          <button
            type="button"
            className="study-page-view__btn study-page-view__btn--primary"
            onClick={onNext}
          >
            Start Questions
          </button>
        )}
        {!allPagesVisited && !isLast && (
          <button
            type="button"
            className="study-page-view__btn study-page-view__btn--ghost"
            onClick={onSkipToQuestions}
          >
            Skip to Questions
          </button>
        )}
      </div>
    </section>
  );
}
