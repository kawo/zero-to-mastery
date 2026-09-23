/**
 * Shopping list exports: CSV (opens in Excel, Numbers, Google Sheets), JSON
 * (for other apps or scripts), and print (see the print styles in the page).
 */
import type { ShoppingItem } from './aggregate';
import type { ShoppingRecipe } from './db';

/** One CSV field: quoted, with quotes doubled, so commas and line breaks are safe. */
function csvField(value: string | number | boolean): string {
  const text = String(value);
  // A leading =, +, - or @ would make spreadsheets run it as a formula
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(items: ShoppingItem[], checked: Set<string>): string {
  const header = ['Aisle', 'Item', 'Quantity', 'Notes', 'For recipes', 'Ticked'];
  const rows = items.map(item => [
    item.aisle,
    item.name,
    item.quantity,
    item.notes.join('; '),
    item.recipes.join('; '),
    checked.has(item.key) ? 'yes' : 'no'
  ]);
  // A byte-order mark so Excel reads the file as UTF-8 ("jalapeño", "½")
  return '﻿' + [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function toJson(items: ShoppingItem[], checked: Set<string>, recipes: ShoppingRecipe[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      recipes: recipes.map(recipe => ({ id: recipe.id, name: recipe.meal.name, batches: recipe.batches })),
      items: items.map(item => ({
        name: item.name,
        aisle: item.aisle,
        quantity: item.quantity || null,
        amounts: item.amounts,
        notes: item.notes,
        recipes: item.recipes,
        addedByHand: Boolean(item.extra),
        ticked: checked.has(item.key)
      }))
    },
    null,
    2
  );
}

/** Saves text as a file via a temporary link (works offline; nothing is uploaded). */
export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportFilename = (extension: string) => `shopping-list-${new Date().toISOString().slice(0, 10)}.${extension}`;
