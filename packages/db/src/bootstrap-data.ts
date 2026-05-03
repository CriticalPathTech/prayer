import type { PostStatus } from './schema.js';

export interface BootstrapPost {
  authorIndex: number; // index into BOOTSTRAP_USERS
  body: string;
  status: Extract<PostStatus, 'draft' | 'published'>;
  isAnonymous: boolean;
  expiresInDays: number;
}

export interface BootstrapComment {
  postIndex: number; // index into BOOTSTRAP_POSTS
  authorIndex: number; // index into BOOTSTRAP_USERS
  body: string;
}

export const BOOTSTRAP_POSTS: BootstrapPost[] = [
  {
    authorIndex: 1,
    body: 'Praying for our Sunday service this week — that hearts would be open and our community would feel welcomed.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 7,
  },
  {
    authorIndex: 3,
    body: 'My mother is having surgery on Wednesday. Asking for peace for her and our family.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 14,
  },
  {
    authorIndex: 4,
    body: 'Job interview tomorrow morning. Please pray for clarity and confidence.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 1,
  },
  {
    authorIndex: 2,
    body: 'Walking with a youth in a really hard season. Praying for wisdom in how to be present.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 30,
  },
  {
    authorIndex: 3,
    body: 'Anonymous request: struggling with anxiety in my marriage. Asking for grace and patience.',
    status: 'published',
    isAnonymous: true,
    expiresInDays: 14,
  },
  {
    authorIndex: 4,
    body: 'Grateful — the doctor said the test came back clean. Thank you all for praying with us.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 7,
  },
  {
    authorIndex: 1,
    body: 'For our missionaries in East Asia, that doors would open and protection would surround them.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 30,
  },
  {
    authorIndex: 2,
    body: 'Pray for the parents in our church community navigating the start of the school year.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 14,
  },
  {
    authorIndex: 3,
    body: 'My friend lost her father this week. Asking for prayer for her and her three kids.',
    status: 'published',
    isAnonymous: false,
    expiresInDays: 30,
  },
  {
    authorIndex: 4,
    body: 'Anonymous: praying for direction on a big career decision. Whichever way is right, that I would have peace.',
    status: 'draft',
    isAnonymous: true,
    expiresInDays: 7,
  },
];

export const BOOTSTRAP_COMMENTS: BootstrapComment[] = [
  { postIndex: 0, authorIndex: 3, body: 'Praying with you for tomorrow morning.' },
  {
    postIndex: 1,
    authorIndex: 0,
    body: 'Holding your mother and your family in prayer this week.',
  },
  { postIndex: 1, authorIndex: 4, body: 'Will you let us know how the surgery goes?' },
  { postIndex: 2, authorIndex: 1, body: 'Praying — let us know how it went.' },
  { postIndex: 5, authorIndex: 2, body: 'Praising God with you.' },
  { postIndex: 8, authorIndex: 0, body: 'So sorry to hear. Praying for your friend and her kids.' },
];
