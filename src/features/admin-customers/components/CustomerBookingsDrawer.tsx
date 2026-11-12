import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../../components/ui/sheet";
import { useCustomerBookings } from "../hooks";
import { formatBookingDate } from "../utils/format";
import type { CustomerBookingStatus } from "../types";
import "./AdminCustomers.css";

const STATUS_ORDER = ["upcoming", "completed", "cancelled"] as const;

const STATUS_LABELS: Record<CustomerBookingStatus, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

type CustomerBookingsDrawerProps = {
  /** `null` closes the drawer; the id drives the fetch. */
  customerId: number | null;
  /** Shown while the request is in flight, when opened from the bookings table. */
  customerName?: string;
  /**
   * The control that opened the drawer. The sheet is driven by state rather than
   * a `SheetTrigger`, so Radix has no trigger to restore to and would drop focus
   * on the document body.
   */
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onShowAllBookings: () => void;
};

export function CustomerBookingsDrawer({
  customerId,
  customerName,
  returnFocusTo,
  onClose,
  onShowAllBookings,
}: CustomerBookingsDrawerProps) {
  const { isLoading, result, refresh } = useCustomerBookings(customerId);
  const customer = result && result.success === true ? result.customer : null;
  const counts = result && result.success === true ? result.counts : null;
  const failureMessage =
    result && result.success === false ? result.message : null;

  const displayName = customer?.name || customerName || "Customer";
  const meta = customer
    ? [customer.email, customer.role, customer.phone].filter(Boolean).join(" · ")
    : "Loading customer details…";

  return (
    <Sheet
      open={customerId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="admin-customer-drawer w-full sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusTo || !document.contains(returnFocusTo)) return;

          event.preventDefault();
          returnFocusTo.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle className="admin-drawer-title">{displayName}</SheetTitle>
          <SheetDescription className="admin-drawer-meta">
            {meta}
          </SheetDescription>
        </SheetHeader>

        <div className="admin-drawer-body">
          {isLoading && <p className="admin-empty">Loading bookings…</p>}

          {!isLoading && failureMessage && (
            <div className="admin-empty" role="alert">
              <p>{failureMessage}</p>
              <button
                type="button"
                className="admin-button"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && result && result.success === true && (
            <>
              <div className="admin-drawer-stats">
                {STATUS_ORDER.map((status) => (
                  <div className="admin-drawer-stat" key={status}>
                    <span>{STATUS_LABELS[status]}</span>
                    <strong>{counts ? counts[status] : "—"}</strong>
                  </div>
                ))}
              </div>

              {result.bookings.length === 0 ? (
                <p className="admin-empty">
                  No test-drive bookings for this customer yet.
                </p>
              ) : (
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <caption className="admin-visually-hidden">
                      Booking history for {displayName}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Ref</th>
                        <th scope="col">Vehicle</th>
                        <th scope="col">Date</th>
                        <th scope="col">Time</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bookings.map((booking) => (
                        <tr key={booking.id}>
                          <td className="admin-cell--muted">#{booking.id}</td>
                          <td>{booking.vehicleName}</td>
                          <td className="admin-cell--muted">
                            {formatBookingDate(booking.date)}
                          </td>
                          <td className="admin-cell--muted">
                            {booking.time || "—"}
                          </td>
                          <td>
                            <span
                              className={`admin-status admin-status--${booking.status}`}
                            >
                              <span className="admin-status-mark" aria-hidden="true" />
                              {STATUS_LABELS[booking.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter className="admin-drawer-footer">
          <button
            type="button"
            className="admin-button"
            onClick={onShowAllBookings}
          >
            View all bookings
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
