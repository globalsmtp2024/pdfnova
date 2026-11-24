from pathlib import Path

PANELS = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "components" / "tools" / "panels"


def edit(name, pairs):
    path = PANELS / name
    text = path.read_text(encoding="utf8")
    for old, new in pairs:
        assert old in text, (name, old[:60])
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf8")


edit("schema.tsx", [
    ('import { Input, Select } from "@/components/ui/input";',
     'import { Input, PasswordInput, Select, Textarea } from "@/components/ui/input";'),
    ('  const label = (name: string) => (t.has(name) ? t(name) : humanize(name));',
     '  const label = (name: string) => (t.has(name) ? t(name) : humanize(name));\n  const placeholder = (name: string) => (t.has(`${name}_placeholder`) ? t(`${name}_placeholder`) : undefined);\n  const counter = useTranslations("form");'),
    ('''        {kind === "number" || kind === "integer" ? (
          <Input
            id={id}
            dir="ltr"
            type="number"
            inputMode="decimal"''', '''        {kind === "number" || kind === "integer" ? (
          <Input
            id={id}
            dir="ltr"
            type="number"
            inputMode={kind === "integer" ? "numeric" : "decimal"}
            enterKeyHint="done"'''),
    ('''        {kind === "text" ? (
          <Input
            id={id}
            maxLength={field.maxLength}
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : null}''', '''        {kind === "text" && /password/i.test(name) ? (
          <PasswordInput
            id={id}
            autoComplete="off"
            maxLength={field.maxLength}
            placeholder={placeholder(name)}
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : null}
        {kind === "text" && !/password/i.test(name) ? (
          <Input
            id={id}
            dir="auto"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={field.maxLength}
            placeholder={placeholder(name)}
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : null}'''),
    ('''          <textarea
            id={id}
            rows={kind === "area" ? 6 : 4}
            maxLength={field.maxLength}
            value={String(''', '''          <Textarea
            id={id}
            dir="auto"
            rows={kind === "area" ? 6 : 4}
            maxLength={field.maxLength}
            placeholder={placeholder(name)}
            value={String('''),
    ('''            className={cn(
              "rounded-(--radius-control) border border-border-strong bg-surface p-2 text-sm",
              kind === "lines" && "font-mono",
            )}
          />
        ) : null}''', '''            className={cn(kind === "lines" && "font-mono")}
          />
        ) : null}
        {(kind === "area" || kind === "text") && field.maxLength && field.maxLength <= 5000 ? (
          <p className="text-end text-xs text-muted tabular-nums" aria-live="off">
            {counter("chars", {
              count: String(current(name, fallback) ?? "").length,
              max: field.maxLength,
            })}
          </p>
        ) : null}'''),
])

edit("digital-sign.tsx", [
    ('''        <Input
          id="digital-sign-password"
          type="password"
          autoComplete="off"''', '''        <PasswordInput
          id="digital-sign-password"
          autoComplete="off"'''),
])

edit("watermark.tsx", [
    ('''              <textarea
                id="wm-text"
                dir="auto"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="rounded-(--radius-control) border border-border-strong bg-surface p-2 text-sm"
              />''', '''              <Textarea
                id="wm-text"
                dir="auto"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />'''),
])
