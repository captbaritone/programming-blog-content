import path from "node:path";
import fs from "node:fs";
import { Markdown } from "./Markdown";
import { Indexable, Linkable, Listable } from "./interfaces.js";
import yaml from "js-yaml";
import { SiteUrl } from "./SiteUrl";
import { Query } from "./GraphQLRoots";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  blocksToMarkdownAst,
  getMetadata,
  METADATA_DATABASE_ID,
  retrieveBlocks,
  retrievePage,
} from "../services/notion";
import { TagSet } from "./TagSet";
import { Node } from "unist";
import { visit } from "unist-util-visit";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

// Regex matching Youtube URLs and extracting the token
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;

/**
 * A less formal post. Usually a quite observation, shared link or anecdote.
 * @gqlType
 */
export class Note implements Indexable, Linkable, Listable {
  pageType = "note" as const;
  constructor(
    private id: string,
    private _slug: string,
    private _tags: string[],
    private _title: string,
    private _summary: string | undefined,
    private _date: string,
    private _status: Status = "Published"
  ) {}

  // The Feed ID uses the notionID instead of the slug because the slug can
  // change, or at least get added later.
  feedId(): string {
    const url = new SiteUrl(`/notes/${this.notionId()}`);
    return url.fullyQualified();
  }

  notionId(): string {
    return this.id;
  }

  /** @gqlField */
  url(): SiteUrl {
    return new SiteUrl(`/notes/${this.slug()}`);
  }

  /** @gqlField */
  tagSet(): TagSet {
    return TagSet.fromTagStrings(this._tags);
  }

  /** A unique name for the Note. Used in the URL and for refetching. */
  slug(): string {
    return this._slug;
  }

  /** @gqlField */
  title(): string {
    return this._title;
  }

  /** @gqlField */
  date(): string {
    return this._date;
  }

  /** @gqlField */
  summary(): string | undefined {
    return this._summary;
  }

  /** @gqlField */
  async summaryImage(): Promise<string | undefined> {
    const markdown = await this.content();
    const markdownAst = await markdown.ast();
    let summaryImage: string | undefined = undefined;
    visit(markdownAst, (node, index, parent) => {
      if (summaryImage != null) {
        return false;
      }
      if (node.type === "image" && node.imageProps?.cachedPath) {
        summaryImage = node.imageProps.cachedPath;
      }
      if (node.type === "leafDirective" && node.name === "youtube") {
        summaryImage = `https://img.youtube.com/vi/${node.attributes.token}/hqdefault.jpg`;
      }
    });

    return summaryImage;
  }

  async rawMarkdownAst(): Promise<Node> {
    const pageBlocks = await retrieveBlocks(this.id);
    const ast = await blocksToMarkdownAst(pageBlocks.results);
    applyDirectives(ast);
    return ast;
  }

  /** @gqlField */
  async content(): Promise<Markdown> {
    const ast = await this.rawMarkdownAst();
    await downloadImages(ast);
    return new Markdown(ast);
  }

  async contentWithHeader(): Promise<string> {
    const contentMarkdown = await this.content();

    const metadata: {
      title: string;
      tags: string[];
      summary: string | undefined;
      summary_image?: string;
      notion_id: string;
      archive?: boolean;
    } = {
      title: this.title(),
      tags: this.tagSet().tagNames(),
      summary: this.summary(),
      notion_id: this.notionId(),
    };
    const summaryImage = await this.summaryImage();

    if (summaryImage) {
      metadata.summary_image = summaryImage;
    }
    if (this._status === "Archived") {
      metadata.archive = true;
    }
    const yamlMetadata = yaml.dump(metadata);
    const markdown = `---\n${yamlMetadata}---\n${await contentMarkdown.markdownString()}`;
    return markdown;
  }

  serializedFilename(forceNotionId: boolean = false): string {
    const date = new Date(this.date()).toISOString().substring(0, 10);
    const slug = forceNotionId ? this.notionId() : this.slug();
    return `${date}-${slug}.md`;
  }

  showInLists(): boolean {
    return this._status === "Published";
  }

  /** @gqlField */
  static async getNoteBySlug(_: Query, args: { slug: string }): Promise<Note> {
    return getNoteBySlug(args.slug);
  }

  /** @gqlField  */
  static async getAllNotes(_: Query): Promise<Note[]> {
    return getAllNotes();
  }
}

