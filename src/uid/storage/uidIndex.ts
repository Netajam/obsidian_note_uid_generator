/**
 * Which notes carry which uid, both ways round.
 *
 * This was a `Set` of uids beside a path → uid map, which was enough while a
 * uid could belong to only one note. It could not survive the thing the
 * plugin exists to prevent: two notes carrying the same uid. Duplicates
 * arrive by ordinary means — a copied note, a synced folder, a template — and
 * a Set cannot say how many notes put a uid there. So clearing the uid off one
 * of two twins evicted it from collision detection while the other still
 * carried it, and the generator would hand it out a third time.
 *
 * Counting owners answers both questions from one structure: "is this uid
 * taken" is whether it has owners at all, and "is it duplicated" is whether it
 * has more than one.
 */
export class UidIndex {
	/** uid → every note path carrying it. Never holds an empty set; see `forget`. */
	private readonly ownersByUid = new Map<string, Set<string>>();

	/** note path → the uid it carries, so a deleted note can be evicted without its metadata. */
	private readonly uidByPath = new Map<string, string>();

	/** Empties the index — before a rebuild, and whenever the uid key changes. */
	clear(): void {
		this.ownersByUid.clear();
		this.uidByPath.clear();
	}

	/** Records that `path` carries `uid`, in place of whatever it carried before. */
	set(path: string, uid: string): void {
		this.forget(path);
		this.uidByPath.set(path, uid);

		const owners = this.ownersByUid.get(uid);
		if (owners) owners.add(path);
		else this.ownersByUid.set(uid, new Set([path]));
	}

	/** Drops `path` — a deleted note, or one whose uid was removed. */
	forget(path: string): void {
		const uid = this.uidByPath.get(path);
		if (uid === undefined) return;

		this.uidByPath.delete(path);
		const owners = this.ownersByUid.get(uid);
		if (!owners) return;

		owners.delete(path);
		// An empty set would still answer `has` with true.
		if (owners.size === 0) this.ownersByUid.delete(uid);
	}

	/** The uid `path` was last seen carrying, or null. */
	uidAt(path: string): string | null {
		return this.uidByPath.get(path) ?? null;
	}

	/** Whether any note carries `uid`. This is the collision check. */
	has(uid: string): boolean {
		return this.ownersByUid.has(uid);
	}

	/** Every note path carrying `uid`, sorted. More than one of them is a duplicate. */
	owners(uid: string): string[] {
		return [...(this.ownersByUid.get(uid) ?? [])].sort();
	}
}
