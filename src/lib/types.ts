export type Profile = {
  id: string;
  name: string;
  phone: string;
  avatar_color: string;
};

export type Trip = {
  id: string;
  name: string;
  country_code: string;
  country_name: string;
  base_currency: string;
  trip_currency: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  emoji: string;
  invite_code: string;
  archived: boolean;
  created_by: string;
  created_at: string;
};

export type TripCategory = {
  id: string;
  trip_id: string;
  key: string;
  label: string;
  emoji: string;
  color: string;
  sort_order: number;
  archived: boolean;
};

export type Member = { trip_id: string; user_id: string; role: 'owner' | 'member'; profile?: Profile };

export type ExpenseShare = { id: string; expense_id: string; user_id: string; amount_base: number };

export type Expense = {
  id: string;
  trip_id: string;
  payer_id: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  fx_rate: number;
  amount_base: number;
  split_mode: 'equal' | 'exact' | 'shares' | 'full';
  spent_at: string;
  note: string | null;
  receipt_path: string | null;
  created_by: string;
  created_at: string;
  expense_shares?: ExpenseShare[];
};

export type Task = {
  id: string;
  trip_id: string;
  title: string;
  notes: string | null;
  assignee_id: string | null;
  due_at: string | null;
  is_done: boolean;
  done_at: string | null;
  est_cost: number | null;
  currency: string | null;
  actual_cost: number | null;
  billable: boolean;
  expense_id: string | null;
  created_by: string;
  created_at: string;
};

export type Settlement = {
  id: string;
  trip_id: string;
  from_user: string;
  to_user: string;
  amount_base: number;
  method: 'bit' | 'cash' | 'bank' | 'paybox' | 'other';
  note: string | null;
  settled_at: string;
};
