/**
 * Pure helper functions for the address-book state in the remittance wizard.
 *
 * Keeping these pure (no React state mutations) makes them trivially testable
 * and lets the component stay thin.
 */

import type { DeliveryMethod } from "./remittance";

/** A single address-book entry. Separate from immutable transfer history. */
export interface AddressBookEntry {
  id: number;
  name: string;
  location: string;
  deliveryMethod?: DeliveryMethod;
  bankId?: string;
  accountNumber?: string;
  walletId?: string;
  phoneNumber?: string;
}

// ─── applyEdit ───────────────────────────────────────────────────────────────

export interface EditResult {
  /** Updated address book (transfer history is left untouched by the caller). */
  book: AddressBookEntry[];
  /**
   * When the edited entry is currently selected in the form, the caller must
   * update the form fields to the new values.  `null` means no sync needed.
   */
  formSync: { name: string; location: string } | null;
}

/**
 * Apply an inline edit to the address book.
 *
 * @param book          Current address-book state.
 * @param editingId     The id of the entry being edited.
 * @param newName       Trimmed new name.
 * @param newLoc        Trimmed new location.
 * @param selectedId    The id that is currently selected in the send form
 *                      (`null` when the user is entering a new recipient).
 */
export function applyEdit(
  book: AddressBookEntry[],
  editingId: number,
  newName: string,
  newLoc: string,
  selectedId: number | null,
): EditResult {
  const updatedBook = book.map(e =>
    e.id === editingId ? { ...e, name: newName, location: newLoc } : e,
  );

  const formSync =
    selectedId === editingId ? { name: newName, location: newLoc } : null;

  return { book: updatedBook, formSync };
}

// ─── applyDelete ─────────────────────────────────────────────────────────────

export interface DeleteResult {
  /** Updated address book with the entry removed. */
  book: AddressBookEntry[];
  /**
   * When the deleted entry was selected, the caller must clear the form fields.
   * `true` means "deselect and clear".
   */
  deselect: boolean;
}

/**
 * Remove an entry from the address book and signal whether the form should be
 * cleared.
 *
 * @param book       Current address-book state.
 * @param entry      The entry to delete.
 * @param selectedId The id that is currently selected in the send form.
 */
export function applyDelete(
  book: AddressBookEntry[],
  entry: AddressBookEntry,
  selectedId: number | null,
): DeleteResult {
  const updatedBook = book.filter(e => e.id !== entry.id);
  const deselect = selectedId === entry.id;
  return { book: updatedBook, deselect };
}

// ─── applyUndoDelete ─────────────────────────────────────────────────────────

/**
 * Re-insert a deleted entry at the front of the address book.
 *
 * @param book    Current address-book state (without the deleted entry).
 * @param entry   The entry to restore.
 * @returns       Updated address book with the entry prepended.
 */
export function applyUndoDelete(
  book: AddressBookEntry[],
  entry: AddressBookEntry,
): AddressBookEntry[] {
  return [entry, ...book];
}
