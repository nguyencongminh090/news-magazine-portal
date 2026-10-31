/**
 * Shapes the UI expects from the read API (item #11 owns the contract).
 * @typedef {{ slug: string, name: string }} CategoryRef
 * @typedef {{ slug: string, title: string, summary: string|null, body: string,
 *   publishedAt: string|null, category: CategoryRef|null }} Article
 * @typedef {{ items: Article[], page: number, pageSize: number, total: number }} ArticlePage
 * @typedef {{ slug: string, name: string, articleCount: number }} Category
 */
export {};
