import {
  AlertCircle,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useBookingHistory } from "../hooks/useBookingHistory";
import { groupBookingHistory } from "../utils/bookingHistory";
import type { BookingHistoryItem } from "../types";
import "./BookingHistory.css";

const TABS = ["upcoming", "completed", "cancelled"] as const;
type BookingTab = (typeof TABS)[number];

const TAB_LABELS: Record<BookingTab, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

const EMPTY_GROUP_COPY: Record<BookingTab, string> = {
  upcoming: "No upcoming test drives.",
  completed: "No completed test drives yet.",
  cancelled: "No cancelled test drives.",
};

function formatBookingDate(date: string) {
  if (!date) return "Date to be confirmed";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type BookingRowProps = {
  booking: BookingHistoryItem;
  isConfirming: boolean;
  isCancelling: boolean;
  onAskCancel: (bookingId: string) => void;
  onConfirmCancel: (bookingId: string) => void;
  onKeep: () => void;
};

function BookingRow({
  booking,
  isConfirming,
  isCancelling,
  onAskCancel,
  onConfirmCancel,
  onKeep,
}: BookingRowProps) {
  const when = `${formatBookingDate(booking.date)}${
    booking.time ? ` at ${booking.time}` : ""
  }`;

  return (
    <Card>
      <CardContent className="booking-item">
        <div className="booking-item-copy">
          <strong>{booking.vehicleName}</strong>
          <p>
            <time dateTime={booking.date || undefined}>{when}</time>
          </p>
        </div>

        <span className={`booking-status booking-${booking.status}`}>
          {booking.status}
        </span>

        {booking.canCancel && (
          <div className="booking-actions">
            {isConfirming ? (
              <>
                <button
                  type="button"
                  className="booking-cancel booking-cancel--confirm"
                  /* The confirm step stays mounted while the request is in
                     flight so the label can report progress; on success the
                     refreshed list moves the row out of this tab. */
                  onClick={() => onConfirmCancel(booking.id)}
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="booking-cancel"
                  onClick={onKeep}
                  disabled={isCancelling}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="booking-cancel"
                onClick={() => onAskCancel(booking.id)}
                disabled={isCancelling}
                aria-label={`Cancel the test drive for ${booking.vehicleName} on ${when}`}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingGroup({
  tab,
  items,
  confirmingId,
  pendingCancelId,
  onAskCancel,
  onConfirmCancel,
  onKeep,
}: {
  tab: BookingTab;
  items: BookingHistoryItem[];
  confirmingId: string | null;
  pendingCancelId: string | null;
  onAskCancel: (bookingId: string) => void;
  onConfirmCancel: (bookingId: string) => void;
  onKeep: () => void;
}) {
  if (items.length === 0) {
    return <div className="booking-state">{EMPTY_GROUP_COPY[tab]}</div>;
  }

  return (
    <div className="booking-list">
      {items.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          isConfirming={confirmingId === booking.id}
          isCancelling={pendingCancelId === booking.id}
          onAskCancel={onAskCancel}
          onConfirmCancel={onConfirmCancel}
          onKeep={onKeep}
        />
      ))}
    </div>
  );
}

export function BookingHistory({ showTitle = true }: { showTitle?: boolean } = {}) {
  const {
    isLoading,
    result,
    refresh,
    cancelBooking,
    pendingCancelId,
    cancelError,
    cancelNotice,
  } = useBookingHistory();
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const tabRefs = useRef<Record<BookingTab, HTMLButtonElement | null>>({
    upcoming: null,
    completed: null,
    cancelled: null,
  });
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  // Only the first load swaps the card for a skeleton. A refresh (after a
  // cancellation or a retry) keeps the tabs mounted, which both avoids a
  // full-card flash and keeps the tab refs available for focus restoration.
  if (isLoading && !result) {
    return (
      <Card className="profile-settings-wide">
        <CardContent className="booking-loading">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // `strict` is off in tsconfig.check.json, so a boolean discriminant only
  // narrows through an explicit equality check rather than a truthiness test.
  const failureMessage =
    result && result.success === false ? result.message : null;

  if (!result || result.success === false) {
    return (
      <Card className="profile-settings-wide">
        <CardContent className="booking-state booking-error">
          <AlertCircle size={22} aria-hidden="true" />
          <p>{failureMessage ?? "Booking history is unavailable."}</p>
          <button
            type="button"
            className="booking-retry"
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const groups = groupBookingHistory(result.bookings);

  const focusTab = (tab: BookingTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  };

  const moveTab = (current: BookingTab, direction: 1 | -1) => {
    const index = TABS.indexOf(current);
    focusTab(TABS[(index + direction + TABS.length) % TABS.length]);
  };

  /**
   * Cancelling unmounts the row that held focus, which would drop keyboard and
   * screen-reader users at the top of the document. On success focus returns to
   * the tab that owns the list; on failure it moves to the error message.
   */
  const handleConfirmCancel = async (bookingId: string) => {
    const cancelled = await cancelBooking(bookingId);
    setConfirmingId(null);

    // Focus after the commit that renders the new state (the refreshed list or
    // the error message), not while React is still applying it.
    requestAnimationFrame(() => {
      if (cancelled) {
        tabRefs.current[activeTab]?.focus();
        return;
      }

      errorRef.current?.focus();
    });
  };

  return (
    <Card className="profile-settings-wide">
      {(showTitle || result.mock) && (
        <CardHeader>
          {showTitle && (
            <CardTitle className="booking-title">
              <CalendarClock size={22} aria-hidden="true" />
              Test-drive history
            </CardTitle>
          )}
          {result.mock && (
            <p className="booking-mock">
              Synthetic development booking data is displayed.
            </p>
          )}
        </CardHeader>
      )}
      <CardContent>
        {(cancelNotice || cancelError) && (
          <div className="booking-feedback">
            {cancelNotice && (
              <p className="booking-notice" role="status">
                {cancelNotice}
              </p>
            )}
            {cancelError && (
              <p
                className="booking-cancel-error"
                role="alert"
                tabIndex={-1}
                ref={errorRef}
              >
                {cancelError}
              </p>
            )}
          </div>
        )}

        <div role="tablist" aria-label="Booking history" className="booking-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`booking-tab-${tab}`}
              className="booking-tab"
              aria-selected={activeTab === tab}
              aria-controls={`booking-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              ref={(element) => {
                tabRefs.current[tab] = element;
              }}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  moveTab(tab, 1);
                  return;
                }

                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveTab(tab, -1);
                  return;
                }

                if (event.key === "Home") {
                  event.preventDefault();
                  focusTab("upcoming");
                  return;
                }

                if (event.key === "End") {
                  event.preventDefault();
                  focusTab("cancelled");
                }
              }}
            >
              {TAB_LABELS[tab]} ({groups[tab].length})
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`booking-panel-${activeTab}`}
          aria-labelledby={`booking-tab-${activeTab}`}
          className="booking-panel"
        >
          <BookingGroup
            tab={activeTab}
            items={groups[activeTab]}
            confirmingId={confirmingId}
            pendingCancelId={pendingCancelId}
            onAskCancel={setConfirmingId}
            onConfirmCancel={(bookingId) => void handleConfirmCancel(bookingId)}
            onKeep={() => setConfirmingId(null)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
