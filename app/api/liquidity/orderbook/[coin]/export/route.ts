import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderBook, fetchTicker, normalizeOrderBook } from '@/lib/bitkub';
import { calculateLiquidity } from '@/lib/calculator';
import { DEFAULT_DEPTH, DEFAULT_THRESHOLD } from '@/lib/config';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ coin: string }> };

type Cell = string | number | null;

function xmlEscape(value: Cell) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value: Cell, style = 'Data') {
  const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String';
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function row(values: Cell[], style?: string) {
  return `<Row>${values.map(v => cell(v, style)).join('')}</Row>`;
}

function slipAtLevel(levels: ReturnType<typeof calculateLiquidity>['levels'], index: number, bestBid: number) {
  const level = levels[index];
  if (!level || !level.accru_matched || !level.amount_match || bestBid <= 0) return null;
  let matchedAmount = 0;
  for (let i = 0; i <= index; i++) matchedAmount += levels[i].amount_match ?? 0;
  if (matchedAmount <= 0) return null;
  return ((level.accru_matched - matchedAmount * bestBid) / (matchedAmount * bestBid)) * 100;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { coin } = await params;
  const symbol = coin.toUpperCase();
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 2000, 1), 2000);
  const depth = Number(req.nextUrl.searchParams.get('depth')) || DEFAULT_DEPTH;
  const customVol = req.nextUrl.searchParams.get('custom_vol') ? Number(req.nextUrl.searchParams.get('custom_vol')) : null;
  const threshold = Number(req.nextUrl.searchParams.get('threshold')) || DEFAULT_THRESHOLD;

  const [book, ticker] = await Promise.all([
    fetchOrderBook(`THB_${symbol}`, limit, { bypassCache: true }),
    fetchTicker(),
  ]);
  const currentPrice = ticker[symbol]?.last || ticker[symbol]?.highestBid || 0;
  const rawBookBid = book.bids[0]?.price || 0;
  const normalizedBook = normalizeOrderBook(book, currentPrice);
  const calc = calculateLiquidity(normalizedBook.bids, depth, customVol, threshold);
  const timestamp = new Date();

  const headerRows = [
    row([`${symbol} Order Book Export`], 'Title'),
    row(['Timestamp', timestamp.toISOString()]),
    row(['Requested Orders', limit]),
    row(['Returned Orders', calc.levels.length]),
    row(['Depth %', depth * 100]),
    row(['Threshold %', threshold * 100]),
    row(['Best Bid', currentPrice || calc.best_bid]),
    row(['Book Best Bid', rawBookBid]),
    row(['Price Normalized', rawBookBid > 0 && currentPrice > 0 && Math.abs(currentPrice - rawBookBid) / rawBookBid >= 0.005 ? 'Yes' : 'No']),
    row([]),
    row(['#', 'Amount', 'Price', 'Bid Size', 'Accru Amt', 'Amt Match', 'Sales', 'Accru Match', 'Slip %'], 'Header'),
  ];

  const dataRows = calc.levels.map((level, index) => row([
    index + 1,
    level.amount,
    level.price,
    level.bid_size,
    level.accru_amount,
    level.amount_match ?? 0,
    level.sales_matched ?? 0,
    level.accru_matched ?? 0,
    slipAtLevel(calc.levels, index, currentPrice || calc.best_bid),
  ]));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#E8F6F3" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Data"/>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(symbol)} Order Book">
  <Table>
   <Column ss:Width="48"/><Column ss:Width="110"/><Column ss:Width="90"/><Column ss:Width="110"/>
   <Column ss:Width="110"/><Column ss:Width="110"/><Column ss:Width="110"/><Column ss:Width="120"/><Column ss:Width="80"/>
   ${headerRows.join('')}
   ${dataRows.join('')}
  </Table>
 </Worksheet>
</Workbook>`;

  const filename = `${symbol}-orderbook-${limit}-${timestamp.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xls`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
