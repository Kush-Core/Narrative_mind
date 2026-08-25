/**
 * The narrow public surface the four entity descriptors import.
 *
 * **Do not add imports to this file, and do not re-export it from `index.ts`.**
 * It exists purely to keep a dependency edge thin. Every entity descriptor
 * needs `DescribeAssist`; if they reached it through `@/features/ai`, each of
 * the four entity chunks would pull the Ask and Extract pages — router-only
 * code they never render — along behind it.
 *
 * `shared/entity-kit/route-params.ts` carries the same warning for the same
 * reason, after one convenience import there once dragged ~137 kB into the
 * eager bundle. That regression typechecked, linted, and passed the whole test
 * suite; the only thing that catches it is looking at the built chunks.
 */

export { DescribeAssist } from "@/features/ai/components/DescribeAssist"
