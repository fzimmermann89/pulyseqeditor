import { useRef, useEffect } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { tags } from "@lezer/highlight";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

const labHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#e8a045", fontWeight: "500" },
  { tag: tags.controlKeyword, color: "#e8a045" },
  { tag: tags.definition(tags.variableName), color: "#7cc4ef" },
  { tag: tags.function(tags.variableName), color: "#7cc4ef" },
  { tag: tags.definition(tags.function(tags.variableName)), color: "#7cc4ef" },
  { tag: tags.variableName, color: "#e2dfd8" },
  { tag: tags.string, color: "#7ec89e" },
  { tag: tags.number, color: "#d4a0e8" },
  { tag: tags.bool, color: "#d4a0e8" },
  { tag: tags.null, color: "#d4a0e8" },
  { tag: tags.comment, color: "#5c586a", fontStyle: "italic" },
  { tag: tags.operator, color: "#c9c3ba" },
  { tag: tags.punctuation, color: "#8a8697" },
  { tag: tags.className, color: "#e8c86a" },
  { tag: tags.propertyName, color: "#7cc4ef" },
  { tag: tags.self, color: "#e8a045" },
  { tag: tags.special(tags.variableName), color: "#e8a045" },
]);

const labTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0f1117",
    color: "#e2dfd8",
  },
  ".cm-content": {
    caretColor: "#e8a045",
    padding: "0.5rem 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#e8a045",
    borderLeftWidth: "2px",
  },
});

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onRun?: () => void;
};

export function CodeEditor({ value, onChange, disabled = false, onRun }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    if (!containerRef.current) return;

    const runKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          onRunRef.current?.();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        runKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        history(),
        highlightSelectionMatches(),
        python(),
        labTheme,
        syntaxHighlighting(labHighlight),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        updateListener,
        readOnlyComp.current.of(EditorState.readOnly.of(disabled)),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(disabled)),
    });
  }, [disabled]);

  return <div ref={containerRef} className="editor-panel" />;
}
