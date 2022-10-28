import * as Api from "../../../lib/api";
import Link from "next/link";
import DateString from "../../../lib/components/DateString";
//import buildRSSFeed from "../../../lib/rss";
// import fs from "fs";

const SHOW_IMAGES = false;

export default async function Home() {
  const allPosts = await Api.getAllPosts([
    "title",
    "slug",
    "summary",
    "archive",
    "date",
    "draft",
    "summary_image",
  ]);

  const publicPosts = allPosts.filter(
    (postInfo) => !postInfo.archive && !postInfo.draft
  );

  /*
  const feed = buildRSSFeed(publicPosts);
  // Stole this hack from https://ashleemboyer.com/how-i-added-an-rss-feed-to-my-nextjs-site
  if (!fs.existsSync("public/feed")) {
    fs.mkdirSync("public/feed");
  }
  fs.writeFileSync("public/feed/rss.xml", feed.rss2);
  fs.writeFileSync("public/feed/rss.json", feed.json);
  fs.writeFileSync("public/feed/atom.xml", feed.atom);
  */

  return (
    <>
      {publicPosts.map((post) => {
        return (
          <div key={post.slug} className="py-4 flex justify-between">
            <div>
              <div className="italic text-sm text-gray-400">
                <DateString date={new Date(post.date)} />
              </div>
              <h2 className="font-large font-semibold">
                <Link as={`/blog/${post.slug}`} href="/blog/[slug]">
                  {post.title}
                </Link>
              </h2>
              <p>{post.summary}</p>
            </div>
            {post.summary_image && SHOW_IMAGES ? (
              <img
                width={100}
                height={100}
                src={post.summary_image}
                className="rounded h-20 ml-6 mt-6 ring-gray-400 shadow-inner-md"
              />
            ) : (
              <div />
            )}
          </div>
        );
      })}
    </>
  );
}
