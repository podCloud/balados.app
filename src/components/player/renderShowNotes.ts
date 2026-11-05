import DOMPurify from "dompurify";
import { Marked } from "marked";

const markedInstance = new Marked({ breaks: true, gfm: true });

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "pre",
    "hr",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "target", "rel", "width", "height"],
  FORCE_BODY: true,
};

/** Render an episode description (markdown or HTML) to sanitized HTML. */
export const renderShowNotes = (description: string): string => {
  if (!description) return "";
  const rawHtml = markedInstance.parse(description) as string;
  return DOMPurify.sanitize(rawHtml, { ...PURIFY_CONFIG, RETURN_TRUSTED_TYPE: false }) as string;
};
