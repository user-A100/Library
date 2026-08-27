import { useRef, type ChangeEvent } from "react";
import {
  Bold,
  BookOpen,
  Braces,
  Clipboard,
  Code2,
  Download,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Table2,
  Underline,
  Undo2,
  Upload,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import type { NoteDocumentNode, ResearchNote } from "./data";

type NotePatch = Pick<ResearchNote, "title" | "body" | "document">;

type ResearchNoteEditorProps = {
  note: ResearchNote;
  onChange: (patch: Partial<NotePatch>) => void;
  onSourceOpen: () => void;
  onFeedback: (message: string) => void;
};

function looksLikeMarkdown(value: string) {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|==[^=]+==|\+\+[^+]+\+\+|(^|\n)\|.+\|/m.test(value);
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "阅读笔记";
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      data-active={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ResearchNoteEditor({ note, onChange, onSourceOpen, onFeedback }: ResearchNoteEditorProps) {
  const markdownInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Highlight,
      TableKit.configure({ table: { resizable: true } }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
    ],
    content: note.document?.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    injectCSS: false,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "research-note-prosemirror",
        "aria-label": "笔记正文",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange({
        body: activeEditor.getText({ blockSeparator: "\n\n" }),
        document: {
          schemaVersion: 1,
          content: activeEditor.getJSON() as NoteDocumentNode,
          markdown: activeEditor.getMarkdown(),
        },
      });
    },
  }, [note.id]);

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;
    try {
      const markdown = await file.text();
      editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: true });
      onFeedback(`已导入 ${file.name}`);
    } catch {
      onFeedback("Markdown 导入失败");
    }
  };

  const exportMarkdown = () => {
    if (!editor) return;
    const markdown = editor.getMarkdown();
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(note.title)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    onFeedback("Markdown 已导出");
  };

  const copyMarkdown = async () => {
    if (!editor) return;
    try {
      await navigator.clipboard.writeText(editor.getMarkdown());
      onFeedback("Markdown 已复制");
    } catch {
      onFeedback("当前环境不支持复制");
    }
  };

  const setLink = () => {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("链接地址", current ?? "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const pasteAsMarkdown = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!editor) return;
    const clipboard = event.clipboardData;
    const plainText = clipboard.getData("text/plain");
    if (clipboard.getData("text/html") || !looksLikeMarkdown(plainText)) return;
    event.preventDefault();
    editor.commands.insertContent(plainText, { contentType: "markdown" });
  };

  return (
    <article className="note-editor-shell">
      <header className="note-editor-header">
        <input
          className="note-title-input"
          value={note.title}
          aria-label="笔记标题"
          placeholder="无标题笔记"
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <div className="note-document-actions">
          <ToolbarButton label="导入 Markdown" onClick={() => markdownInput.current?.click()}><Upload size={16} /></ToolbarButton>
          <ToolbarButton label="复制 Markdown" onClick={copyMarkdown}><Clipboard size={16} /></ToolbarButton>
          <ToolbarButton label="导出 Markdown" onClick={exportMarkdown}><Download size={16} /></ToolbarButton>
          <input ref={markdownInput} className="sr-only" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={importMarkdown} />
        </div>
      </header>

      <button className="note-source-tether" type="button" onClick={onSourceOpen}>
        <span><BookOpen size={16} /></span>
        <span><small>来源</small><strong>{note.source || "未关联文献"}</strong></span>
        <b>p. {note.page}</b>
      </button>

      <div className="note-editor-toolbar" role="toolbar" aria-label="笔记格式">
        <div>
          <ToolbarButton label="撤销" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></ToolbarButton>
          <ToolbarButton label="重做" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></ToolbarButton>
        </div>
        <div>
          <ToolbarButton label="粗体" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
          <ToolbarButton label="斜体" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
          <ToolbarButton label="下划线" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolbarButton>
          <ToolbarButton label="高亮" active={editor?.isActive("highlight")} onClick={() => editor?.chain().focus().toggleHighlight().run()}><Highlighter size={16} /></ToolbarButton>
          <ToolbarButton label="行内代码" active={editor?.isActive("code")} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={16} /></ToolbarButton>
          <ToolbarButton label="链接" active={editor?.isActive("link")} onClick={setLink}><Link2 size={16} /></ToolbarButton>
        </div>
        <div>
          <ToolbarButton label="一级标题" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></ToolbarButton>
          <ToolbarButton label="二级标题" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
          <ToolbarButton label="无序列表" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
          <ToolbarButton label="有序列表" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
          <ToolbarButton label="引用" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
          <ToolbarButton label="代码块" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Braces size={16} /></ToolbarButton>
          <ToolbarButton label="插入表格" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} /></ToolbarButton>
        </div>
      </div>

      <div className="note-editor-canvas" onPaste={pasteAsMarkdown}>
        <EditorContent editor={editor} />
      </div>

      <footer className="note-editor-status">
        <span><i />已自动保存</span>
        <span>结构化笔记 · Markdown 可导入导出</span>
      </footer>
    </article>
  );
}
