import { useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; group?: string; hint?: string };

/**
 * Searchable list (B6.3, B8.2): type to filter, pick with mouse, touch or the
 * keyboard (arrows, Enter, Escape). Options can be grouped by area. With
 * `allowCustom`, a typed value that is not on the list can be kept ("Other").
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  allowCustom,
  customLabel = (text: string) => `Use "${text}" (not on the list)`,
  invalid,
  id,
  describedBy,
  size = "lg",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string, option?: ComboOption) => void;
  placeholder?: string;
  allowCustom?: boolean;
  customLabel?: (text: string) => string;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  size?: "lg" | "sm";
}) {
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = text ?? selected?.label ?? (allowCustom ? value : "");
  const query = (text ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = query
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query) || (o.group ?? "").toLowerCase().includes(query),
        )
      : options;
    return list.slice(0, 80);
  }, [options, query]);

  const custom =
    allowCustom && query && !options.some((o) => o.label.toLowerCase() === query)
      ? { value: (text ?? "").trim(), label: customLabel((text ?? "").trim()), custom: true }
      : null;
  const items: (ComboOption & { custom?: boolean })[] = custom ? [...filtered, custom] : filtered;

  function choose(item: ComboOption & { custom?: boolean }) {
    onChange(item.value, item.custom ? undefined : item);
    setText(null);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && items[active]) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setText(null);
    }
  }

  let lastGroup: string | undefined;
  return (
    <div className="relative">
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-3.5 text-ink-3",
          size === "lg" ? "top-4 h-4 w-4" : "top-2.5 h-4 w-4",
        )}
      />
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let a click on an option land first.
          setTimeout(() => {
            setOpen(false);
            if (text !== null && allowCustom && text.trim()) {
              const exact = options.find(
                (o) => o.label.toLowerCase() === text.trim().toLowerCase(),
              );
              onChange(exact ? exact.value : text.trim(), exact);
            }
            setText(null);
          }, 150);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full rounded-lg border border-line bg-white pl-10 pr-4 text-ink placeholder:text-ink-3/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15 aria-[invalid=true]:border-danger",
          size === "lg" ? "h-12 text-[16px]" : "h-9 text-[14px]",
        )}
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {items.map((item, i) => {
            const header = item.group && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={`${item.value}-${i}`} role="presentation">
                {header && (
                  <div className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    {header}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={item.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-[15px]",
                    i === active ? "bg-ground" : "",
                    item.custom ? "italic text-ink-2" : "text-ink",
                  )}
                >
                  <span>
                    {item.label}
                    {item.hint && <span className="ml-2 text-[13px] text-ink-3">{item.hint}</span>}
                  </span>
                  {item.value === value && <Check className="h-4 w-4 text-navy" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
