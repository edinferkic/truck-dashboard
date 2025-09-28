import { z } from "zod";

// Common coercions
const money = z.coerce.number().min(0).max(999999999.99);
const miles = z.coerce.number().int().min(0);
const dateStr = z.coerce.date().transform(d => d.toISOString().slice(0,10)); // YYYY-MM-DD

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6).max(100)
  }),
  params: z.object({}),
  query: z.object({})
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }),
  params: z.object({}),
  query: z.object({})
});

const loadBase = z.object({
  pickup_date: dateStr,
  delivery_date: dateStr,
  origin: z.string().min(1),
  destination: z.string().min(1),
  miles,
  gross_pay: money,
  broker_fee: money.optional().default(0),
  fuel_cost: money.optional().default(0),
  tolls: money.optional().default(0),
  maintenance_cost: money.optional().default(0),
  other_costs: money.optional().default(0),
  notes: z.string().optional().default(""),
  status: z.enum(["planned","in_transit","completed","canceled"]).optional().default("completed")
});

export const createLoadSchema = z.object({
  body: loadBase,
  params: z.object({}),
  query: z.object({})
});

export const updateLoadSchema = z.object({
  body: loadBase.partial(),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({})
});

export const idParamSchema = z.object({
  body: z.object({}),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({})
});

const expenseBase = z.object({
  expense_date: dateStr,
  category: z.string().min(1),
  description: z.string().optional().default(""),
  amount: money
});

export const createExpenseSchema = z.object({
  body: expenseBase,
  params: z.object({}),
  query: z.object({})
});

export const updateExpenseSchema = z.object({
  body: expenseBase.partial(),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({})
});

export const weeklyReportSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
});
