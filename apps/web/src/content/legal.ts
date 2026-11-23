import { brand } from "@/config/brand";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
};
export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

const name = brand.name;
const contact = brand.supportEmail;

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "terms",
    title: "Terms of service",
    summary: `The rules for using ${name}. In short: use it lawfully, respect fair use, and keep your own copies of important files.`,
    updated: "2026-11-23",
    sections: [
      {
        id: "agreement",
        title: "Agreement",
        paragraphs: [
          `By using ${name} you agree to these terms. If you use it on behalf of an organization, you confirm you can accept them for that organization.`,
        ],
      },
      {
        id: "service",
        title: "The service",
        paragraphs: [
          `${name} provides free document processing tools through a website and an API. Features may change as the service evolves; tools that are not yet available are clearly marked.`,
        ],
      },
      {
        id: "free",
        title: "Free use and fair use",
        paragraphs: [
          "The service is free. To keep it fast for everyone, fair-use limits apply to file sizes, files per task, concurrent jobs, tasks per hour and day, and shared AI requests. The current limits are published at /api/v1/fair-use. We may adjust them to protect the service.",
        ],
      },
      {
        id: "accounts",
        title: "Accounts",
        paragraphs: [
          "Accounts are optional. You are responsible for keeping your password, recovery codes and API keys secure, and for activity under your account.",
          "You can export your data and delete your account at any time from Settings.",
          "If you create or join a team, team owners and admins can see and manage files in the team library and the team’s shared workflows according to each member’s role.",
        ],
      },
      {
        id: "content",
        title: "Your content",
        paragraphs: [
          "You keep all rights to the files you upload. You grant us only the limited permission needed to process them and return the results to you.",
          "Files processed as tasks are deleted automatically after the retention period described in the privacy policy. Files you save to My files stay until you delete them, and deleted files sit in the trash for 30 days before they are erased. Keep your own copies of anything important.",
          "Documents you send for signature are held only as long as the request exists and are erased when you delete the request or your account.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Acceptable use",
        paragraphs: ["You must follow the acceptable use policy, which forms part of these terms."],
      },
      {
        id: "api",
        title: "API keys",
        paragraphs: [
          "API keys are personal to your account and can be limited to specific scopes. Don’t share them publicly. We may revoke keys used to abuse the service.",
          "Webhooks you configure may only point to public addresses you control or are authorized to use.",
        ],
      },
      {
        id: "warranty",
        title: "No warranty",
        paragraphs: [
          "The service is provided as is. We work hard on quality, but we don’t guarantee that it will be uninterrupted, error-free or suitable for any particular purpose.",
        ],
      },
      {
        id: "liability",
        title: "Limitation of liability",
        paragraphs: [
          "To the extent permitted by law, we are not liable for indirect or consequential losses, or for loss of data you did not keep a copy of.",
        ],
      },
      {
        id: "changes",
        title: "Changes",
        paragraphs: [
          "We may update these terms. Material changes will be announced on the site before they take effect.",
        ],
      },
      { id: "contact", title: "Contact", paragraphs: [`Questions about these terms: ${contact}.`] },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What we collect, why, how long we keep it and the choices you have.",
    updated: "2026-11-23",
    sections: [
      {
        id: "summary",
        title: "Summary",
        bullets: [
          "We process your files only to give you the result, then delete them automatically.",
          "We never read your files or put their contents in logs.",
          "Accounts are optional and collect as little as possible.",
          "We don’t use advertising or third-party analytics cookies.",
        ],
      },
      {
        id: "files",
        title: "Files you upload",
        paragraphs: [
          "Files are encrypted at rest and processed by automated workers in isolated environments. Inputs and outputs are deleted one hour after processing, or after 24 hours if you are signed in and choose that setting. You can delete them immediately with Delete now.",
          "We keep basic task metadata, such as the tool used, file names, file sizes, page counts and timestamps, so you can see your history and so we can operate the service. For guests, file names are erased as soon as the files are deleted, and the remaining minimal record is removed after 48 hours; it exists only to apply daily fair-use limits. For signed-in users, task history stays until you delete your account.",
        ],
      },
      {
        id: "library",
        title: "My files, teams and signatures",
        paragraphs: [
          "If you choose to save results to My files, they are kept encrypted until you delete them; deleted files stay in the trash for 30 days and are then erased. Team libraries are visible to members according to their role. Signature requests keep the document, the signers’ email addresses and an audit trail until you delete the request. Deleting your account erases your library and signature data.",
          "If you connect Google Drive, Dropbox or OneDrive, we store the access token encrypted, use it only to import the files you pick, and delete it when you disconnect.",
        ],
      },
      {
        id: "account",
        title: "Account information",
        bullets: [
          "Email address and optional display name",
          "Your password, stored only as an Argon2id hash",
          "Identifiers from Google or GitHub if you sign in with them",
          "Two-step verification secrets, encrypted at rest, and hashed recovery codes",
          "Session records with the browser’s user agent string",
          "API keys, stored only as hashes",
          "If you save your own AI provider key, it is encrypted at rest and used only for your requests",
        ],
      },
      {
        id: "technical",
        title: "Technical data",
        paragraphs: [
          "To enforce fair-use limits and prevent abuse we store a one-way hash of your IP address with each task. We also record technical logs such as request timings and error types. Logs never contain file contents, and sensitive fields like passwords and tokens are redacted.",
        ],
      },
      {
        id: "contact-messages",
        title: "Messages you send us",
        paragraphs: [
          "If you use the contact form we keep your name, email, topic and message so we can reply.",
        ],
      },
      {
        id: "processors",
        title: "Service providers",
        paragraphs: [
          "We use infrastructure providers for hosting, storage and email delivery. If error monitoring is enabled, technical error reports are sent to our monitoring provider without personal file contents. When you use an AI tool, the text needed for that request is sent to the shared AI provider, or to the provider whose key you saved. Webhook deliveries you configure are sent to the addresses you choose.",
        ],
      },
      {
        id: "rights",
        title: "Your rights and choices",
        bullets: [
          "Download your data from Settings",
          "Delete your account and all stored files from Settings",
          "Change your retention preference at any time",
          `Contact ${contact} for any other privacy request`,
        ],
      },
      {
        id: "children",
        title: "Children",
        paragraphs: [
          "The service is not directed at children under 13, and we don’t knowingly collect their personal information.",
        ],
      },
      {
        id: "changes",
        title: "Changes",
        paragraphs: ["We will post any changes to this policy here and update the date above."],
      },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    summary:
      "We use only the cookies and browser storage needed to run the service. No advertising or tracking cookies.",
    updated: "2026-11-23",
    sections: [
      {
        id: "cookies",
        title: "Cookies we set",
        table: {
          headers: ["Name", "Purpose", "Duration"],
          rows: [
            [
              "pn_anon",
              "Links your guest tasks to your browser so only you can see them",
              "1 year",
            ],
            ["pn_csrf", "Protects forms and uploads against cross-site request forgery", "30 days"],
            ["pn_access", "Keeps you signed in (signed-in users only)", "15 minutes"],
            ["pn_refresh", "Renews your session securely (signed-in users only)", "30 days"],
            ["pn_oauth", "Protects Google or GitHub sign-in against forgery", "10 minutes"],
            ["NEXT_LOCALE", "Remembers your language", "Session or until changed"],
          ],
        },
      },
      {
        id: "storage",
        title: "Browser storage",
        table: {
          headers: ["Key", "Purpose"],
          rows: [
            ["theme", "Remembers light, dark or system theme"],
            [
              "tool-preferences",
              "Your favorite and recently used tools, stored only on your device",
            ],
            ["announcement-dismissed:*", "Remembers announcements you closed"],
            [
              "service worker cache",
              "Lets the installed app open offline. It holds site assets only, never your files",
            ],
          ],
        },
      },
      {
        id: "choices",
        title: "Your choices",
        paragraphs: [
          "All of these are strictly necessary or store preferences you set yourself, so no consent banner is needed. You can clear them at any time in your browser settings; you’ll be signed out and your preferences reset.",
        ],
      },
    ],
  },
  {
    slug: "acceptable-use",
    title: "Acceptable use policy",
    summary: "Use the service for lawful purposes and don’t try to break it for others.",
    updated: "2026-11-23",
    sections: [
      {
        id: "prohibited",
        title: "You must not",
        bullets: [
          "Upload content you don’t have the right to process",
          "Process illegal content, including content that exploits children",
          "Use the service to distribute malware or phishing material",
          "Attempt to bypass fair-use limits, for example by rotating accounts or addresses",
          "Probe, scan or attack the service or other users, except through responsible disclosure",
          "Use the URL import or webhooks to reach internal or private network resources",
          "Use signature requests to deceive recipients or to forge another person’s signature",
          "Resell access to the service in a way that misrepresents it as your own",
        ],
      },
      {
        id: "enforcement",
        title: "Enforcement",
        paragraphs: [
          "We may suspend tasks, revoke API keys or disable accounts that break this policy, and report illegal activity where required by law.",
        ],
      },
      {
        id: "reporting",
        title: "Reporting",
        paragraphs: [`Report abuse or vulnerabilities to ${contact} or through the contact form.`],
      },
    ],
  },
];

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}
