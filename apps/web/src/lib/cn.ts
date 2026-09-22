/**
 * Join class names, dropping the falsy ones.
 *
 * shadcn/ui uses clsx + tailwind-merge for this. tailwind-merge resolves
 * conflicting classes (`text-base` then `text-4xl`); a plain join does not,
 * and which one wins then depends on stylesheet order rather than on the order
 * written. That bit once — a headline rendered at body size — so the rule here
 * is structural instead: a base component never sets a property a caller is
 * expected to change. Size and padding choices are props (Input's `size`,
 * CardContent's missing top padding), not overrides. This keeps the app free
 * of a dependency CLAUDE.md would require justifying on its own.
 */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
