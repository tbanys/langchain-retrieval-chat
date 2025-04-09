import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps {
  headers: string[];
  rows: string[][];
  maxRows?: number;
}

export function DataTable({ headers, rows, maxRows = 5 }: DataTableProps) {
  const displayRows = rows.slice(0, maxRows);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header, i) => (
              <TableHead key={i} className="whitespace-nowrap">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j} className="font-mono">
                  {cell || "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > maxRows && (
        <div className="py-2 px-4 text-sm text-muted-foreground text-center border-t">
          Showing {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  );
} 