"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Palette,
  Highlighter,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  Link as LinkIcon,
  Unlink,
  MousePointerClick,
  Square,
  LayoutGrid,
  Table as TableIcon,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo2,
  Redo2,
  Type,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Plus,
  Minus,
} from "lucide-react";
import { LoremIpsum } from "lorem-ipsum";
import { uploadAdminMedia } from "@/lib/api/media";
import { getTiptapExtensions } from "@/lib/rich-text/tiptap-extensions";
import { toast } from "@/lib/toast";
import {
  normalizeToTiptapDoc,
  sanitizeHref,
  sanitizeImageSrc,
  TEXT_COLOR_PALETTE,
  HIGHLIGHT_COLOR_PALETTE,
  sanitizeColor,
  sanitizeHighlightColor,
} from "@/lib/rich-text/rich-text-utils";
import { applyEditorBlockStyle } from "@/lib/rich-text/block-style";
import { applyTopLevelBlockCommand } from "@/lib/rich-text/structured-editor-blocks";

const IMAGE_WIDTHS = [
  { value: "25%", label: "25%" },
  { value: "50%", label: "50%" },
  { value: "75%", label: "75%" },
  { value: "100%", label: "100%" },
] as const;

const HEADING_LEVELS = [
  { level: null, label: "Paragraph", tag: "P" },
  { level: 2, label: "Heading 2", tag: "H2" },
  { level: 3, label: "Heading 3", tag: "H3" },
  { level: 4, label: "Heading 4", tag: "H4" },
  { level: 5, label: "Heading 5", tag: "H5" },
  { level: 6, label: "Heading 6", tag: "H6" },
] as const;

/** PRODUCT governance: H2–H4 only in the toolbar (existing H5/H6 content still loads). */
const PRODUCT_HEADING_LEVELS = HEADING_LEVELS.filter(
  (h) => h.level == null || (h.level >= 2 && h.level <= 4),
);

const PLACEHOLDER_IMAGE =
  typeof window !== "undefined" && process.env.NEXT_PUBLIC_PLACEHOLDER_IMAGE
    ? process.env.NEXT_PUBLIC_PLACEHOLDER_IMAGE
    : "https://placehold.co/400x300?text=Image";

export type ProductStructuredEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  context?: string;
  minHeight?: number;
  debounceMs?: number;
};

