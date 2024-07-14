import fs from "fs";
import { join } from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { Markdown } from "./Markdown";
import { Indexable, Linkable, Listable } from "./interfaces";
import { Tag } from "./Tag";
import { SiteUrl } from "./SiteUrl";
import { Query } from "./GraphQLRoots";

const postsDirectory = join(process.cwd(), "./_posts");

const FILE_NAME_PARSER = /^(\d{4}-\d{2}-\d{2})-([a-z0-9\_\.\-]+)\.md$/g;

/**
 * A formal blog post.
 * @gqlType
 */
export class Post implements Indexable, Linkable, Listable {
  pageType = "post" as const;
  constructor(
    private _content: string,
    private metadata: any,
    private postInfo: PostInfo
  ) {}

  /** @gqlField */
  content(): Markdown {
    return new Markdown(this._content);
  }

  /** @gqlField */
  url(): SiteUrl {
    return new SiteUrl(`/blog/${this.slug()}`);
  }

  /** @gqlField */
  title(): string {
    return this.metadata.title;
  }
  /** A unique name for the Post. Used in the URL and for refetching. */
  slug(): string {
    return this.postInfo.slug;
  }

  /** @gqlField */
  date(): string {
    return this.postInfo.date;
  }

  /** @gqlField */
  summary(): string | undefined {
    return this.metadata.summary || null;
  }

  /** @gqlField */
  summaryImage(): string | undefined {
    return this.metadata.summary_image || null;
  }

  filename(): string {
    return this.postInfo.fileName;
  }

  /** @gqlField */
  canonicalUrl(): string | undefined {
    return this.metadata.canonical_url;
  }
  githubCommentsIssueId(): string | undefined {
    return this.metadata.github_comments_issue_id;
  }
  archive(): boolean {
    return this.metadata.archive || false;
  }
  draft(): boolean {
    return this.metadata.draft || false;
  }
  showInLists(): boolean {
    return !this.archive() && !this.draft();
  }
  /** @gqlField */
  tags(): Tag[] {
    return this.metadata.tags != null
      ? this.metadata.tags.map((tag) => new Tag(tag))
      : [];
  }

  /** @gqlField */
  static async getPostBySlug(_: Query, args: { slug: string }): Promise<Post> {
    return getPostBySlug(args.slug);
  }

  /** @gqlField  */
  static async getAllPosts(_: Query): Promise<Post[]> {
    return getAllPosts();
  }
}

type PostInfo = {
  fileName: string;
  slug: string;
  date: string;
};

function getSlugPostMap(): { [slug: string]: PostInfo } {
  const map = {};
  for (const fileName of fs.readdirSync(postsDirectory)) {
    const matches = Array.from(fileName.matchAll(FILE_NAME_PARSER))[0];
    if (matches == null) {
      throw new Error(`Incorrect filename for post. Got "${fileName}".`);
    }
    const [_, date, slug] = matches;
    map[slug] = { fileName, slug, date };
  }
  return map;
}

export function getPostBySlug(slug: string): Post {
  const postInfo = getSlugPostMap()[slug];
  if (postInfo == null) {
    throw new Error(`Could not find file for slug "${slug}".`);
  }
  const fullPath = join(postsDirectory, `${postInfo.fileName}`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents, {
    engines: {
      // @ts-ignore
      yaml: (s) => yaml.load(s, { schema: yaml.JSON_SCHEMA }),
    },
  });

  return new Post(content, data, postInfo);
}

export function getAllPosts(): Post[] {
  const posts = Object.values(getSlugPostMap())
    .map(({ slug }) => getPostBySlug(slug))
    // sort posts by date in descending order
    .sort((post1, post2) => (post1.date() < post2.date() ? 1 : -1));
  return posts;
}
