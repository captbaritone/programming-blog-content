import { getNotes } from "./notion";
import DateString from "../../lib/components/DateString";
import Link from "next/link";

// https://beta.nextjs.org/docs/data-fetching/caching#segment-level-caching
export const revalidate = 600;

export const metadata = {
  title: "Notes",
  twitter: {
    title: "Notes",
  },
};

export default async function Notes({ searchParams }) {
  const childPages = await getNotes();
  return (
    <>
      <div className="markdown">
        <h1>Notes</h1>
        <p>Quick thoughts, observations, and links.</p>
        <hr />
      </div>
      {childPages.map((post) => {
        return (
          <div key={post.id} className="py-4 flex justify-between">
            <div>
              <div className="italic text-sm text-gray-400">
                <DateString date={new Date(post.created_time)} />
              </div>
              <h2 className="font-large font-semibold">
                <Link href={`/notes/${post.id}`}>{post.child_page.title}</Link>
              </h2>
            </div>
          </div>
        );
      })}
    </>
  );
}