function applyDirectives(ast: Node) {
  visit(ast, "paragraph", (_node, index, parent) => {
    const node: any = _node;
    if (node.children.length === 1 && node.children[0].type === "link") {
      const linkNode = node.children[0];
      if (YOUTUBE_REGEX.test(linkNode.url)) {
        // @ts-ignore
        const [, token] = YOUTUBE_REGEX.exec(linkNode.url);
        // @ts-ignore
        parent.children.splice(index, 1, {
          type: "leafDirective",
          name: "youtube",
          attributes: { token },
        });
      }
    }
  });
}

export async function getAllNotes(): Promise<Note[]> {
  const metadata = await getMetadata();

  const rows: PageObjectResponse[] = metadata.rowPosts;

  const rowNotes = rows
    .filter((block) => {
      const status = expectStatus(block);
      return status === "Published" || status === "Archived";
    })
    .map((page) => {
      const tags = expectTags(page);
      const slug = expectSlug(page);
      const summary = expectSummary(page);
      const date = expectPublishedDate(page);
      const title = expectTitle(page, slug);
      const status = expectStatus(page);
      return new Note(page.id, slug, tags, title, summary, date, status);
    });

  rowNotes.sort((a, b) => {
    return new Date(a.date()).getTime() > new Date(b.date()).getTime() ? -1 : 1;
  });
  return rowNotes;
}

export async function getNoteBySlug(slug: string): Promise<Note> {
  const { slugToId } = await getMetadata();

  const id = slugToId[slug] ?? slug;
  const page = await retrievePage(id);
  if (
    page.parent.type !== "database_id" ||
    page.parent.database_id !== METADATA_DATABASE_ID
  ) {
    throw new Error("Invalid page ID.");
  }

  const title = expectTitle(page, slug);
  const summary = expectSummary(page);
  const tags = expectTags(page);
  return new Note(page.id, slug, tags, title, summary, page.created_time);
}

type Status = "Published" | "Archived" | "Draft";

function expectStatus(page: PageObjectResponse): Status {
  const properties: any = page.properties;
  const status = properties.Status.select?.name;
  switch (status) {
    case "Published":
    case "Archived":
    case "Draft":
      return status;
    default:
      return "Draft";
  }
}

function expectTitle(page: PageObjectResponse, slug: string): string {
  const properties: any = page.properties;
  const texts = properties.Note.title.map((block) => {
    if (block.type !== "text") {
      throw new Error(`Expected a text block for ${slug}.`);
    }
    return block.text.content;
  });

  return texts.join("");
}

function expectPublishedDate(page: PageObjectResponse): string {
  const properties: any = page.properties;
  const publishedDate = properties["Published Date"].date;
  return publishedDate != null ? publishedDate.start : page.created_time;
}

function expectSlug(page: PageObjectResponse): string {
  // @ts-ignore
  const slugRichText = page.properties.Slug.rich_text[0];
  return slugRichText ? slugRichText.text.content : page.id;
}

function expectSummary(page: PageObjectResponse): string {
  const properties: any = page.properties;
  return properties.Summary.rich_text[0]?.text.content;
}

function expectTags(page: PageObjectResponse): string[] {
  const properties: any = page.properties;
  return properties.Tags.multi_select.map((select) => {
    return select.name;
  });
}

async function downloadImages(tree): Promise<void> {
  const promises: Promise<unknown>[] = [];
  visit(tree, (node, index, parent) => {
    if (node.type === "image") {
      const url = new URL(node.url);
      if (url.hostname.endsWith("amazonaws.com")) {
        const pathname = url.pathname;
        const destination = path.join(
          process.cwd(),
          "public",
          "notion-mirror",
          pathname
        );

        // If the file already exists:
        if (!fs.existsSync(destination)) {
          // ensure the directory exists
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          promises.push(
            fetch(node.url, { cache: "no-store" })
              .then(async ({ body, ok }) => {
                if (!ok) {
                  console.error("Failed to fetch image", node.url);
                  return;
                }
                // Save file to destination
                const dest = fs.createWriteStream(destination);
                await finished(Readable.fromWeb(body).pipe(dest));
              })
              .catch((e) => {
                console.error("Failed to fetch image", node.url, e);
              })
          );
        }
      }
    }
  });
  await Promise.all(promises);
}
