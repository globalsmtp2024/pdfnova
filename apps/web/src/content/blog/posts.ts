import { brand } from "@/config/brand";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  minutes: number;
};

export const POSTS: BlogPost[] = [
  {
    slug: "merge-pdfs-without-losing-bookmarks",
    title: "How to merge PDFs without losing your bookmarks",
    description:
      "Why bookmarks break when documents are combined, and a reliable way to keep every outline intact.",
    date: "2026-11-19",
    author: `The ${brand.name} team`,
    tags: ["Merge", "Guides"],
    minutes: 2,
  },
  {
    slug: "page-ranges-explained",
    title: "Page ranges explained: 1-3, 5, 8-last and more",
    description:
      "A practical reference for selecting exactly the pages you need, with examples you can copy.",
    date: "2026-11-19",
    author: `The ${brand.name} team`,
    tags: ["Guides", "Basics"],
    minutes: 1,
  },
  {
    slug: "what-happens-to-uploaded-files",
    title: "What actually happens to a file you upload",
    description:
      "A step-by-step look at encryption, isolated processing and automatic deletion, without the marketing gloss.",
    date: "2026-11-19",
    author: `The ${brand.name} team`,
    tags: ["Privacy", "Security"],
    minutes: 2,
  },
];

export function findPost(slug: string): BlogPost | undefined {
  return POSTS.find((post) => post.slug === slug);
}
