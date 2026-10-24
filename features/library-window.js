// La recherche et le tri portent sur toutes les données ; seule la vue est limitée.
export function createLibraryWindow(batchSize = 48) {
  let items = [], key = null, limit = batchSize;
  return {
    update(nextItems, nextKey, reset = false) {
      if (reset || nextKey !== key) limit = batchSize;
      key = nextKey;
      items = nextItems;
    },
    visible: (start = 0) => items.slice(start, limit),
    hasMore: () => items.length > limit,
    next() {
      if (items.length <= limit) return false;
      limit += batchSize;
      return true;
    },
    ensure(id) {
      const index = items.findIndex(item => String(item.id) === String(id));
      if (index < limit) return false;
      limit = Math.ceil((index + 1) / batchSize) * batchSize;
      return true;
    },
    snapshot: () => ({ key, limit }),
    restore(saved) {
      if (typeof saved?.key !== 'string' || !Number.isSafeInteger(saved.limit) || saved.limit < batchSize) return;
      key = saved.key;
      limit = saved.limit;
    },
    clear() { items = []; key = null; limit = batchSize; },
  };
}
