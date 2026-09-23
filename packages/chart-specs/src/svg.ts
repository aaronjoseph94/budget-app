/**
 * The one way this package writes markup.
 *
 * A chart here is an SVG string (CAPABILITY-MAP.md), and the app puts that
 * string into the page as markup. Category names are typed by the owner, and
 * a name reaching a string that becomes markup is a name that can become
 * markup: "Fun & <Games>" would open a tag. So nothing in this package writes
 * a tag by hand. Every element comes from `el`, which escapes every text
 * child and every attribute value on the way in, and only an element `el`
 * built is ever inserted unescaped. What a caller passes is data, never
 * markup (CLAUDE.md: never render ingested or model-produced text as markup).
 *
 * Numbers in attributes must be whole. Chart geometry is laid out on an
 * integer grid, fine enough that a pixel is several units, so a float that
 * reached an attribute is a sum done somewhere it should not have been, and
 * fails here rather than being printed.
 */

/** A finished SVG document from this package. Only this package makes one. */
export type SvgMarkup = string & { readonly __brand: 'SvgMarkup' }

/**
 * An element `el` built. An object, not a string, so that a child can be
 * told apart from text at run time: a string child is always escaped, and
 * only a node `el` built is trusted. Being shaped like one is not enough:
 * `el` records every node it makes, and anything else handed in as a child
 * or to `finish` is refused, so no file here can write a tag by hand.
 */
export interface SvgNode {
  readonly markup: string
}

export type SvgChild = SvgNode | string

// Every node `el` has made. Private to this file, so nothing else can add one.
const BUILT = new WeakSet<SvgNode>()

function built(markup: string): SvgNode {
  const node = Object.freeze({ markup })
  BUILT.add(node)
  return node
}

function trusted(node: SvgNode): string {
  if (!BUILT.has(node)) throw new TypeError('Only el builds markup; this node was made some other way')
  return node.markup
}

// Element and attribute names are this package's constants, never input; the
// check makes a mistake loud rather than a malformed document.
const NAME = /^[a-zA-Z][a-zA-Z0-9-]*(:[a-zA-Z][a-zA-Z0-9-]*)?$/

// Characters XML 1.0 does not allow anywhere in a document. An HTML page
// would take them; an exported SVG file would be refused whole, so they
// become the replacement character here.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

/** Text made safe as an SVG text node or a double-quoted attribute value. */
export function escapeXml(text: string): string {
  return text
    .replace(NOT_XML, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** One element: its attributes in the order given, then its children. */
export function el(
  name: string,
  attributes: Readonly<Record<string, string | number>>,
  children: readonly SvgChild[] = [],
): SvgNode {
  if (!NAME.test(name)) throw new RangeError(`Not an element name: ${name}`)
  const attrs = Object.entries(attributes).map(([key, value]) => {
    if (!NAME.test(key)) throw new RangeError(`Not an attribute name: ${key}`)
    if (typeof value === 'number' && !Number.isInteger(value)) {
      throw new RangeError(`${name} ${key} must be a whole number of units, received ${value}`)
    }
    return ` ${key}="${escapeXml(String(value))}"`
  })
  const open = `<${name}${attrs.join('')}`
  if (children.length === 0) return built(`${open}/>`)
  const inner = children.map((c) => (typeof c === 'string' ? escapeXml(c) : trusted(c))).join('')
  return built(`${open}>${inner}</${name}>`)
}

/** The finished string for an `svg` element built by `el`. */
export function finish(root: SvgNode): SvgMarkup {
  return trusted(root) as SvgMarkup
}
