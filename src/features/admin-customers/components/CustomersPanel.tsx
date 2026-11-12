import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { AdminCustomersResult } from "../types";
import { formatJoinedDate } from "../utils/format";
import "./AdminCustomers.css";

type CustomersPanelProps = {
  isLoading: boolean;
  result: AdminCustomersResult | null;
  onRefresh: () => void;
  /** The trigger is passed back so the drawer can return focus to it on close. */
  onOpenCustomer: (
    customer: { id: number; name: string },
    trigger: HTMLElement,
  ) => void;
};

export function CustomersPanel({
  isLoading,
  result,
  onRefresh,
  onOpenCustomer,
}: CustomersPanelProps) {
  const [query, setQuery] = useState("");

  const customers = result && result.success === true ? result.customers : [];
  const failureMessage =
    result && result.success === false ? result.message : null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return customers;

    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(needle) ||
        customer.email.toLowerCase().includes(needle),
    );
  }, [customers, query]);

  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2>Customers</h2>
        {result && result.success === true && (
          <span className="admin-muted">{customers.length} records</span>
        )}
      </header>

      <div className="admin-customers-toolbar">
        <label className="admin-customer-filter">
          <span className="admin-visually-hidden">
            Filter customers by name or email
          </span>
          <span className="admin-customer-filter-field">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or email"
            />
          </span>
        </label>

        <button
          type="button"
          className="admin-button"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && !result && <p className="admin-empty">Loading customers…</p>}

      {failureMessage && (
        <p className="admin-empty" role="alert">
          {failureMessage}
        </p>
      )}

      {result &&
        result.success === true &&
        (filtered.length === 0 ? (
          <p className="admin-empty">
            {customers.length === 0
              ? "No customer accounts yet."
              : `No customers match "${query.trim()}".`}
          </p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <caption className="admin-visually-hidden">
                Customer accounts and their booking counts
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Email</th>
                  <th scope="col">Access</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className="admin-cell--right">
                    Bookings
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={(event) =>
                          onOpenCustomer(
                            { id: customer.id, name: customer.name },
                            event.currentTarget,
                          )
                        }
                        aria-label={`View booking history for ${customer.name}`}
                      >
                        {customer.name}
                      </button>
                    </td>
                    <td className="admin-cell--muted">
                      {customer.email || "—"}
                    </td>
                    <td className="admin-cell--muted">{customer.role}</td>
                    <td className="admin-cell--muted">
                      {formatJoinedDate(customer.joinedAt)}
                    </td>
                    <td className="admin-cell--right">
                      {customer.bookingCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
