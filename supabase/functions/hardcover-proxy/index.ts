import { normalizeHardcoverBook, selectHardcoverEdition, hardcoverIdentity } from './hardcover.js';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'https://sodanexus.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' },
});
const BOOK = 'id title description release_year image { url } contributions { author { name } }';
const EDITION = 'id book_id title pages isbn_13 isbn_10 release_year reading_format_id image { url } publisher { name } language { language }';
const cache = new Map<string, { until: number; items: unknown[] }>();
async function graphql(query: string, variables: Record<string, unknown>) {
  const token = Deno.env.get('HARDCOVER_TOKEN')?.trim();
  if (!token) throw new Error('Hardcover non configuré');
  const response = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}`, 'User-Agent': 'Kulturo/4.5.0' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Hardcover HTTP ${response.status}`);
  const data = await response.json();
  if (data.errors?.length) {
    console.error('Hardcover GraphQL:', JSON.stringify(data.errors.map((e: any) => ({message:e.message, code:e.extensions?.code}))));
    throw new Error('Requête Hardcover refusée');
  }
  return data.data;
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Méthode invalide' }, 405);
  // Vérifier une vraie session : la clé publique seule ne donne pas accès au jeton privé.
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Connexion requise' }, 401);
  let stage = 'session';
  try {
    const auth = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (!auth.ok) return reply({ error: 'Session invalide' }, 401);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: 'Requête trop longue' }, 400);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object') return reply({error:'Requête invalide'},400);
    stage = String(body.action);
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
    const identity = hardcoverIdentity(body.id);
    if (!['search', 'details', 'select', 'author', 'publisher'].includes(body.action) || (['search', 'author', 'publisher'].includes(body.action) ? query.length < 2 : !identity)) return reply({ error: 'Requête invalide' }, 400);
    const key = JSON.stringify([body.action, query, identity]);
    const saved = cache.get(key);
    if (saved && saved.until > Date.now()) return reply({ items: saved.items });
    let items;
    if (body.action === 'publisher') {
      const normalized = (value: string) => String(value || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      // Hardcover sépare les éditeurs et auteurs. L'index fournit l'ID de
      // l'éditeur (jamais un ID IGDB) et permet de distinguer les homonymes.
      const found = await graphql('query($q:String!){search(query:$q,query_type:"Publisher",per_page:15,page:1){ids}}', { q: query });
      const ids = (found.search?.ids || []).map(Number)
        .filter((id: number) => Number.isSafeInteger(id) && id > 0).slice(0, 15);
      const result = ids.length ? await graphql('query($ids:[bigint!]!){publishers(where:{id:{_in:$ids}}){id name slug}}', { ids }) : { publishers: [] };
      const publisher = result.publishers?.find((entry: any) => normalized(entry.name) === normalized(query));
      if (!publisher) return reply({ profile: null });
      // On interroge les éditions du publisher et on déduplique les livres.
      // Limite API volontaire : une maison comme Kana compte des milliers de tomes.
      const catalog = await graphql(`query($id:Int!){editions(where:{publisher_id:{_eq:$id}},limit:75,order_by:{users_count:desc}){book{id title release_year image{url}}}}`, { id: publisher.id });
      const seen = new Set<number>();
      const works: any[] = [];
      for (const edition of catalog.editions || []) {
        const book = edition.book;
        if (!Number.isSafeInteger(Number(book?.id)) || !book?.title || seen.has(Number(book.id))) continue;
        seen.add(Number(book.id));
        works.push({ id: book.id, external_id: String(book.id), title: book.title,
          subtype: 'book', source_api: 'hardcover', cover_url: book.image?.url || null,
          release_year: book.release_year || null });
        if (works.length >= 36) break;
      }
      return reply({ profile: { id: publisher.id, name: publisher.name, biography: '',
        source_api: 'hardcover', limited: (catalog.editions || []).length >= 75 || works.length >= 36,
        url: `https://hardcover.app/publishers/${encodeURIComponent(publisher.slug || publisher.id)}`,
        works } });
    }
    if (body.action === 'author') {
      const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      // L'index de recherche fournit un identifiant stable, pas une correspondance floue.
      const found = await graphql('query($q:String!){search(query:$q,query_type:"author",per_page:10,page:1){ids}}', { q: query });
      const ids = (found.search?.ids || []).map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0).slice(0, 10);
      const result = ids.length ? await graphql('query($ids:[Int!]!){authors(where:{id:{_in:$ids}}){id name slug bio books_count}}', { ids }) : { authors: [] };
      const author = result.authors?.find((entry: any) => normalized(entry.name) === normalized(query));
      if (!author) return reply({ profile: null });
      const catalog = await graphql(`query($name:String!){books(where:{contributions:{author:{name:{_eq:$name}}}},limit:100,order_by:{users_count:desc}){id title release_year image { url }}}`, { name: author.name });
      const works = (catalog.books || []).filter((book: any) => book?.id && book?.title).map((book: any) => ({
        external_id: String(book.id), id: book.id, title: book.title, subtype: 'book', source_api: 'hardcover',
        cover_url: book.image?.url || null, release_year: book.release_year || null,
      }));
      return reply({ profile: { id: author.id, name: author.name, biography: author.bio || '',
        source_api: 'hardcover', url: `https://hardcover.app/authors/${author.slug || author.id}`,
        works } });
    }
    if (body.action === 'details' || body.action === 'select') {
      const data = await graphql(`query($id:Int!){books(where:{id:{_eq:$id}},limit:1){${BOOK}}}`, { id: identity!.bookId });
      const book = data.books?.[0];
      const editions = identity!.editionId ? await graphql(`query($id:Int!,$book:Int!){editions(where:{id:{_eq:$id},book_id:{_eq:$book}},limit:1){${EDITION}}}`, { id: identity!.editionId, book: identity!.bookId }) : body.action === 'select' ? await graphql(`query($book:Int!){editions(where:{book_id:{_eq:$book}},limit:30,order_by:{users_count:desc}){${EDITION}}}`, {book:identity!.bookId}) : {editions:[]};
      if (identity!.editionId && !editions.editions?.length) throw new Error('Édition introuvable');
      const edition = identity!.editionId ? editions.editions[0] : selectHardcoverEdition(editions.editions);
      items = book ? [normalizeHardcoverBook(book, edition)] : [];
    } else {
      const isbn = query.replace(/[-\s]/g, '');
      if (/^(\d{13}|\d{9}[\dXx])$/.test(isbn)) {
        const data = await graphql(`query($isbn:String!){editions(where:{_or:[{isbn_13:{_eq:$isbn}},{isbn_10:{_eq:$isbn}}]},limit:5){${EDITION}}}`, { isbn: isbn.toUpperCase() });
        const ids = [...new Set(data.editions.map((e: any) => e.book_id))];
        const books = ids.length ? await graphql(`query($ids:[Int!]!){books(where:{id:{_in:$ids}}){${BOOK}}}`, { ids }) : { books: [] };
        items = data.editions.flatMap((edition: any) => {
          const book = books.books.find((b: any) => b.id === edition.book_id);
          return book ? [normalizeHardcoverBook(book, edition)] : [];
        });
      } else {
        // L'index fournit les vignettes ; aucune édition demandée pendant la frappe.
        const found = await graphql('query($q:String!){search(query:$q,query_type:"Book",per_page:6,page:1){results}}', {q:query});
        const result = typeof found.search?.results === 'string' ? JSON.parse(found.search.results) : found.search?.results;
        if (!Array.isArray(result?.hits)) throw new Error('Format de recherche Hardcover inattendu');
        items = result.hits.map((h:any) => h.document).filter((b:any) => b?.title && Number.isSafeInteger(Number(b.id)) && Number(b.id)>0).slice(0,6).map((b:any) => normalizeHardcoverBook({...b,description:null}));
      }
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 10 * 60_000, items });
    return reply({ items });
  } catch (error) {
    console.error('hardcover-proxy:',stage,error instanceof Error ? error.message : 'Erreur inconnue');
    return reply({ error: 'Hardcover momentanément indisponible' }, 503);
  }
});
