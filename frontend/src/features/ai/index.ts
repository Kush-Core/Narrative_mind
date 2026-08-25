/**
 * Public surface of the `ai` slice — the two routed pages and the dock.
 *
 * Everything here is reached through a dynamic `import()` — the router's `lazy`
 * for the pages, `React.lazy` for the dock — so none of it lands in the eager
 * bundle.
 *
 * Deliberately narrow, and deliberately **not** where the describe affordance
 * lives. The four entity descriptors need `DescribeAssist`, and importing it
 * from here would make every entity chunk pull in the Ask and Extract pages
 * behind it. It is exported from `@/features/ai/assist` instead, which imports
 * nothing that a form does not already need. See that file's own note.
 */

export { AskDock } from "@/features/ai/components/AskDock"
export { ASK_QUESTION_PARAM, AskPage } from "@/features/ai/pages/AskPage"
export { ExtractPage } from "@/features/ai/pages/ExtractPage"
