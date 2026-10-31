/** TipTap rich-text editor for article bodies — full RTL, WordPress-like
 *  toolbar: H2–H4, bold/italic/underline, lists, quote, table, link,
 *  image upload (server-side validated), divider, undo/redo.
 *  Output is HTML — the backend sanitizes it again on save. */

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table as TableIcon,
  TextQuote,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";
import { useRef } from "react";
import { api } from "../services/api";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichEditor({ value, onChange, placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      TiptapImage.configure({ inline: false }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? "متن مقاله را بنویسید…" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rte-body",
        dir: "rtl",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("آدرس لینک (https://…)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      window.alert("لینک باید با http:// یا https:// شروع شود.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      window.alert("فقط JPG/PNG/WebP قابل قبول است.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert("حجم تصویر حداکثر ۲ مگابایت.");
      return;
    }
    const alt = window.prompt("متن جایگزین تصویر (alt — برای سئو و دسترس‌پذیری)", "") ?? "";
    const form = new FormData();
    form.append("file", file);
    form.append("alt", alt);
    try {
      const media = await api.upload<{ url: string }>("/admin/media", form);
      editor.chain().focus().setImage({ src: media.url, alt }).run();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "آپلود ناموفق بود.");
    }
  }

  const Btn = ({
    onClick,
    active,
    label,
    children,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    label: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} /* keep editor selection */
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rte-btn ${active ? "rte-btn--on" : ""}`}
    >
      {children}
    </button>
  );

  if (!editor) return null;

  return (
    <div className="rte" dir="rtl">
      <div className="rte-bar" role="toolbar" aria-label="نوار ابزار ویرایش">
        <Btn
          label="تیتر ۲"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </Btn>
        <Btn
          label="تیتر ۳"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={15} />
        </Btn>
        <Btn
          label="تیتر ۴"
          active={editor.isActive("heading", { level: 4 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        >
          <Heading4 size={15} />
        </Btn>
        <span className="rte-sep" />
        <Btn label="پررنگ" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={15} />
        </Btn>
        <Btn
          label="ایتالیک"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </Btn>
        <Btn
          label="زیرخط"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </Btn>
        <Btn
          label="خط‌خورده"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={15} />
        </Btn>
        <Btn label="حذف قالب‌بندی" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting size={15} />
        </Btn>
        <span className="rte-sep" />
        <Btn
          label="لیست نقطه‌ای"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </Btn>
        <Btn
          label="لیست شماره‌دار"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </Btn>
        <Btn
          label="نقل‌قول"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <TextQuote size={15} />
        </Btn>
        <span className="rte-sep" />
        <Btn label="لینک" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon size={15} />
        </Btn>
        <Btn
          label="حذف لینک"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
        >
          <Unlink size={15} />
        </Btn>
        <Btn
          label="جدول"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={15} />
        </Btn>
        <Btn label="تصویر" onClick={() => fileRef.current?.click()}>
          <ImageIcon size={15} />
        </Btn>
        <Btn label="خط جداکننده" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={15} />
        </Btn>
        <span className="rte-sep" />
        <Btn label="واگرد" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={15} />
        </Btn>
        <Btn label="از سر" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={15} />
        </Btn>
      </div>
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pickImage(e)}
      />
    </div>
  );
}
