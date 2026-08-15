import { describe, it, expect } from "vitest";
import {
  applyEdit,
  applyDelete,
  applyUndoDelete,
  type AddressBookEntry,
} from "./recipient-book";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ABEBE: AddressBookEntry = {
  id: 1,
  name: "Abebe Bekele",
  location: "Addis Ababa, ET",
  deliveryMethod: "bank",
  bankId: "cbe",
  accountNumber: "10000123456789",
};

const TIGIST: AddressBookEntry = {
  id: 2,
  name: "Tigist Haile",
  location: "Hawassa, ET",
  deliveryMethod: "wallet",
  walletId: "telebirr",
  phoneNumber: "+251911234567",
};

const BOOK: AddressBookEntry[] = [ABEBE, TIGIST];

// ─── applyEdit ────────────────────────────────────────────────────────────────

describe("applyEdit", () => {
  it("updates the edited entry's name and location in the address book", () => {
    const { book } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", null);
    const updated = book.find(e => e.id === 1)!;
    expect(updated.name).toBe("Abebe B.");
    expect(updated.location).toBe("Dire Dawa, ET");
  });

  it("leaves other entries unchanged", () => {
    const { book } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", null);
    const other = book.find(e => e.id === 2)!;
    expect(other).toEqual(TIGIST);
  });

  it("preserves delivery details (bankId, accountNumber) on the edited entry", () => {
    const { book } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", null);
    const updated = book.find(e => e.id === 1)!;
    expect(updated.deliveryMethod).toBe("bank");
    expect(updated.bankId).toBe("cbe");
    expect(updated.accountNumber).toBe("10000123456789");
  });

  it("returns formSync with new name/location when the edited entry IS selected", () => {
    const { formSync } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", 1);
    expect(formSync).toEqual({ name: "Abebe B.", location: "Dire Dawa, ET" });
  });

  it("returns formSync = null when the edited entry is NOT selected", () => {
    const { formSync } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", 2);
    expect(formSync).toBeNull();
  });

  it("returns formSync = null when no recipient is selected (selectedId = null)", () => {
    const { formSync } = applyEdit(BOOK, 1, "Abebe B.", "Dire Dawa, ET", null);
    expect(formSync).toBeNull();
  });
});

// ─── applyDelete ─────────────────────────────────────────────────────────────

describe("applyDelete", () => {
  it("removes the deleted entry from the book", () => {
    const { book } = applyDelete(BOOK, ABEBE, null);
    expect(book).toHaveLength(1);
    expect(book.find(e => e.id === 1)).toBeUndefined();
  });

  it("leaves other entries intact after deletion", () => {
    const { book } = applyDelete(BOOK, ABEBE, null);
    expect(book[0]).toEqual(TIGIST);
  });

  it("signals deselect = true when the deleted entry IS the selected recipient", () => {
    const { deselect } = applyDelete(BOOK, ABEBE, 1);
    expect(deselect).toBe(true);
  });

  it("signals deselect = false when the deleted entry is NOT selected", () => {
    const { deselect } = applyDelete(BOOK, ABEBE, 2);
    expect(deselect).toBe(false);
  });

  it("signals deselect = false when no recipient is selected (selectedId = null)", () => {
    const { deselect } = applyDelete(BOOK, ABEBE, null);
    expect(deselect).toBe(false);
  });

  it("handles deleting the only entry", () => {
    const { book, deselect } = applyDelete([ABEBE], ABEBE, 1);
    expect(book).toHaveLength(0);
    expect(deselect).toBe(true);
  });
});

// ─── applyUndoDelete ─────────────────────────────────────────────────────────

describe("applyUndoDelete", () => {
  it("prepends the restored entry to the front of the book", () => {
    // Simulate: ABEBE was deleted, leaving only TIGIST
    const bookAfterDelete = [TIGIST];
    const restored = applyUndoDelete(bookAfterDelete, ABEBE);
    expect(restored).toHaveLength(2);
    expect(restored[0]).toEqual(ABEBE);
    expect(restored[1]).toEqual(TIGIST);
  });

  it("restores all fields of the deleted entry", () => {
    const restored = applyUndoDelete([], ABEBE);
    expect(restored[0].deliveryMethod).toBe("bank");
    expect(restored[0].bankId).toBe("cbe");
    expect(restored[0].accountNumber).toBe("10000123456789");
  });

  it("restores into an already-populated book without disrupting existing entries", () => {
    const bookAfterDelete = [TIGIST, { id: 3, name: "Dawit Tesfaye", location: "Dire Dawa, ET" }];
    const restored = applyUndoDelete(bookAfterDelete, ABEBE);
    expect(restored).toHaveLength(3);
    expect(restored[0].id).toBe(1); // ABEBE at front
    expect(restored[1].id).toBe(2); // TIGIST unchanged
  });
});

// ─── Interaction scenarios ────────────────────────────────────────────────────

describe("edit → delete → undo interaction", () => {
  it("editing the selected recipient updates form fields, then deletion still deselects cleanly", () => {
    // Step 1: user selects ABEBE (selectedId = 1)
    // Step 2: user edits ABEBE's name
    const { book: bookAfterEdit, formSync } = applyEdit(
      BOOK, 1, "Abebe B.", "Addis Ababa, ET", 1,
    );
    expect(formSync).toEqual({ name: "Abebe B.", location: "Addis Ababa, ET" });

    // Step 3: user then deletes the (now-renamed) entry
    const editedEntry = bookAfterEdit.find(e => e.id === 1)!;
    const { book: bookAfterDelete, deselect } = applyDelete(bookAfterEdit, editedEntry, 1);
    expect(deselect).toBe(true);
    expect(bookAfterDelete.find(e => e.id === 1)).toBeUndefined();
  });

  it("undo after deleting the selected recipient re-populates with current (possibly renamed) fields", () => {
    // Rename ABEBE first
    const { book: bookAfterEdit } = applyEdit(BOOK, 1, "Abebe B.", "Addis Ababa, ET", 1);
    const renamedEntry = bookAfterEdit.find(e => e.id === 1)!;

    // Delete the renamed entry (it was selected)
    const { book: bookAfterDelete } = applyDelete(bookAfterEdit, renamedEntry, 1);

    // Undo: restore
    const restored = applyUndoDelete(bookAfterDelete, renamedEntry);
    const entry = restored.find(e => e.id === 1)!;
    expect(entry.name).toBe("Abebe B."); // the renamed name is restored, not the original
    expect(entry.location).toBe("Addis Ababa, ET");
  });

  it("deleting a non-selected recipient leaves the form fields unaffected (deselect = false)", () => {
    // selectedId = 2 (TIGIST is selected), user deletes ABEBE
    const { deselect, book } = applyDelete(BOOK, ABEBE, 2);
    expect(deselect).toBe(false);   // form should NOT be cleared
    expect(book.find(e => e.id === 2)).toEqual(TIGIST); // TIGIST still in book
  });
});
