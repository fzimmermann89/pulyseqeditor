import { useRef, useEffect, useState, useCallback } from "react";
import type { ConsoleEntry } from "../types";

type ConsolePanelProps = {
  entries: ConsoleEntry[];
  onClear: () => void;
};

export function ConsolePanel({ entries, onClear }: ConsolePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (entries.length > prevCountRef.current) {
      if (!expanded) setExpanded(true);
      scrollToBottom();
    }
    prevCountRef.current = entries.length;
  }, [entries.length, expanded, scrollToBottom]);

  return (
    <section className={`console-drawer ${expanded ? "expanded" : "collapsed"}`}>
      <div
        className="console-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="console-header-title">Console</span>
        {entries.length > 0 && (
          <span className="console-entry-count">{entries.length}</span>
        )}
        <span className="console-header-actions">
          {entries.length > 0 && (
            <button
              type="button"
              className="btn btn-console-clear"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              Clear
            </button>
          )}
        </span>
        <span className="console-toggle">&#9650;</span>
      </div>
      {expanded && (
        <div className="console-body" ref={bodyRef} role="log" aria-live="polite">
          {entries.length === 0 ? (
            <div className="console-empty">No output yet.</div>
          ) : (
            entries.map((entry) => (
              <pre key={entry.id} className={`console-line ${entry.stream}`}>
                {entry.text}
              </pre>
            ))
          )}
        </div>
      )}
    </section>
  );
}
