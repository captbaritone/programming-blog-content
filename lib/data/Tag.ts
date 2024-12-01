import { SearchIndexRow } from "../search";
import { Query } from "./GraphQLRoots";
import { Linkable } from "./interfaces";
import { SiteUrl } from "./SiteUrl";
import * as Data from "../data";
import { db } from "../db";

/**
 * A tag that can be associated with items.
 * @gqlType
 */
export class Tag implements Linkable {
  constructor(private _name: string) {}

  /** @gqlField */
  name(): string {
    return this._name;
  }
  /** @gqlField */
  url(): SiteUrl {
    return new SiteUrl(`/tag/${this.name()}`);
  }

  /**
   * The list of items that have this tag.
   * @gqlField
   */
  items(): Data.ListableSearchRow[] {
    const rows = ITEMS_WITH_TAG.all({ tag: this.name() });
    return rows.map((row) => new Data.ListableSearchRow(row));
  }

  /** @gqlField */
  static getTagByName(_: Query, args: { name: string }): Tag {
    return new Tag(args.name);
  }
}

const ITEMS_WITH_TAG = db.prepare<{ tag: string }, SearchIndexRow>(
  `
SELECT
search_index.slug,
search_index.page_type,
search_index.summary,
search_index.tags,
search_index.title,
search_index.summary_image_path,
search_index.metadata,
search_index.date,
search_index.feed_id
FROM search_index
WHERE search_index.tags LIKE '%' || :tag || '%'
ORDER BY page_rank DESC;`,
);