export function ProductStructuredEditor({
  value,
  onChange,
  placeholder = "Start writing...",
  context = "PRODUCT",
  minHeight,
  debounceMs = 250,
}: ProductStructuredEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLoremModal, setShowLoremModal] = useState(false);
  const [showCtaModal, setShowCtaModal] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableHover, setTableHover] = useState({ rows: 2, cols: 2 });
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageForm, setImageForm] = useState({ url: "", alt: "" });
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [ctaForm, setCtaForm] = useState({ text: "Click here", url: "/", variant: "primary" });
  const syncRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadHandlerRef = useRef<((file: File) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  const editorInstanceRef = useRef<ReturnType<typeof useEditor>>(null);

  const initialDoc = useMemo(() => normalizeToTiptapDoc(value) as JSONContent, []);

  const editor = useEditor({
    extensions: getTiptapExtensions({ placeholder }),
    content: initialDoc,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose editor-content text-slate-800 max-w-none focus:outline-none px-4 py-3",
        style: `min-height: ${Number.isFinite(Number(minHeight)) ? Number(minHeight) : 260}px`,
      },
      handlePaste: (view, event) => {
        try {
          const text = event?.clipboardData?.getData("text/plain") || "";
          if (!text || !text.includes("\t")) return false;

          const { state } = view;
          const { selection, schema } = state;

          const $from = selection?.$from;
          if ($from) {
            for (let d = $from.depth; d > 0; d--) {
              const role = $from.node(d)?.type?.spec?.tableRole;
              if (role === "cell" || role === "header_cell" || role === "row" || role === "table") {
                return false;
              }
            }
          }

          const tableType = schema.nodes.table;
          const rowType = schema.nodes.tableRow;
          const cellType = schema.nodes.tableCell;
          const paragraphType = schema.nodes.paragraph;
          const textType = schema.text;
          if (!tableType || !rowType || !cellType || !paragraphType || !textType) return false;

          const rows = text
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .filter((r) => r.length > 0);
          if (!rows.length) return false;

          const cells = rows.map((r) => r.split("\t"));
          const cols = Math.max(1, ...cells.map((r) => r.length));

          const pmRows = cells.map((r) => {
            const pmCells = Array.from({ length: cols }).map((_, i) => {
              const raw = (r[i] ?? "").trim();
              const content = raw
                ? paragraphType.create(null, textType(raw))
                : paragraphType.create();
              return cellType.createAndFill(null, content) || cellType.create(null, content);
            });
            return rowType.createAndFill(null, pmCells) || rowType.create(null, pmCells);
          });

          const table = tableType.createAndFill(null, pmRows) || tableType.create(null, pmRows);
          if (!table) return false;

          event.preventDefault();
          view.dispatch(state.tr.replaceSelectionWith(table).scrollIntoView());
          return true;
        } catch {
          return false;
        }
      },
      handleDrop: (_view, event) => {
        const file = event?.dataTransfer?.files?.[0];
        if (!file || !file.type?.startsWith("image/")) return false;
        event.preventDefault();
        uploadHandlerRef.current?.(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!onChange) return;
      if (syncRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const emit = () => {
        const json = JSON.stringify(ed.getJSON());
        lastEmittedRef.current = json;
        onChange(json);
      };
      const delay = debounceMs > 0 ? debounceMs : 0;
      if (delay === 0) {
        emit();
      } else {
        debounceRef.current = setTimeout(emit, delay);
      }
    },
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    // Skip while editing: debounce can leave `value` stale and setContent would
    // revert in-progress heading / block changes (ANBAZAR heading regression).
    if (editor.isFocused) return;
    if (value === lastEmittedRef.current) return;
    const normalized = normalizeToTiptapDoc(value);
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(normalized)) {
      syncRef.current = true;
      editor.commands.setContent(normalized as JSONContent, false);
      syncRef.current = false;
    }
  }, [editor, value]);

  // Flush pending TipTap JSON before unmount so Care / Manufacturer are not dropped.
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const ed = editorInstanceRef.current;
      const emit = onChangeRef.current;
      if (!ed || !emit) return;
      const json = JSON.stringify(ed.getJSON());
      if (json === lastEmittedRef.current) return;
      lastEmittedRef.current = json;
      emit(json);
    },
    [],
  );

  const insertLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link")?.href || "";
    const hrefInput = window.prompt("Enter link URL (/internal or https://...)", previous);
    if (hrefInput === null) return;
    const href = sanitizeHref(hrefInput);
    if (!href) {
      toast.warning("Invalid URL. Allowed: internal /path, http(s), mailto, tel");
      return;
    }
    const styleInput = window.prompt(
      'Link style: type "hidden" for plain text look, or leave empty for default',
      "",
    );
    if (styleInput === null) return;
    const chosenVariant = styleInput.trim().toLowerCase() === "hidden" ? "hidden" : "default";
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href, variant: chosenVariant || "default" } as { href: string; variant?: string })
      .run();
  };

  const insertCta = () => {
    if (!editor) return;
    const text = window.prompt("CTA text", "Shop Now");
    if (!text) return;
    const hrefRaw = window.prompt("CTA link", "/products");
    const href = sanitizeHref(hrefRaw || "");
    if (!href) {
      toast.warning("Invalid CTA link");
      return;
    }
    const linkType = href.startsWith("/") ? "internal" : "external";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "cta",
        attrs: { text, href, linkType, variant: "primary" },
      })
      .run();
  };

  const handleImageUpload = async (file: File, altText = "") => {
    if (!file || !editor) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Image must be under 10MB");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const asset = await uploadAdminMedia({
        file,
        displayName: file.name,
        altText: altText || "",
      });
      if (!asset?.url) {
        throw new Error("Upload failed");
      }

      editor
        .chain()
        .focus()
        .setImage({
          src: asset.url,
          alt: String(altText || "").trim() || asset.altText || "",
          title: "",
          align: "center",
          size: 100,
          width: "100%",
        } as { src: string; alt?: string; title?: string })
        .run();
      setShowImageModal(false);
      setPendingImageFile(null);
      setImageForm({ url: "", alt: "" });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  uploadHandlerRef.current = (file: File) => {
    setPendingImageFile(file);
    setImageForm({ url: "", alt: "" });
    setShowImageModal(true);
  };

  const onSelectImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImageFile(file);
      setImageForm({ url: "", alt: "" });
      setShowImageModal(true);
    }
    e.target.value = "";
  };

  const openImageModal = () => {
    const attrs = editor?.isActive("image") ? editor.getAttributes("image") : {};
    setPendingImageFile(null);
    setImageForm({
      url: (attrs?.src as string) || "",
      alt: (attrs?.alt as string) || "",
    });
    setShowImageModal(true);
    setShowTablePicker(false);
    setShowColorPicker(false);
    setShowHighlightPicker(false);
  };

  const applyImageFromModal = async () => {
    const alt = String(imageForm.alt || "").trim();
    if (pendingImageFile) {
      await handleImageUpload(pendingImageFile, alt);
      return;
    }
    if (!editor) return;
    const src = sanitizeImageSrc(imageForm.url);
    if (!src) {
      setUploadError("Invalid image URL. Use /path or http(s).");
      return;
    }
    setUploadError("");
    if (editor.isActive("image")) {
      editor.chain().focus().updateAttributes("image", { src, alt }).run();
    } else {
      editor
        .chain()
        .focus()
        .setImage({
          src,
          alt,
          title: "",
          align: "center",
          size: 100,
          width: "100%",
        } as { src: string; alt?: string; title?: string })
        .run();
    }
    setShowImageModal(false);
    setImageForm({ url: "", alt: "" });
  };

  const setImageAlign = (align: string) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes("image", { align }).run();
  };

  const insertTableAtSize = (rows: number, cols: number, withHeaderRow = true) => {
    if (!editor) return;
    const safeRows = Math.max(1, Math.min(8, Number(rows) || 2));
    const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
    editor.chain().focus().insertTable({ rows: safeRows, cols: safeCols, withHeaderRow }).run();
    setShowTablePicker(false);
  };

  const getSelectionTable = () => {
    if (!editor) return null;
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d);
      if (node.type.name === "table") return node;
    }
    return null;
  };

  const runTableCommand = (command: string) => {
    if (!editor || !editor.isEditable) return false;
    if (!editor.isActive("table")) return false;

    if (typeof editor.view?.hasFocus === "function" && !editor.view.hasFocus()) {
      try {
        editor.view.focus();
      } catch {
        /* jsdom may lack full focus support */
      }
    }

    switch (command) {
      case "addRowBefore":
        return editor.commands.addRowBefore();
      case "addRowAfter":
        return editor.commands.addRowAfter();
      case "deleteRow": {
        if (editor.commands.deleteRow()) return true;
        const table = getSelectionTable();
        if (table && table.childCount === 1) return editor.commands.deleteTable();
        return false;
      }
      case "addColumnBefore":
        return editor.commands.addColumnBefore();
      case "addColumnAfter":
        return editor.commands.addColumnAfter();
      case "deleteColumn": {
        if (editor.commands.deleteColumn()) return true;
        const table = getSelectionTable();
        const colCount = table?.firstChild?.childCount ?? 0;
        if (table && colCount === 1) return editor.commands.deleteTable();
        return false;
      }
      case "toggleHeaderRow":
        return editor.commands.toggleHeaderRow();
      case "mergeCells":
        return editor.commands.mergeCells();
      case "splitCell":
        return editor.commands.splitCell();
      case "deleteTable":
        return editor.commands.deleteTable();
      default:
        return false;
    }
  };

  const setBlockAlign = (align: string) => {
    if (!editor) return;
    editor.chain().focus().setTextAlign(align).run();
  };

  const runBlockCommand = (command: string) => {
    applyTopLevelBlockCommand(editor, command);
    setShowColorPicker(false);
    setShowHighlightPicker(false);
    setShowTablePicker(false);
  };

  const setImageWidth = (width: string) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes("image", { width }).run();
    setShowColorPicker(false);
    setShowHighlightPicker(false);
  };

  const insertLorem = (mode: "words" | "sentences" | "paragraphs", count: number) => {
    if (!editor) return;
    const gen = new LoremIpsum();
    let text = "";
    if (mode === "words") text = gen.generateWords(count);
    else if (mode === "sentences") text = gen.generateSentences(count);
    else text = gen.generateParagraphs(count);
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    const content: JSONContent[] = paragraphs.length
      ? paragraphs.map((p) => ({
          type: "paragraph",
          content: [{ type: "text", text: p }],
        }))
      : [{ type: "paragraph", content: [{ type: "text", text }] }];
    editor.chain().focus().insertContent(content).run();
    setShowLoremModal(false);
  };

  const insertTwoImages = () => {
    if (!editor) return;
    const src = PLACEHOLDER_IMAGE || "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "mediaGroup",
        content: [
          { type: "image", attrs: { src, alt: "Image", width: "50%", align: "center", size: 50 } },
          { type: "image", attrs: { src, alt: "Image", width: "50%", align: "center", size: 50 } },
        ],
      })
      .run();
  };

  const insertMediaText = () => {
    if (!editor) return;
    const src = PLACEHOLDER_IMAGE || "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "mediaText",
        attrs: { layout: "imageLeft" },
        content: [
          { type: "image", attrs: { src, alt: "Image", width: "50%", align: "center", size: 50 } },
          { type: "paragraph", content: [{ type: "text", text: "Add your text here." }] },
        ],
      })
      .run();
  };

  const toggleMediaTextLayout = () => {
    if (!editor || !editor.isActive("mediaText")) return;
    const currentLayout = editor.getAttributes("mediaText").layout || "imageLeft";
    const layout = currentLayout === "imageLeft" ? "imageRight" : "imageLeft";
    editor.chain().focus().updateAttributes("mediaText", { layout }).run();
  };

  const getMediaTextImagePos = () => {
    if (!editor) return null;
    const { state } = editor;
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "mediaText") {
        const mediaTextPos = $from.before(d);
        const imagePos = mediaTextPos + 1;
        const imageNode = state.doc.nodeAt(imagePos);
        if (imageNode && imageNode.type.name === "image") return imagePos;
        return null;
      }
    }
    return null;
  };

  const getMediaTextImageWidth = () => {
    const pos = getMediaTextImagePos();
    if (pos == null || !editor) return "100%";
    const node = editor.state.doc.nodeAt(pos);
    const w = node?.attrs?.width;
    return ["25%", "50%", "75%", "100%"].includes(w) ? w : "50%";
  };

  const setMediaTextImageWidth = (width: string) => {
    const pos = getMediaTextImagePos();
    if (pos == null || !editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "image") return;
    const size = width === "25%" ? 25 : width === "50%" ? 50 : width === "75%" ? 75 : 100;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, { ...node.attrs, width, size }));
    setShowColorPicker(false);
    setShowHighlightPicker(false);
  };

  const openCtaModal = () => {
    setCtaForm({ text: "Click here", url: "/", variant: "primary" });
    setShowCtaModal(true);
  };

  const insertCtaButton = () => {
    if (!editor) return;
    const url = sanitizeHref(ctaForm.url);
    if (!url) {
      toast.warning("Invalid URL. Allowed: /path, http(s), mailto, tel");
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: "ctaButton",
        attrs: { text: ctaForm.text || "Click here", url, variant: ctaForm.variant || "primary" },
      })
      .run();
    setShowCtaModal(false);
  };

  if (!editor) {
    return <div className="p-4 text-sm text-muted-foreground">Loading editor…</div>;
  }

  const preserveSelection = (e: React.MouseEvent) => e.preventDefault();

  const btn = (active: boolean, { danger = false, disabled = false }: { danger?: boolean; disabled?: boolean } = {}) => {
    if (disabled) {
      return "h-8 w-8 min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground/40 cursor-not-allowed";
    }
    if (danger) {
      return `h-8 min-h-[32px] px-2 inline-flex items-center justify-center gap-1 rounded-md border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:ring-offset-1 ${active ? "bg-danger text-white border-danger" : "bg-surface text-danger border-red-200 hover:bg-red-50 hover:border-red-300"}`;
    }
    return `h-8 min-h-[32px] min-w-[32px] px-1.5 inline-flex items-center justify-center gap-1 rounded-md border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 ${active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-surface text-muted-foreground border-border hover:bg-muted hover:border-input hover:text-foreground"}`;
  };

  const iconCls = "w-4 h-4 shrink-0";
  const sep = <div className="hidden sm:block w-px h-6 bg-border mx-0.5 shrink-0" aria-hidden="true" />;
  const groupCls = "flex items-center gap-0.5 flex-wrap";

  const currentHeadingLevel = editor.isActive("heading")
    ? editor.getAttributes("heading").level
    : null;

  const inTable = editor.isActive("table");
  const inImage = editor.isActive("image");
  const currentImageAlign = inImage ? editor.getAttributes("image").align || "center" : null;
  const selectionTable = inTable ? getSelectionTable() : null;
  const canDeleteRow = Boolean(selectionTable && selectionTable.childCount > 0);
  const canDeleteCol = Boolean(selectionTable?.firstChild?.childCount && selectionTable.firstChild.childCount > 0);
  const wordCount =
    (editor.storage as { characterCount?: { words?: () => number } }).characterCount?.words?.() ?? 0;

  const headingLevels =
    context === "PRODUCT" ? PRODUCT_HEADING_LEVELS : HEADING_LEVELS;

  return (
    <div
      className="structured-editor-root w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-card)]"
      data-testid="product-structured-editor"
    >
      <div className="structured-editor-chrome sticky top-0 z-30 rounded-t-[var(--radius-md)] border-b border-border bg-surface-raised/95 backdrop-blur-sm">
        <div
          className="structured-editor-toolbar flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2.5 py-2"
          data-testid="structured-editor-toolbar"
        >
          <div className={groupCls} role="group" aria-label="Text formatting">
            <button type="button" aria-label="Bold" className={btn(editor.isActive("bold"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
              <Bold className={iconCls} />
            </button>
            <button type="button" aria-label="Italic" className={btn(editor.isActive("italic"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
              <Italic className={iconCls} />
            </button>
            <button type="button" aria-label="Underline" className={btn(editor.isActive("underline"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
              <UnderlineIcon className={iconCls} />
            </button>
            <button type="button" aria-label="Strikethrough" className={btn(editor.isActive("strike"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
              <Strikethrough className={iconCls} />
            </button>
            <div className="relative">
              <button type="button" aria-label="Text color" className={btn(editor.isActive("textStyle"))} onMouseDown={preserveSelection} onClick={() => { setShowHighlightPicker(false); setShowColorPicker((v) => !v); }} title="Text color">
                <Palette className={iconCls} />
              </button>
              {showColorPicker && (
                <div className="absolute top-full left-0 z-40 mt-1 min-w-[132px] max-w-[min(90vw,220px)] rounded-lg border border-border bg-surface p-3 shadow-lg" onMouseDown={preserveSelection}>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Text color</p>
                  <div className="mb-2 grid w-fit grid-cols-3 gap-2" style={{ gridAutoRows: "32px" }}>
                    {TEXT_COLOR_PALETTE.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Color ${hex}`}
                        className="box-border h-8 w-8 min-h-[32px] min-w-[32px] flex-shrink-0 rounded-md border border-border transition-shadow hover:ring-2 hover:ring-ring/40"
                        style={{ backgroundColor: hex }}
                        onMouseDown={preserveSelection}
                        onClick={() => {
                          const safe = sanitizeColor(hex);
                          if (safe) editor.chain().focus().setColor(safe).run();
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="w-full py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                    onMouseDown={preserveSelection}
                    onClick={() => {
                      editor.chain().focus().unsetColor().run();
                      setShowColorPicker(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" aria-label="Highlight" className={btn(editor.isActive("highlight"))} onMouseDown={preserveSelection} onClick={() => { setShowColorPicker(false); setShowHighlightPicker((v) => !v); }} title="Background color">
                <Highlighter className={iconCls} />
              </button>
              {showHighlightPicker && (
                <div className="absolute top-full left-0 z-40 mt-1 min-w-[132px] max-w-[min(90vw,220px)] rounded-lg border border-border bg-surface p-3 shadow-lg" onMouseDown={preserveSelection}>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Background color</p>
                  <div className="mb-2 grid w-fit grid-cols-3 gap-2" style={{ gridAutoRows: "32px" }}>
                    {HIGHLIGHT_COLOR_PALETTE.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Highlight ${hex}`}
                        className="box-border h-8 w-8 min-h-[32px] min-w-[32px] flex-shrink-0 rounded-md border border-border transition-shadow hover:ring-2 hover:ring-ring/40"
                        style={{ backgroundColor: hex }}
                        onMouseDown={preserveSelection}
                        onClick={() => {
                          const safe = sanitizeHighlightColor(hex);
                          if (safe) editor.chain().focus().setHighlight({ color: safe }).run();
                          setShowHighlightPicker(false);
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="w-full py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                    onMouseDown={preserveSelection}
                    onClick={() => {
                      editor.chain().focus().unsetHighlight().run();
                      setShowHighlightPicker(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {sep}

          <div className={groupCls} role="group" aria-label="Block structure">
            <select
              aria-label="Block style"
              className="h-8 min-h-[32px] rounded-md border border-border bg-surface pl-2 pr-7 text-sm text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1"
              value={currentHeadingLevel != null ? String(currentHeadingLevel) : "p"}
              // Do NOT preventDefault on mousedown — that blocks native <select> opening.
              // Selection is restored via .focus() in applyEditorBlockStyle after the user picks a style.
              onChange={(e) => {
                applyEditorBlockStyle(editor, e.target.value);
              }}
              title="Block style"
            >
              <option value="p">Paragraph</option>
              {headingLevels.filter((h) => h.level != null).map((h) => (
                <option key={h.level} value={h.level!}>
                  {h.label}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Bullet list" className={btn(editor.isActive("bulletList"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
              <List className={iconCls} />
            </button>
            <button type="button" aria-label="Numbered list" className={btn(editor.isActive("orderedList"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
              <ListOrdered className={iconCls} />
            </button>
            <button type="button" aria-label="Quote" className={btn(editor.isActive("blockquote"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
              <Quote className={iconCls} />
            </button>
            <button type="button" aria-label="Code block" className={btn(editor.isActive("codeBlock"))} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
              <Code className={iconCls} />
            </button>
            <button type="button" aria-label="Align left" className={btn(editor.isActive({ textAlign: "left" }))} onMouseDown={preserveSelection} onClick={() => setBlockAlign("left")} title="Align left">
              <AlignLeft className={iconCls} />
            </button>
            <button type="button" aria-label="Align center" className={btn(editor.isActive({ textAlign: "center" }))} onMouseDown={preserveSelection} onClick={() => setBlockAlign("center")} title="Align center">
              <AlignCenter className={iconCls} />
            </button>
            <button type="button" aria-label="Align right" className={btn(editor.isActive({ textAlign: "right" }))} onMouseDown={preserveSelection} onClick={() => setBlockAlign("right")} title="Align right">
              <AlignRight className={iconCls} />
            </button>
            <button type="button" aria-label="Justify" className={btn(editor.isActive({ textAlign: "justify" }))} onMouseDown={preserveSelection} onClick={() => setBlockAlign("justify")} title="Justify">
              <AlignJustify className={iconCls} />
            </button>
          </div>

          {sep}

          <div className={groupCls} role="group" aria-label="Media">
            <button type="button" aria-label="Insert image" className={btn(false)} onMouseDown={preserveSelection} onClick={openImageModal} disabled={uploading} title={uploading ? "Uploading…" : "Insert image"}>
              <ImageIcon className={iconCls} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onSelectImage} aria-hidden="true" />
            {(inImage || editor.isActive("mediaText")) && (
              <>
                {IMAGE_WIDTHS.map(({ value: widthValue, label }) => {
                  const currentWidth = inImage ? editor.getAttributes("image").width : getMediaTextImageWidth();
                  const isActive = currentWidth === widthValue;
                  return (
                    <button
                      key={widthValue}
                      type="button"
                      aria-label={`Image width ${label}`}
                      className={`${btn(isActive)} min-w-[40px]`}
                      onMouseDown={preserveSelection}
                      onClick={() => (inImage ? setImageWidth(widthValue) : setMediaTextImageWidth(widthValue))}
                      title={label}
                    >
                      <span className="text-xs font-medium tabular-nums">{label}</span>
                    </button>
                  );
                })}
                {inImage && (
                  <>
                    <button type="button" aria-label="Image align left" className={btn(currentImageAlign === "left")} onMouseDown={preserveSelection} onClick={() => setImageAlign("left")} title="Image align left">
                      <AlignLeft className={iconCls} />
                    </button>
                    <button type="button" aria-label="Image align center" className={btn(currentImageAlign === "center")} onMouseDown={preserveSelection} onClick={() => setImageAlign("center")} title="Image align center">
                      <AlignCenter className={iconCls} />
                    </button>
                    <button type="button" aria-label="Image align right" className={btn(currentImageAlign === "right")} onMouseDown={preserveSelection} onClick={() => setImageAlign("right")} title="Image align right">
                      <AlignRight className={iconCls} />
                    </button>
                  </>
                )}
              </>
            )}
            <button type="button" aria-label="Two images side by side" className={btn(false)} onMouseDown={preserveSelection} onClick={insertTwoImages} title="Two images side by side">
              <AlignHorizontalSpaceAround className={iconCls} />
            </button>
            <button type="button" aria-label="Image and text" className={btn(false)} onMouseDown={preserveSelection} onClick={insertMediaText} title="Image + text block">
              <LayoutGrid className={iconCls} />
            </button>
            <button type="button" aria-label="Toggle image position" className={btn(editor.isActive("mediaText"), { disabled: !editor.isActive("mediaText") })} onMouseDown={preserveSelection} onClick={toggleMediaTextLayout} title="Toggle image left/right" disabled={!editor.isActive("mediaText")}>
              <Square className={iconCls} />
            </button>
          </div>

          {sep}

          <div className={groupCls} role="group" aria-label="Insert">
            <button type="button" aria-label="Insert link" className={btn(editor.isActive("link"))} onMouseDown={preserveSelection} onClick={insertLink} title="Insert link">
              <LinkIcon className={iconCls} />
            </button>
            <button type="button" aria-label="Remove link" className={btn(false)} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
              <Unlink className={iconCls} />
            </button>
            <button type="button" aria-label="Insert CTA" className={btn(false)} onMouseDown={preserveSelection} onClick={insertCta} title="Insert CTA">
              <MousePointerClick className={iconCls} />
            </button>
            <button type="button" aria-label="Insert CTA button" className={btn(false)} onMouseDown={preserveSelection} onClick={openCtaModal} title="Insert CTA button">
              <Type className={iconCls} />
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="Insert table"
                className={btn(inTable)}
                onMouseDown={preserveSelection}
                onClick={() => {
                  setShowImageModal(false);
                  setShowColorPicker(false);
                  setShowHighlightPicker(false);
                  setShowTablePicker((v) => !v);
                }}
                title="Insert table"
              >
                <TableIcon className={iconCls} />
              </button>
              {showTablePicker && (
                <div className="absolute top-full left-0 z-40 mt-1 rounded-lg border border-border bg-surface p-3 shadow-lg" onMouseDown={preserveSelection} data-testid="table-size-picker">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {tableHover.rows} × {tableHover.cols} table
                  </p>
                  <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1.15rem)" }}>
                    {Array.from({ length: 8 * 8 }).map((_, i) => {
                      const r = Math.floor(i / 8) + 1;
                      const c = (i % 8) + 1;
                      const active = r <= tableHover.rows && c <= tableHover.cols;
                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          aria-label={`Insert ${r} by ${c} table`}
                          className={`h-[1.15rem] w-[1.15rem] rounded-[2px] border ${active ? "border-primary bg-primary" : "border-border bg-muted"}`}
                          onMouseEnter={() => setTableHover({ rows: r, cols: c })}
                          onClick={() => insertTableAtSize(r, c, true)}
                        />
                      );
                    })}
                  </div>
                  <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => insertTableAtSize(2, 2, true)}>
                    Default 2×2
                  </button>
                </div>
              )}
            </div>
          </div>

          {sep}

          <div className={`${groupCls} ml-auto`} role="group" aria-label="Block actions">
            <button type="button" aria-label="Move block up" className={btn(false)} onMouseDown={preserveSelection} onClick={() => runBlockCommand("up")} title="Move block up">
              <ChevronUp className={iconCls} />
            </button>
            <button type="button" aria-label="Move block down" className={btn(false)} onMouseDown={preserveSelection} onClick={() => runBlockCommand("down")} title="Move block down">
              <ChevronDown className={iconCls} />
            </button>
            <button type="button" aria-label="Duplicate block" className={btn(false)} onMouseDown={preserveSelection} onClick={() => runBlockCommand("duplicate")} title="Duplicate block">
              <Copy className={iconCls} />
            </button>
            <button type="button" aria-label="Delete block" className={btn(false, { danger: true })} onMouseDown={preserveSelection} onClick={() => runBlockCommand("delete")} title="Delete block">
              <Trash2 className={iconCls} />
            </button>
            {context !== "PRODUCT" ? (
              <button type="button" aria-label="Insert placeholder text" className={`${btn(false)} px-2 text-xs font-medium`} onMouseDown={preserveSelection} onClick={() => setShowLoremModal(true)} title="Insert Lorem Ipsum">
                Lorem
              </button>
            ) : null}
            <button type="button" aria-label="Undo" className={btn(false)} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().undo().run()} title="Undo">
              <Undo2 className={iconCls} />
            </button>
            <button type="button" aria-label="Redo" className={btn(false)} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().redo().run()} title="Redo">
              <Redo2 className={iconCls} />
            </button>
            <span className="whitespace-nowrap pl-1.5 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
              {wordCount} words
            </span>
          </div>
        </div>

        {inTable && (
          <div className="structured-editor-table-bar flex flex-wrap items-center gap-1.5 border-t border-border bg-surface/90 px-2.5 py-1.5" data-testid="table-edit-toolbar" role="toolbar" aria-label="Table controls">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Table</span>
            <div className={groupCls} role="group" aria-label="Rows">
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("addRowBefore")} title="Add row before" aria-label="Add row before">
                <Plus className="h-3.5 w-3.5" /> Row before
              </button>
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("addRowAfter")} title="Add row after" aria-label="Add row after">
                <Plus className="h-3.5 w-3.5" /> Row after
              </button>
              <button type="button" className={`${btn(false, { danger: true })} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("deleteRow")} title="Delete row" aria-label="Delete row" disabled={!canDeleteRow}>
                <Minus className="h-3.5 w-3.5" /> Delete row
              </button>
            </div>
            {sep}
            <div className={groupCls} role="group" aria-label="Columns">
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("addColumnBefore")} title="Add column before" aria-label="Add column before">
                <Plus className="h-3.5 w-3.5" /> Col before
              </button>
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("addColumnAfter")} title="Add column after" aria-label="Add column after">
                <Plus className="h-3.5 w-3.5" /> Col after
              </button>
              <button type="button" className={`${btn(false, { danger: true })} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("deleteColumn")} title="Delete column" aria-label="Delete column" disabled={!canDeleteCol}>
                <Minus className="h-3.5 w-3.5" /> Delete col
              </button>
            </div>
            {sep}
            <div className={groupCls} role="group" aria-label="Cells">
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("toggleHeaderRow")} title="Toggle header row" aria-label="Toggle header row">
                Header
              </button>
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("mergeCells")} title="Merge cells" aria-label="Merge cells">
                Merge
              </button>
              <button type="button" className={`${btn(false)} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("splitCell")} title="Split cell" aria-label="Split cell">
                Split
              </button>
            </div>
            {sep}
            <button type="button" className={`${btn(false, { danger: true })} px-2 text-xs`} onMouseDown={preserveSelection} onClick={() => runTableCommand("deleteTable")} title="Delete table" aria-label="Delete table">
              <Trash2 className="h-3.5 w-3.5" /> Delete table
            </button>
          </div>
        )}
      </div>

      {showLoremModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowLoremModal(false)}>
          <div className="mx-4 w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Insert Lorem Ipsum</h3>
            <div className="space-y-2">
              <button type="button" className="block w-full rounded border border-border px-3 py-2 text-left hover:bg-muted" onClick={() => insertLorem("words", 50)}>
                50 words
              </button>
              <button type="button" className="block w-full rounded border border-border px-3 py-2 text-left hover:bg-muted" onClick={() => insertLorem("sentences", 2)}>
                2 sentences
              </button>
              <button type="button" className="block w-full rounded border border-border px-3 py-2 text-left hover:bg-muted" onClick={() => insertLorem("paragraphs", 2)}>
                2 paragraphs
              </button>
            </div>
            <button type="button" className="mt-3 text-sm text-muted-foreground" onClick={() => setShowLoremModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCtaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCtaModal(false)}>
          <div className="mx-4 w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Insert CTA Button</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Button text"
                value={ctaForm.text}
                onChange={(e) => setCtaForm((f) => ({ ...f, text: e.target.value }))}
                className="w-full rounded border border-border px-3 py-2"
              />
              <input
                type="text"
                placeholder="URL (/ or https://...)"
                value={ctaForm.url}
                onChange={(e) => setCtaForm((f) => ({ ...f, url: e.target.value }))}
                className="w-full rounded border border-border px-3 py-2"
              />
              <select
                value={ctaForm.variant}
                onChange={(e) => setCtaForm((f) => ({ ...f, variant: e.target.value }))}
                className="w-full rounded border border-border px-3 py-2"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded bg-info px-3 py-1 text-white" onClick={insertCtaButton}>
                Insert
              </button>
              <button type="button" className="rounded border border-border px-3 py-1" onClick={() => setShowCtaModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setShowImageModal(false);
            setPendingImageFile(null);
          }}
        >
          <div className="mx-4 w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()} data-testid="image-insert-modal">
            <h3 className="mb-3 font-semibold">{inImage ? "Edit image" : "Insert image"}</h3>
            <div className="space-y-3">
              {pendingImageFile ? (
                <p className="text-sm text-muted-foreground">Selected file: {pendingImageFile.name}</p>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Image URL (/path or https://...)"
                    value={imageForm.url}
                    onChange={(e) => setImageForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full rounded border border-border px-3 py-2"
                    aria-label="Image URL"
                  />
                  <button type="button" className="text-sm text-info hover:underline" onClick={() => fileInputRef.current?.click()}>
                    Or upload a file
                  </button>
                </>
              )}
              <input
                type="text"
                placeholder="Alt text (recommended)"
                value={imageForm.alt}
                onChange={(e) => setImageForm((f) => ({ ...f, alt: e.target.value }))}
                className="w-full rounded border border-border px-3 py-2"
                aria-label="Image alt text"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded bg-info px-3 py-1 text-white disabled:opacity-50" onClick={applyImageFromModal} disabled={uploading}>
                {uploading ? "Uploading…" : inImage ? "Update" : "Insert"}
              </button>
              <button
                type="button"
                className="rounded border border-border px-3 py-1"
                onClick={() => {
                  setShowImageModal(false);
                  setPendingImageFile(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">{uploadError}</div>
      )}
      <div className="structured-editor-body bg-surface">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default ProductStructuredEditor;
