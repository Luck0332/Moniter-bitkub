import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleGetSummary, handleGetOrderbook } from './handlers/liquidity.js';
import { handleGetPrices } from './handlers/prices.js';
import {
  handleGetLoans, handleGetLoan, handleCreateLoan,
  handleUpdateLoan, handleDeleteLoan, handleCloseLoan, handleLoanConfig,
} from './handlers/loans.js';

const app = new Hono();

// CORS for Pages ↔ Worker cross-origin (if needed)
app.use('/api/*', cors());

// Liquidity
app.get('/api/summary', handleGetSummary);
app.get('/api/orderbook/:symbol', handleGetOrderbook);

// Prices
app.get('/api/prices', handleGetPrices);

// Loans
app.get('/api/loan-config', handleLoanConfig);
app.get('/api/loans', handleGetLoans);
app.get('/api/loans/:id', handleGetLoan);
app.post('/api/loans', handleCreateLoan);
app.put('/api/loans/:id', handleUpdateLoan);
app.delete('/api/loans/:id', handleDeleteLoan);
app.post('/api/loans/:id/close', handleCloseLoan);

export default app;
