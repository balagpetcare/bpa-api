import * as XLSX from 'xlsx';
import { parseDirectorySheet } from '../clinic-import.service';

function bufferFromRows(rows: Record<string, unknown>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Directory');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const BASE_ROW = {
  'SL': 1,
  'Clinic / Hospital / Vet Point Name': 'Central Veterinary Hospital',
  'Branch / Area': 'Old Dhaka / Kazi Alauddin Road',
  'City Corporation': 'DSCC (inferred)',
  'Address': '48 Kazi Alauddin Road, Dhaka 1000',
  'Contact Number': '01745-137090 / 01711-187477',
  'Normalized Unique Phone(s)': '01745137090 / 01711187477',
  'Primary Phone Key': '01745137090',
  'Phone Duplicate Status': 'Unique primary phone',
  'Google Maps Search URL': 'https://www.google.com/maps/search/?api=1&query=x',
  'Source URL(s)': 'https://mewmewshopbd.com/blog/vets-near-me ; https://www.findoutdoctor.com/2017/06/poshu-hospitals-list-dhaka.html',
  'Record Type': 'Branch/contact-level',
  'Notes': 'Govt central hospital; multiple published numbers',
};

describe('parseDirectorySheet', () => {
  it('parses a well-formed row', () => {
    const [row] = parseDirectorySheet(bufferFromRows([BASE_ROW]));

    expect(row.clinicName).toBe('Central Veterinary Hospital');
    expect(row.branchArea).toBe('Old Dhaka / Kazi Alauddin Road');
    expect(row.phones).toEqual(['01745137090', '01711187477']);
    expect(row.primaryPhone).toBe('01745137090');
    expect(row.notes).toBe('Govt central hospital; multiple published numbers');
  });

  it('never splits a source URL on its own slashes', () => {
    const [row] = parseDirectorySheet(bufferFromRows([BASE_ROW]));

    expect(row.sourceUrls).toEqual([
      'https://mewmewshopbd.com/blog/vets-near-me',
      'https://www.findoutdoctor.com/2017/06/poshu-hospitals-list-dhaka.html',
    ]);
    for (const url of row.sourceUrls) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('converts "N/A" and blank cells to null rather than the literal text', () => {
    const [row] = parseDirectorySheet(
      bufferFromRows([
        {
          ...BASE_ROW,
          'Contact Number': 'N/A',
          'Normalized Unique Phone(s)': '',
          'Primary Phone Key': '',
          'Notes': 'N/A',
        },
      ]),
    );

    expect(row.phones).toEqual([]);
    expect(row.primaryPhone).toBeNull();
    expect(row.notes).toBeNull();
  });

  it('builds a stable import key that does not depend on phone alone', () => {
    const [rowA] = parseDirectorySheet(
      bufferFromRows([{ ...BASE_ROW, 'Clinic / Hospital / Vet Point Name': 'Gulshan Pet-Animal Clinic' }]),
    );
    const [rowB] = parseDirectorySheet(
      bufferFromRows([{ ...BASE_ROW, 'Clinic / Hospital / Vet Point Name': 'Gulshan Pet Clinic' }]),
    );

    // Same primary phone, different clinic name/branch/address -> distinct keys.
    expect(rowA.importKey).not.toBe(rowB.importKey);
  });

  it('produces the identical import key for the identical row parsed twice', () => {
    const buffer = bufferFromRows([BASE_ROW]);
    const [first] = parseDirectorySheet(buffer);
    const [second] = parseDirectorySheet(buffer);

    expect(first.importKey).toBe(second.importKey);
  });

  it('throws a clear error when the Directory sheet is missing', () => {
    const sheet = XLSX.utils.json_to_sheet([{ a: 1 }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'NotDirectory');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    expect(() => parseDirectorySheet(buffer)).toThrow(/Directory/);
  });
});
