import { ColDef, Column } from "ag-grid-community";

export function buildTsvString(
  rows: any[],
  colDefs: ColDef[],
  cols?: Column[]
) {
  const fieldsHiddenByUser =
    cols?.filter((col) => !col.isVisible()).map((col) => col.getColId()) ?? [];

  const colDefsToExport = colDefs.filter(
    ({ field, hide }) =>
      field && hide !== true && !fieldsHiddenByUser.includes(field)
  );

  const colHeadersAsTsvRow = colDefsToExport
    .map((item) => item.headerName)
    .join("\t");

  const rowsAsTsvRows = rows
    .map((row) =>
      colDefsToExport.map((colDef) => {
        if (colDef.valueGetter) {
          // @ts-ignore
          return colDef.valueGetter({
            colDef,
            data: row,
          });
        }
        if (colDef.field) {
          return row[colDef.field];
        }
        return " ";
      })
    )
    .map((value) => value.join("\t").replace(/(\r\n|\n|\r)/gm, ""));

  return [colHeadersAsTsvRow, ...rowsAsTsvRows].join("\n");
}

export function buildSentenceCaseString(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function buildSearchValRegexString(searchVal: string) {
  // .*$(searchVal).* performs a partial string match
  // (?i) is a regex inline modifier that makes the search case-insensitive
  return `(?i).*${searchVal}.*`;
}
