/**
 * Mega-menu tree types + pure slug→ObjectId resolution for search facets.
 * Kept free of media/API imports so unit tests can load this module under Node.
 */

export type MegaMenuChild = {
  id: string;
  slug: string;
  name: string;
};

export type MegaMenuSubcategory = {
  id: string;
  slug: string;
  name: string;
  children: MegaMenuChild[];
};

export type MegaMenuCategory = {
  id: string;
  slug: string;
  name: string;
  subcategories: MegaMenuSubcategory[];
};

export type MegaMenuTree = MegaMenuCategory[];

type BackendNode = {
  _id?: unknown;
  id?: unknown;
  name?: string;
  slug?: string;
  isActive?: boolean;
  subcategories?: Array<
    BackendNode & { childCategories?: BackendNode[] }
  >;
  childCategories?: BackendNode[];
};

function nodeId(raw: BackendNode): string {
  const value = raw._id ?? raw.id;
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }
  return "";
}

function mapChild(raw: BackendNode | null | undefined): MegaMenuChild | null {
  if (!raw) return null;
  const id = nodeId(raw);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !slug || !name) return null;
  return { id, slug, name };
}

function mapSub(
  raw: (BackendNode & { childCategories?: BackendNode[] }) | null | undefined,
): MegaMenuSubcategory | null {
  if (!raw) return null;
  const id = nodeId(raw);
  const slug = String(raw.slug ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !slug || !name) return null;
  const children = (raw.childCategories ?? [])
    .map((c) => mapChild(c))
    .filter((c): c is MegaMenuChild => Boolean(c));
  return { id, slug, name, children };
}

export function mapMegaMenuTree(raw: unknown): MegaMenuTree {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const cat = item as BackendNode;
      if (cat.isActive === false) return null;
      const id = nodeId(cat);
      const slug = String(cat.slug ?? "").trim();
      const name = String(cat.name ?? "").trim();
      if (!id || !slug || !name) return null;
      const subcategories = (cat.subcategories ?? [])
        .map((s) => mapSub(s))
        .filter((s): s is MegaMenuSubcategory => Boolean(s));
      return { id, slug, name, subcategories } satisfies MegaMenuCategory;
    })
    .filter((c): c is MegaMenuCategory => Boolean(c));
}

/** Resolve discovery facet slugs → ObjectIds using a mega-menu tree. */
export function resolveTaxonomyFilterIds(
  tree: MegaMenuTree,
  slugs: { category?: string; subcategory?: string; child?: string },
): {
  categoryId?: string;
  subcategoryId?: string;
  childCategoryId?: string;
} {
  if (!slugs.category) return {};
  const cat = tree.find((c) => c.slug === slugs.category);
  if (!cat) return {};

  const result: {
    categoryId?: string;
    subcategoryId?: string;
    childCategoryId?: string;
  } = { categoryId: cat.id };

  if (!slugs.subcategory) return result;
  const sub = cat.subcategories.find((s) => s.slug === slugs.subcategory);
  if (!sub) return result;
  result.subcategoryId = sub.id;

  if (!slugs.child) return result;
  const child = sub.children.find((c) => c.slug === slugs.child);
  if (!child) return result;
  result.childCategoryId = child.id;
  return result;
}
