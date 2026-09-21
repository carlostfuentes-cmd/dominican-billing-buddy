import * as React from "react";

import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  topScrollbar?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, topScrollbar = true, ...props }, forwardedRef) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null);
    const topRef = React.useRef<HTMLDivElement | null>(null);
    const bottomRef = React.useRef<HTMLDivElement | null>(null);
    const [contentWidth, setContentWidth] = React.useState(0);
    const [hasHorizontalOverflow, setHasHorizontalOverflow] = React.useState(false);
    const syncing = React.useRef(false);

    const setTableRef = React.useCallback(
      (node: HTMLTableElement | null) => {
        tableRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    React.useEffect(() => {
      const table = tableRef.current;
      const bottom = bottomRef.current;
      if (!table || !bottom || !topScrollbar) return;
      const medir = () => {
        setContentWidth(table.scrollWidth);
        setHasHorizontalOverflow(table.scrollWidth > bottom.clientWidth + 1);
      };
      medir();
      const observer = new ResizeObserver(medir);
      observer.observe(table);
      observer.observe(bottom);
      return () => observer.disconnect();
    }, [topScrollbar]);

    const sincronizar = (origen: "arriba" | "abajo") => {
      if (syncing.current) return;
      syncing.current = true;
      const fuente = origen === "arriba" ? topRef.current : bottomRef.current;
      const destino = origen === "arriba" ? bottomRef.current : topRef.current;
      if (fuente && destino) destino.scrollLeft = fuente.scrollLeft;
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    };

    return (
      <>
        {topScrollbar && hasHorizontalOverflow && (
          <div
            ref={topRef}
            className="mb-1 h-4 w-full overflow-x-auto overflow-y-hidden"
            onScroll={() => sincronizar("arriba")}
            aria-label="Desplazar tabla horizontalmente"
          >
            <div className="h-px" style={{ width: contentWidth }} />
          </div>
        )}
        <div
          ref={bottomRef}
          className="relative w-full overflow-auto"
          onScroll={() => sincronizar("abajo")}
        >
          <table
            ref={setTableRef}
            className={cn("w-full caption-bottom text-sm", className)}
            {...props}
          />
        </div>
      </>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-muted/60 [&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/70 transition-colors hover:bg-accent/55 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-3 text-left align-middle text-[11px] font-semibold uppercase text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-3 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
