import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // Headers stay put while long entity lists scroll.
      className={cn("sticky top-0 z-10 bg-chrome/95 backdrop-blur [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // Selection is marked by an accent rail on the leading edge, so the row
        // stays readable instead of being flooded with colour.
        "relative border-b border-border/60 transition-colors hover:bg-accent/40 has-aria-expanded:bg-accent/40 data-[state=selected]:bg-accent/60 data-[state=selected]:before:absolute data-[state=selected]:before:inset-y-0 data-[state=selected]:before:left-0 data-[state=selected]:before:w-0.5 data-[state=selected]:before:bg-primary",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Edge cells carry the surface inset (`px-5`) rather than the tighter inter-column
 * rhythm (`px-3`), so the first column's text lines up with the page title, the
 * toolbar, and the pagination bar above and below it. The row itself stays
 * full-bleed, so hover and selection still span the whole width.
 */
const EDGE_INSET = "first:pl-5 last:pr-5"

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 px-3 text-left align-middle text-2xs font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        EDGE_INSET,
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // `h-9` on a cell acts as a *minimum* row height, so every row shares one
        // rhythm regardless of whether its content happens to include a badge or
        // a second line. Without it, row heights track their content and a table
        // reads as ragged.
        "h-9 px-3 py-1.5 align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
        EDGE_INSET,
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
