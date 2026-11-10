/**
 * Opens Not spending's charges, which have no block of their own (N26).
 * Its own file, so the Month can name it without loading the charges
 * sheet, which it fetches the first time a row is opened.
 */
export const NOT_SPENDING = 'not-spending'
